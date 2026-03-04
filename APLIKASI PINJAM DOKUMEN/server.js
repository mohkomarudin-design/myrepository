const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('./database');

const app = express();
const PORT = 3000;

// Create uploads directory
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safeName = req.params.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_') + ext;
        cb(null, safeName);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// =========================================================================
// API: ADMIN LOGIN & PASSWORD MANAGEMENT
// =========================================================================

// Login admin (verifikasi password dari database)
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;
        const admin = db.prepare('SELECT password_hash FROM admin_settings WHERE id = 1').get();
        if (!admin) return res.status(500).json({ error: 'Admin belum dikonfigurasi' });

        if (db.verifyPassword(password, admin.password_hash)) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Kata sandi salah' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ubah password admin
app.post('/api/admin/password', (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        if (!new_password || new_password.length < 4) {
            return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
        }
        const admin = db.prepare('SELECT password_hash FROM admin_settings WHERE id = 1').get();
        if (!admin) return res.status(500).json({ error: 'Admin belum dikonfigurasi' });

        if (!db.verifyPassword(old_password, admin.password_hash)) {
            return res.status(403).json({ error: 'Password lama salah' });
        }

        const newHash = db.hashPassword(new_password);
        db.prepare('UPDATE admin_settings SET password_hash = ?, reset_token = NULL WHERE id = 1').run(newHash);
        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate reset file
app.post('/api/admin/generate-reset', (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 jam
        db.prepare('UPDATE admin_settings SET reset_token = ?, reset_token_expiry = ? WHERE id = 1').run(token, expiry);

        const resetFile = path.join(__dirname, 'admin_reset.json');
        fs.writeFileSync(resetFile, JSON.stringify({
            token,
            expiry,
            instruksi: 'Gunakan token ini di halaman login untuk mereset password admin.'
        }, null, 2));

        res.json({ success: true, message: 'File reset dibuat: admin_reset.json', file_path: resetFile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset password menggunakan token
app.post('/api/admin/reset-password', (req, res) => {
    try {
        const { token, new_password } = req.body;
        if (!new_password || new_password.length < 4) {
            return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
        }
        const admin = db.prepare('SELECT reset_token, reset_token_expiry FROM admin_settings WHERE id = 1').get();
        if (!admin || !admin.reset_token) {
            return res.status(400).json({ error: 'Tidak ada token reset yang aktif' });
        }
        if (admin.reset_token !== token) {
            return res.status(403).json({ error: 'Token reset tidak valid' });
        }
        if (new Date(admin.reset_token_expiry) < new Date()) {
            return res.status(400).json({ error: 'Token reset sudah kadaluarsa' });
        }

        const newHash = db.hashPassword(new_password);
        db.prepare('UPDATE admin_settings SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = 1').run(newHash);

        // Hapus file reset
        const resetFile = path.join(__dirname, 'admin_reset.json');
        if (fs.existsSync(resetFile)) fs.unlinkSync(resetFile);

        res.json({ success: true, message: 'Password berhasil direset' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: DASHBOARD
// =========================================================================
app.get('/api/dashboard', (req, res) => {
    try {
        const sedangDipinjam = db.prepare(`
            SELECT COUNT(DISTINCT id_transaksi) as total 
            FROM trx_peminjaman 
            WHERE status_keseluruhan IN ('Dipinjam', 'Kembali Sebagian')
            AND status_approval = 'Disetujui'
        `).get();

        const terlambat = db.prepare(`
            SELECT COUNT(*) as total 
            FROM trx_peminjaman 
            WHERE batas_waktu < date('now') 
            AND status_keseluruhan IN ('Dipinjam', 'Kembali Sebagian')
            AND status_approval = 'Disetujui'
        `).get();

        const totalBulanIni = db.prepare(`
            SELECT COUNT(*) as total 
            FROM trx_peminjaman 
            WHERE strftime('%Y-%m', tgl_pinjam) = strftime('%Y-%m', 'now')
            AND status_approval = 'Disetujui'
        `).get();

        const pendingCount = db.prepare(`
            SELECT 
            (SELECT COUNT(*) FROM trx_peminjaman WHERE status_approval = 'Menunggu') +
            (SELECT COUNT(*) FROM log_pengembalian WHERE status_approval = 'Menunggu') +
            (SELECT COUNT(*) FROM trx_penyerahan WHERE status_approval = 'Menunggu') as total
        `).get();

        res.json({
            sedangDipinjam: sedangDipinjam.total,
            terlambat: terlambat.total,
            totalBulanIni: totalBulanIni.total,
            pendingCount: pendingCount.total
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
                t.email_peminjam,
                t.status_keseluruhan,
                t.status_approval,
                t.ttd_peminjam,
                t.ttd_pic,
                d.nama_divisi,
                d.kategori,
                COUNT(dt.id_detail) as jml_dokumen,
                SUM(CASE WHEN dt.status_dokumen = 'Sudah Kembali' THEN 1 ELSE 0 END) as jml_kembali
            FROM trx_peminjaman t
            JOIN master_divisi d ON t.id_divisi = d.id_divisi
            LEFT JOIN detail_peminjaman dt ON t.id_transaksi = dt.id_transaksi
            WHERE t.status_approval = 'Disetujui'
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

// Buat peminjaman baru (status: Menunggu Persetujuan)
app.post('/api/peminjaman', (req, res) => {
    try {
        const { batas_waktu, id_divisi, nama_peminjam, email_peminjam, dokumen, file_lampiran } = req.body;
        const tgl_pinjam = new Date().toISOString().split('T')[0];

        // Generate ID transaksi
        const bulan = String(new Date().getMonth() + 1).padStart(2, '0');
        const tahun = String(new Date().getFullYear()).slice(-2);
        const lastTrx = db.prepare(`
            SELECT id_transaksi FROM trx_peminjaman 
            WHERE id_transaksi LIKE ? 
            ORDER BY id_transaksi DESC LIMIT 1
        `).get(`OGRE-${tahun}${bulan}-%`);

        let nextNum = 1;
        if (lastTrx) {
            const parts = lastTrx.id_transaksi.split('-');
            nextNum = parseInt(parts[2]) + 1;
        }
        const id_transaksi = `OGRE-${tahun}${bulan}-${String(nextNum).padStart(3, '0')}`;

        const insertTrx = db.prepare(`
            INSERT INTO trx_peminjaman (id_transaksi, tgl_pinjam, batas_waktu, id_divisi, nama_peminjam, email_peminjam, file_lampiran, status_keseluruhan, status_approval, ttd_peminjam, ttd_pic)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Menunggu Persetujuan', 'Menunggu', 'n/a', 'n/a')
        `);

        const insertDetail = db.prepare(`
            INSERT INTO detail_peminjaman (id_transaksi, no_dokumen, status_dokumen)
            VALUES (?, ?, 'Menunggu')
        `);

        const transaction = db.transaction(() => {
            insertTrx.run(id_transaksi, tgl_pinjam, batas_waktu, id_divisi, nama_peminjam, email_peminjam || null, file_lampiran || null);

            for (const noDoc of dokumen) {
                insertDetail.run(id_transaksi, noDoc);
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
        const { id_transaksi, dokumen_kembali, nama_pengembali } = req.body;
        const tgl_kembali = new Date().toISOString().split('T')[0];

        // Simpan log pengembalian dengan status Menunggu
        const insertLog = db.prepare(`
            INSERT INTO log_pengembalian (id_transaksi, tgl_kembali, nama_pengembali, status_approval, ttd_pengembali, ttd_pic)
            VALUES (?, ?, ?, 'Menunggu', 'n/a', 'n/a')
        `);

        const result = insertLog.run(id_transaksi, tgl_kembali, nama_pengembali || 'n/a');

        // Simpan dokumen yang dikembalikan di catatan (comma-separated in catatan_tolak as temp storage)
        db.prepare('UPDATE log_pengembalian SET catatan_tolak = ? WHERE id_pengembalian = ?')
            .run(JSON.stringify(dokumen_kembali), result.lastInsertRowid);

        res.json({ success: true, id_pengembalian: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: PENYERAHAN DOKUMEN BARU
// =========================================================================
app.post('/api/penyerahan', (req, res) => {
    try {
        const { nama_penyerah, id_divisi, dokumen } = req.body;
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
            INSERT INTO trx_penyerahan (id_penyerahan, tgl_penyerahan, nama_penyerah, id_divisi, status_approval, ttd_penyerah, ttd_pic)
            VALUES (?, ?, ?, ?, 'Menunggu', 'n/a', 'n/a')
        `);

        const insertDetail = db.prepare(`
            INSERT INTO detail_penyerahan (id_penyerahan, no_dokumen, nama_dokumen, tahun, jenis_dokumen, file_path)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const transaction = db.transaction(() => {
            insertPenyerahan.run(id_penyerahan, tgl_penyerahan, nama_penyerah, id_divisi);

            for (const doc of dokumen) {
                insertDetail.run(id_penyerahan, doc.no, doc.nama, doc.tahun, doc.jenis, doc.file_path || null);
            }
        });

        transaction();
        res.json({ success: true, id_penyerahan });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: APPROVAL (Admin Setujui / Tolak)
// =========================================================================

// Daftar semua permintaan menunggu persetujuan
app.get('/api/pending', (req, res) => {
    try {
        const peminjaman = db.prepare(`
            SELECT t.id_transaksi as id, 'peminjaman' as tipe, t.tgl_pinjam as tanggal, 
                   t.nama_peminjam as nama, t.email_peminjam as email, t.batas_waktu,
                   d.nama_divisi, COUNT(dt.id_detail) as jml_dokumen
            FROM trx_peminjaman t
            JOIN master_divisi d ON t.id_divisi = d.id_divisi
            LEFT JOIN detail_peminjaman dt ON t.id_transaksi = dt.id_transaksi
            WHERE t.status_approval = 'Menunggu'
            GROUP BY t.id_transaksi
            ORDER BY t.tgl_pinjam DESC
        `).all();

        const pengembalian = db.prepare(`
            SELECT lp.id_pengembalian as id, 'pengembalian' as tipe, lp.tgl_kembali as tanggal,
                   lp.nama_pengembali as nama, t.nama_peminjam, t.id_transaksi,
                   d.nama_divisi, lp.catatan_tolak as dokumen_json
            FROM log_pengembalian lp
            JOIN trx_peminjaman t ON lp.id_transaksi = t.id_transaksi
            JOIN master_divisi d ON t.id_divisi = d.id_divisi
            WHERE lp.status_approval = 'Menunggu'
            ORDER BY lp.tgl_kembali DESC
        `).all();

        const penyerahan = db.prepare(`
            SELECT p.id_penyerahan as id, 'penyerahan' as tipe, p.tgl_penyerahan as tanggal,
                   p.nama_penyerah as nama, d.nama_divisi,
                   COUNT(dp.id_detail) as jml_dokumen
            FROM trx_penyerahan p
            JOIN master_divisi d ON p.id_divisi = d.id_divisi
            LEFT JOIN detail_penyerahan dp ON p.id_penyerahan = dp.id_penyerahan
            WHERE p.status_approval = 'Menunggu'
            GROUP BY p.id_penyerahan
            ORDER BY p.tgl_penyerahan DESC
        `).all();

        // Parse dokumen_json for pengembalian
        pengembalian.forEach(p => {
            try { p.dokumen_list = JSON.parse(p.dokumen_json); } catch { p.dokumen_list = []; }
            delete p.dokumen_json;
        });

        res.json({ peminjaman, pengembalian, penyerahan });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detail permintaan pending
app.get('/api/pending/:type/:id', (req, res) => {
    try {
        const { type, id } = req.params;
        if (type === 'peminjaman') {
            const trx = db.prepare(`
                SELECT t.*, d.nama_divisi FROM trx_peminjaman t
                JOIN master_divisi d ON t.id_divisi = d.id_divisi
                WHERE t.id_transaksi = ?
            `).get(id);
            const details = db.prepare(`
                SELECT dp.*, md.nama_dokumen FROM detail_peminjaman dp
                JOIN master_dokumen md ON dp.no_dokumen = md.no_dokumen
                WHERE dp.id_transaksi = ?
            `).all(id);
            res.json({ ...trx, details });
        } else if (type === 'penyerahan') {
            const trx = db.prepare(`
                SELECT p.*, d.nama_divisi FROM trx_penyerahan p
                JOIN master_divisi d ON p.id_divisi = d.id_divisi
                WHERE p.id_penyerahan = ?
            `).get(id);
            const details = db.prepare(`
                SELECT * FROM detail_penyerahan WHERE id_penyerahan = ?
            `).all(id);
            res.json({ ...trx, details });
        } else if (type === 'pengembalian') {
            const log = db.prepare(`
                SELECT lp.*, t.nama_peminjam, t.id_transaksi as trx_id, d.nama_divisi
                FROM log_pengembalian lp
                JOIN trx_peminjaman t ON lp.id_transaksi = t.id_transaksi
                JOIN master_divisi d ON t.id_divisi = d.id_divisi
                WHERE lp.id_pengembalian = ?
            `).get(id);
            let dokumen_list = [];
            try { dokumen_list = JSON.parse(log.catatan_tolak); } catch { }
            // Get document names
            const details = dokumen_list.map(noDoc => {
                const doc = db.prepare('SELECT * FROM master_dokumen WHERE no_dokumen = ?').get(noDoc);
                return doc || { no_dokumen: noDoc, nama_dokumen: 'Unknown' };
            });
            res.json({ ...log, dokumen_list, details });
        } else {
            res.status(400).json({ error: 'Tipe tidak valid' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve permintaan
app.post('/api/approve', (req, res) => {
    try {
        const { type, id, ttd_penyerah, ttd_pic } = req.body;

        if (type === 'peminjaman') {
            db.prepare(`UPDATE trx_peminjaman SET status_approval = 'Disetujui', status_keseluruhan = 'Dipinjam', ttd_peminjam = ?, ttd_pic = ? WHERE id_transaksi = ?`)
                .run(ttd_penyerah || 'n/a', ttd_pic || 'n/a', id);

            // Update detail & master dokumen
            const details = db.prepare('SELECT no_dokumen FROM detail_peminjaman WHERE id_transaksi = ?').all(id);
            for (const d of details) {
                db.prepare("UPDATE detail_peminjaman SET status_dokumen = 'Dipinjam' WHERE id_transaksi = ? AND no_dokumen = ?").run(id, d.no_dokumen);
                db.prepare("UPDATE master_dokumen SET status = 'Dipinjam' WHERE no_dokumen = ?").run(d.no_dokumen);
            }

        } else if (type === 'pengembalian') {
            const log = db.prepare('SELECT * FROM log_pengembalian WHERE id_pengembalian = ?').get(id);
            if (!log) return res.status(404).json({ error: 'Pengembalian tidak ditemukan' });

            let dokumen_kembali = [];
            try { dokumen_kembali = JSON.parse(log.catatan_tolak); } catch { }

            db.prepare(`UPDATE log_pengembalian SET status_approval = 'Disetujui', ttd_pengembali = ?, ttd_pic = ?, catatan_tolak = NULL WHERE id_pengembalian = ?`)
                .run(ttd_penyerah || 'n/a', ttd_pic || 'n/a', id);

            // Update detail peminjaman & master dokumen
            for (const noDoc of dokumen_kembali) {
                db.prepare(`UPDATE detail_peminjaman SET status_dokumen = 'Sudah Kembali', tgl_dikembalikan = ? WHERE id_transaksi = ? AND no_dokumen = ?`)
                    .run(log.tgl_kembali, log.id_transaksi, noDoc);
                db.prepare("UPDATE master_dokumen SET status = 'Tersedia' WHERE no_dokumen = ?").run(noDoc);
            }

            // Check if all returned
            const remaining = db.prepare(`
                SELECT COUNT(*) as total FROM detail_peminjaman 
                WHERE id_transaksi = ? AND status_dokumen = 'Dipinjam'
            `).get(log.id_transaksi);

            let newStatus = 'Kembali Sebagian';
            if (remaining.total === 0) newStatus = 'Selesai';
            db.prepare('UPDATE trx_peminjaman SET status_keseluruhan = ? WHERE id_transaksi = ?')
                .run(newStatus, log.id_transaksi);

        } else if (type === 'penyerahan') {
            db.prepare(`UPDATE trx_penyerahan SET status_approval = 'Disetujui', ttd_penyerah = ?, ttd_pic = ? WHERE id_penyerahan = ?`)
                .run(ttd_penyerah || 'n/a', ttd_pic || 'n/a', id);

            // Insert dokumen ke master
            const details = db.prepare('SELECT * FROM detail_penyerahan WHERE id_penyerahan = ?').all(id);
            for (const doc of details) {
                // Check if a file was pre-uploaded for this document
                let filePath = doc.file_path || null;
                if (!filePath) {
                    const safeNo = doc.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_');
                    const uploadedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith(safeNo));
                    if (uploadedFiles.length > 0) filePath = uploadedFiles[0];
                }

                const existing = db.prepare('SELECT no_dokumen FROM master_dokumen WHERE no_dokumen = ?').get(doc.no_dokumen);
                if (existing) {
                    // Update file_path if we have one
                    if (filePath) {
                        db.prepare('UPDATE master_dokumen SET file_path = ? WHERE no_dokumen = ?').run(filePath, doc.no_dokumen);
                    }
                } else {
                    db.prepare(`INSERT INTO master_dokumen (no_dokumen, nama_dokumen, tahun, jenis_dokumen, status, file_path) VALUES (?, ?, ?, ?, 'Tersedia', ?)`)
                        .run(doc.no_dokumen, doc.nama_dokumen, doc.tahun, doc.jenis_dokumen, filePath);
                }
            }
        } else {
            return res.status(400).json({ error: 'Tipe tidak valid' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reject permintaan
app.post('/api/reject', (req, res) => {
    try {
        const { type, id, catatan } = req.body;

        if (type === 'peminjaman') {
            db.prepare(`UPDATE trx_peminjaman SET status_approval = 'Ditolak', catatan_tolak = ?, status_keseluruhan = 'Ditolak' WHERE id_transaksi = ?`)
                .run(catatan || '', id);
            // Hapus detail 
            db.prepare('DELETE FROM detail_peminjaman WHERE id_transaksi = ?').run(id);

        } else if (type === 'pengembalian') {
            db.prepare(`UPDATE log_pengembalian SET status_approval = 'Ditolak', catatan_tolak = ? WHERE id_pengembalian = ?`)
                .run(catatan || '', id);

        } else if (type === 'penyerahan') {
            db.prepare(`UPDATE trx_penyerahan SET status_approval = 'Ditolak', catatan_tolak = ? WHERE id_penyerahan = ?`)
                .run(catatan || '', id);
            // Hapus detail
            db.prepare('DELETE FROM detail_penyerahan WHERE id_penyerahan = ?').run(id);

        } else {
            return res.status(400).json({ error: 'Tipe tidak valid' });
        }

        res.json({ success: true });
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

// Upload file for a document
app.post('/api/dokumen/upload/:no_dokumen', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

        // Check if doc exists in master (may not exist yet for penyerahan pre-upload)
        const doc = db.prepare('SELECT * FROM master_dokumen WHERE no_dokumen = ?').get(req.params.no_dokumen);

        // Delete old file if exists
        if (doc && doc.file_path) {
            const oldPath = path.join(UPLOADS_DIR, doc.file_path);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        // Update master_dokumen if doc exists, otherwise file will be linked on approval
        if (doc) {
            db.prepare('UPDATE master_dokumen SET file_path = ? WHERE no_dokumen = ?').run(req.file.filename, req.params.no_dokumen);
        }
        res.json({ success: true, filename: req.file.filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Preview file (inline)
app.get('/api/dokumen/preview/:no_dokumen', (req, res) => {
    try {
        const doc = db.prepare('SELECT file_path FROM master_dokumen WHERE no_dokumen = ?').get(req.params.no_dokumen);
        if (!doc || !doc.file_path) return res.status(404).json({ error: 'File tidak tersedia' });
        const filePath = path.join(UPLOADS_DIR, doc.file_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan di server' });
        res.setHeader('Content-Disposition', 'inline; filename="' + doc.file_path + '"');
        res.sendFile(filePath);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Download file
app.get('/api/dokumen/download/:no_dokumen', (req, res) => {
    try {
        const doc = db.prepare('SELECT file_path, nama_dokumen FROM master_dokumen WHERE no_dokumen = ?').get(req.params.no_dokumen);
        if (!doc || !doc.file_path) return res.status(404).json({ error: 'File tidak tersedia' });
        const filePath = path.join(UPLOADS_DIR, doc.file_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan di server' });
        const ext = path.extname(doc.file_path);
        const downloadName = doc.nama_dokumen.replace(/[^a-zA-Z0-9 _-]/g, '') + ext;
        res.download(filePath, downloadName);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit dokumen
app.patch('/api/dokumen/:no_dokumen', (req, res) => {
    try {
        const { nama_dokumen, tahun, jenis_dokumen } = req.body;
        const doc = db.prepare('SELECT * FROM master_dokumen WHERE no_dokumen = ?').get(req.params.no_dokumen);
        if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
        db.prepare('UPDATE master_dokumen SET nama_dokumen = ?, tahun = ?, jenis_dokumen = ? WHERE no_dokumen = ?')
            .run(nama_dokumen || doc.nama_dokumen, tahun || doc.tahun, jenis_dokumen || doc.jenis_dokumen, req.params.no_dokumen);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hapus dokumen
app.delete('/api/dokumen/:no_dokumen', (req, res) => {
    try {
        const doc = db.prepare('SELECT * FROM master_dokumen WHERE no_dokumen = ?').get(req.params.no_dokumen);
        if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
        if (doc.status === 'Dipinjam') return res.status(400).json({ error: 'Tidak bisa menghapus dokumen yang sedang dipinjam' });
        // Hapus file jika ada
        if (doc.file_path) {
            const fp = path.join(UPLOADS_DIR, doc.file_path);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        db.prepare('DELETE FROM master_dokumen WHERE no_dokumen = ?').run(req.params.no_dokumen);
        res.json({ success: true });
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
        if (!kategori || !nama_divisi) {
            return res.status(400).json({ error: 'Kategori dan nama divisi harus diisi' });
        }
        db.prepare('INSERT INTO master_divisi (kategori, nama_divisi) VALUES (?, ?)').run(kategori, nama_divisi);
        res.json({ success: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            res.status(400).json({ error: 'Nama divisi sudah ada' });
        } else {
            res.status(500).json({ error: err.message });
        }
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

    // Auto-link orphaned files to documents
    try {
        const docs = db.prepare('SELECT no_dokumen FROM master_dokumen WHERE file_path IS NULL').all();
        const files = fs.readdirSync(UPLOADS_DIR);
        let linked = 0;
        for (const doc of docs) {
            const safeNo = doc.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_');
            const match = files.find(f => f.startsWith(safeNo + '.'));
            if (match) {
                db.prepare('UPDATE master_dokumen SET file_path = ? WHERE no_dokumen = ?').run(match, doc.no_dokumen);
                linked++;
            }
        }
        if (linked > 0) console.log(`📎 ${linked} dokumen otomatis dihubungkan dengan file-nya`);
    } catch (e) { /* ignore */ }
});
