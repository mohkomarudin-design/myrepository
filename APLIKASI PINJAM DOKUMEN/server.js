const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Untuk base64 signature
app.use(express.static(__dirname)); // Serve index.html & static files

// =========================================================================
// API: DASHBOARD
// =========================================================================
app.get('/api/dashboard', (req, res) => {
    try {
        const sedangDipinjam = db.prepare(`
            SELECT COUNT(DISTINCT id_transaksi) as total 
            FROM trx_peminjaman 
            WHERE status_keseluruhan IN ('Dipinjam', 'Kembali Sebagian')
        `).get();

        const terlambat = db.prepare(`
            SELECT COUNT(*) as total 
            FROM trx_peminjaman 
            WHERE batas_waktu < date('now') 
            AND status_keseluruhan IN ('Dipinjam', 'Kembali Sebagian')
        `).get();

        const totalBulanIni = db.prepare(`
            SELECT COUNT(*) as total 
            FROM trx_peminjaman 
            WHERE strftime('%Y-%m', tgl_pinjam) = strftime('%Y-%m', 'now')
        `).get();

        res.json({
            sedangDipinjam: sedangDipinjam.total,
            terlambat: terlambat.total,
            totalBulanIni: totalBulanIni.total
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: TRANSAKSI PEMINJAMAN
// =========================================================================
app.get('/api/transaksi', (req, res) => {
    try {
        const transaksi = db.prepare(`
            SELECT 
                t.id_transaksi,
                t.tgl_pinjam,
                t.batas_waktu,
                t.nama_peminjam,
                t.status_keseluruhan,
                t.ttd_peminjam,
                t.ttd_pic,
                d.nama_divisi,
                d.kategori,
                COUNT(dt.id_detail) as jml_dokumen,
                SUM(CASE WHEN dt.status_dokumen = 'Sudah Kembali' THEN 1 ELSE 0 END) as jml_kembali
            FROM trx_peminjaman t
            JOIN master_divisi d ON t.id_divisi = d.id_divisi
            LEFT JOIN detail_peminjaman dt ON t.id_transaksi = dt.id_transaksi
            GROUP BY t.id_transaksi
            ORDER BY t.tgl_pinjam DESC
        `).all();

        // Cek keterlambatan dan update status
        const now = new Date().toISOString().split('T')[0];
        for (const trx of transaksi) {
            if (trx.batas_waktu < now && trx.status_keseluruhan !== 'Selesai') {
                trx.status_keseluruhan = 'Terlambat';
                db.prepare(`UPDATE trx_peminjaman SET status_keseluruhan = 'Terlambat' WHERE id_transaksi = ?`)
                    .run(trx.id_transaksi);
            }
        }

        res.json(transaksi);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detail transaksi
app.get('/api/transaksi/:id', (req, res) => {
    try {
        const trx = db.prepare(`
            SELECT t.*, d.nama_divisi 
            FROM trx_peminjaman t 
            JOIN master_divisi d ON t.id_divisi = d.id_divisi 
            WHERE t.id_transaksi = ?
        `).get(req.params.id);

        if (!trx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

        const details = db.prepare(`
            SELECT dp.*, md.nama_dokumen 
            FROM detail_peminjaman dp 
            JOIN master_dokumen md ON dp.no_dokumen = md.no_dokumen 
            WHERE dp.id_transaksi = ?
        `).all(req.params.id);

        res.json({ ...trx, details });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buat peminjaman baru
app.post('/api/peminjaman', (req, res) => {
    try {
        const { batas_waktu, id_divisi, nama_peminjam, dokumen, ttd_peminjam, ttd_pic, file_lampiran } = req.body;
        const tgl_pinjam = new Date().toISOString().split('T')[0];

        // Generate ID transaksi
        const bulan = String(new Date().getMonth() + 1).padStart(2, '0');
        const tahun = String(new Date().getFullYear()).slice(-2);
        const lastTrx = db.prepare(`
            SELECT id_transaksi FROM trx_peminjaman 
            WHERE id_transaksi LIKE ? 
            ORDER BY id_transaksi DESC LIMIT 1
        `).get(`TRX-${tahun}${bulan}-%`);

        let nextNum = 1;
        if (lastTrx) {
            const parts = lastTrx.id_transaksi.split('-');
            nextNum = parseInt(parts[2]) + 1;
        }
        const id_transaksi = `TRX-${tahun}${bulan}-${String(nextNum).padStart(3, '0')}`;

        const insertTrx = db.prepare(`
            INSERT INTO trx_peminjaman (id_transaksi, tgl_pinjam, batas_waktu, id_divisi, nama_peminjam, file_lampiran, ttd_peminjam, ttd_pic, status_keseluruhan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Dipinjam')
        `);

        const insertDetail = db.prepare(`
            INSERT INTO detail_peminjaman (id_transaksi, no_dokumen, status_dokumen)
            VALUES (?, ?, 'Dipinjam')
        `);

        const updateDok = db.prepare(`
            UPDATE master_dokumen SET status = 'Dipinjam' WHERE no_dokumen = ?
        `);

        const transaction = db.transaction(() => {
            insertTrx.run(id_transaksi, tgl_pinjam, batas_waktu, id_divisi, nama_peminjam, file_lampiran || null, ttd_peminjam || 'n/a', ttd_pic || 'n/a');

            for (const noDoc of dokumen) {
                insertDetail.run(id_transaksi, noDoc);
                updateDok.run(noDoc);
            }
        });

        transaction();
        res.json({ success: true, id_transaksi });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: PENGEMBALIAN
// =========================================================================
app.post('/api/pengembalian', (req, res) => {
    try {
        const { id_transaksi, dokumen_kembali, nama_pengembali, ttd_pengembali, ttd_pic } = req.body;
        const tgl_kembali = new Date().toISOString().split('T')[0];

        const updateDetail = db.prepare(`
            UPDATE detail_peminjaman 
            SET status_dokumen = 'Sudah Kembali', tgl_dikembalikan = ? 
            WHERE id_transaksi = ? AND no_dokumen = ?
        `);

        const updateDokumen = db.prepare(`
            UPDATE master_dokumen SET status = 'Tersedia' WHERE no_dokumen = ?
        `);

        const insertLog = db.prepare(`
            INSERT INTO log_pengembalian (id_transaksi, tgl_kembali, nama_pengembali, ttd_pengembali, ttd_pic)
            VALUES (?, ?, ?, ?, ?)
        `);

        const transaction = db.transaction(() => {
            for (const noDoc of dokumen_kembali) {
                updateDetail.run(tgl_kembali, id_transaksi, noDoc);
                updateDokumen.run(noDoc);
            }

            insertLog.run(id_transaksi, tgl_kembali, nama_pengembali, ttd_pengembali || 'n/a', ttd_pic || 'n/a');

            // Cek apakah semua dokumen sudah kembali
            const remaining = db.prepare(`
                SELECT COUNT(*) as total 
                FROM detail_peminjaman 
                WHERE id_transaksi = ? AND status_dokumen = 'Dipinjam'
            `).get(id_transaksi);

            let newStatus = 'Kembali Sebagian';
            if (remaining.total === 0) newStatus = 'Selesai';

            db.prepare(`UPDATE trx_peminjaman SET status_keseluruhan = ? WHERE id_transaksi = ?`)
                .run(newStatus, id_transaksi);
        });

        transaction();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: PENYERAHAN DOKUMEN BARU
// =========================================================================
app.post('/api/penyerahan', (req, res) => {
    try {
        const { nama_penyerah, id_divisi, dokumen, ttd_penyerah, ttd_pic } = req.body;
        const tgl_penyerahan = new Date().toISOString().split('T')[0];

        // Generate ID penyerahan
        const bulan = String(new Date().getMonth() + 1).padStart(2, '0');
        const tahun = String(new Date().getFullYear()).slice(-2);
        const lastRcv = db.prepare(`
            SELECT id_penyerahan FROM trx_penyerahan 
            WHERE id_penyerahan LIKE ? 
            ORDER BY id_penyerahan DESC LIMIT 1
        `).get(`RCV-${tahun}${bulan}-%`);

        let nextNum = 1;
        if (lastRcv) {
            const parts = lastRcv.id_penyerahan.split('-');
            nextNum = parseInt(parts[2]) + 1;
        }
        const id_penyerahan = `RCV-${tahun}${bulan}-${String(nextNum).padStart(3, '0')}`;

        const insertPenyerahan = db.prepare(`
            INSERT INTO trx_penyerahan (id_penyerahan, tgl_penyerahan, nama_penyerah, id_divisi, ttd_penyerah, ttd_pic)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const insertDokumen = db.prepare(`
            INSERT INTO master_dokumen (no_dokumen, nama_dokumen, tahun, jenis_dokumen, status, file_path)
            VALUES (?, ?, ?, ?, 'Tersedia', ?)
        `);

        const transaction = db.transaction(() => {
            insertPenyerahan.run(id_penyerahan, tgl_penyerahan, nama_penyerah, id_divisi, ttd_penyerah || 'n/a', ttd_pic || 'n/a');

            for (const doc of dokumen) {
                insertDokumen.run(doc.no, doc.nama, doc.tahun, doc.jenis, doc.file_path || null);
            }
        });

        transaction();
        res.json({ success: true, id_penyerahan });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: MASTER DOKUMEN
// =========================================================================
app.get('/api/dokumen', (req, res) => {
    try {
        const docs = db.prepare('SELECT * FROM master_dokumen ORDER BY no_dokumen').all();
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: MASTER DIVISI
// =========================================================================
app.get('/api/divisi', (req, res) => {
    try {
        const divisi = db.prepare('SELECT * FROM master_divisi ORDER BY kategori, nama_divisi').all();
        res.json(divisi);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/divisi', (req, res) => {
    try {
        const { kategori, nama_divisi } = req.body;
        db.prepare('INSERT INTO master_divisi (kategori, nama_divisi) VALUES (?, ?)').run(kategori, nama_divisi);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/divisi/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM master_divisi WHERE id_divisi = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// START SERVER
// =========================================================================
app.listen(PORT, () => {
    console.log(`\n🚀 SIONE Server berjalan di http://localhost:${PORT}`);
    console.log(`📂 Buka browser dan akses: http://localhost:${PORT}\n`);
});
