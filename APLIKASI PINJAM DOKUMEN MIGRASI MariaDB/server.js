const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const ExcelJS = require('exceljs');
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
        if (req.params.no_dokumen) {
            const safeName = req.params.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_') + ext;
            cb(null, safeName);
        } else {
            cb(null, 'temp_import_' + Date.now() + ext);
        }
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
app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        const [admin] = await db.pool.query('SELECT password_hash FROM admin_settings WHERE id = 1');
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
app.post('/api/admin/password', async (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        if (!new_password || new_password.length < 4) {
            return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
        }
        const [admin] = await db.pool.query('SELECT password_hash FROM admin_settings WHERE id = 1');
        if (!admin) return res.status(500).json({ error: 'Admin belum dikonfigurasi' });

        if (!db.verifyPassword(old_password, admin.password_hash)) {
            return res.status(403).json({ error: 'Password lama salah' });
        }

        const newHash = db.hashPassword(new_password);
        await db.pool.query('UPDATE admin_settings SET password_hash = ?, reset_token = NULL WHERE id = 1', [newHash]);
        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate reset file
app.post('/api/admin/generate-reset', async (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 jam
        await db.pool.query('UPDATE admin_settings SET reset_token = ?, reset_token_expiry = ? WHERE id = 1', [token, expiry]);

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
app.post('/api/admin/reset-password', async (req, res) => {
    try {
        const { token, new_password } = req.body;
        if (!new_password || new_password.length < 4) {
            return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
        }
        const [admin] = await db.pool.query('SELECT reset_token, reset_token_expiry FROM admin_settings WHERE id = 1');
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
        await db.pool.query('UPDATE admin_settings SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = 1', [newHash]);

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
app.get('/api/dashboard', async (req, res) => {
    try {
        const [sedangDipinjam] = await db.pool.query(`
            SELECT COUNT(DISTINCT id_transaksi) as total 
            FROM trx_peminjaman 
            WHERE status_keseluruhan IN ('Dipinjam', 'Kembali Sebagian')
            AND status_approval = 'Disetujui'
        `);

        const [terlambat] = await db.pool.query(`
            SELECT COUNT(*) as total 
            FROM trx_peminjaman 
            WHERE batas_waktu < CURDATE() 
            AND status_keseluruhan IN ('Dipinjam', 'Kembali Sebagian')
            AND status_approval = 'Disetujui'
        `);

        const [totalBulanIni] = await db.pool.query(`
            SELECT COUNT(*) as total 
            FROM trx_peminjaman 
            WHERE YEAR(tgl_pinjam) = YEAR(CURDATE()) AND MONTH(tgl_pinjam) = MONTH(CURDATE())
            AND status_approval = 'Disetujui'
        `);

        const [pendingCount] = await db.pool.query(`
            SELECT 
            (SELECT COUNT(*) FROM trx_peminjaman WHERE status_approval = 'Menunggu') +
            (SELECT COUNT(*) FROM log_pengembalian WHERE status_approval = 'Menunggu') +
            (SELECT COUNT(*) FROM trx_penyerahan WHERE status_approval = 'Menunggu') as total
        `);

        res.json({
            sedangDipinjam: Number(sedangDipinjam?.total || 0),
            terlambat: Number(terlambat?.total || 0),
            totalBulanIni: Number(totalBulanIni?.total || 0),
            pendingCount: Number(pendingCount?.total || 0)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: TRANSAKSI PEMINJAMAN
// =========================================================================
app.get('/api/transaksi', async (req, res) => {
    try {
        const transaksi = await db.pool.query(`
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
        `);

        // Cek keterlambatan dan update status
        const now = new Date().toISOString().split('T')[0];
        for (const trx of transaksi) {
            if (trx.batas_waktu < now && trx.status_keseluruhan !== 'Selesai') {
                trx.status_keseluruhan = 'Terlambat';
                await db.pool.query(`UPDATE trx_peminjaman SET status_keseluruhan = 'Terlambat' WHERE id_transaksi = ?`, [trx.id_transaksi]);
            }
        }

        res.json(transaksi);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detail transaksi
app.get('/api/transaksi/:id', async (req, res) => {
    try {
        const [trx] = await db.pool.query(`
            SELECT t.*, d.nama_divisi 
            FROM trx_peminjaman t 
            JOIN master_divisi d ON t.id_divisi = d.id_divisi 
            WHERE t.id_transaksi = ?
        `, [req.params.id]);

        if (!trx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

        const details = await db.pool.query(`
            SELECT dp.*, md.nama_dokumen 
            FROM detail_peminjaman dp 
            JOIN master_dokumen md ON dp.no_dokumen = md.no_dokumen 
            WHERE dp.id_transaksi = ?
        `, [req.params.id]);

        res.json({ ...trx, details });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buat peminjaman baru (status: Menunggu Persetujuan)
app.post('/api/peminjaman', async (req, res) => {
    let conn;
    try {
        const { batas_waktu, id_divisi, nama_peminjam, email_peminjam, dokumen, file_lampiran } = req.body;
        const tgl_pinjam = new Date().toISOString().split('T')[0];

        // Generate ID transaksi
        const bulan = String(new Date().getMonth() + 1).padStart(2, '0');
        const tahun = String(new Date().getFullYear()).slice(-2);
        
        const [lastTrx] = await db.pool.query(`
            SELECT id_transaksi FROM trx_peminjaman 
            WHERE id_transaksi LIKE ? 
            ORDER BY id_transaksi DESC LIMIT 1
        `, [`OGRE-${tahun}${bulan}-%`]);

        let nextNum = 1;
        if (lastTrx) {
            const parts = lastTrx.id_transaksi.split('-');
            nextNum = parseInt(parts[2]) + 1;
        }
        const id_transaksi = `OGRE-${tahun}${bulan}-${String(nextNum).padStart(3, '0')}`;

        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        await conn.query(`
            INSERT INTO trx_peminjaman (id_transaksi, tgl_pinjam, batas_waktu, id_divisi, nama_peminjam, email_peminjam, file_lampiran, status_keseluruhan, status_approval, ttd_peminjam, ttd_pic)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Menunggu Persetujuan', 'Menunggu', 'n/a', 'n/a')
        `, [id_transaksi, tgl_pinjam, batas_waktu, id_divisi, nama_peminjam, email_peminjam || null, file_lampiran || null]);

        for (const noDoc of dokumen) {
            await conn.query(`
                INSERT INTO detail_peminjaman (id_transaksi, no_dokumen, status_dokumen)
                VALUES (?, ?, 'Menunggu')
            `, [id_transaksi, noDoc]);
        }

        await conn.commit();
        res.json({ success: true, id_transaksi });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// =========================================================================
// API: PENGEMBALIAN
// =========================================================================
app.post('/api/pengembalian', async (req, res) => {
    let conn;
    try {
        const { id_transaksi, dokumen_kembali, nama_pengembali } = req.body;
        const tgl_kembali = new Date().toISOString().split('T')[0];

        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        // Simpan log pengembalian dengan status Menunggu
        const result = await conn.query(`
            INSERT INTO log_pengembalian (id_transaksi, tgl_kembali, nama_pengembali, status_approval, ttd_pengembali, ttd_pic)
            VALUES (?, ?, ?, 'Menunggu', 'n/a', 'n/a')
        `, [id_transaksi, tgl_kembali, nama_pengembali || 'n/a']);

        const id_pengembalian = Number(result.insertId);

        // Simpan dokumen yang dikembalikan di catatan (comma-separated in catatan_tolak as temp storage)
        await conn.query('UPDATE log_pengembalian SET catatan_tolak = ? WHERE id_pengembalian = ?', 
            [JSON.stringify(dokumen_kembali), id_pengembalian]);

        await conn.commit();
        res.json({ success: true, id_pengembalian });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// =========================================================================
// API: PENYERAHAN DOKUMEN BARU
// =========================================================================
app.post('/api/penyerahan', async (req, res) => {
    let conn;
    try {
        const { nama_penyerah, id_divisi, dokumen } = req.body;
        const tgl_penyerahan = new Date().toISOString().split('T')[0];

        // Generate ID penyerahan
        const bulan = String(new Date().getMonth() + 1).padStart(2, '0');
        const tahun = String(new Date().getFullYear()).slice(-2);
        const [lastRcv] = await db.pool.query(`
            SELECT id_penyerahan FROM trx_penyerahan 
            WHERE id_penyerahan LIKE ? 
            ORDER BY id_penyerahan DESC LIMIT 1
        `, [`RCV-${tahun}${bulan}-%`]);

        let nextNum = 1;
        if (lastRcv) {
            const parts = lastRcv.id_penyerahan.split('-');
            nextNum = parseInt(parts[2]) + 1;
        }
        const id_penyerahan = `RCV-${tahun}${bulan}-${String(nextNum).padStart(3, '0')}`;

        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        await conn.query(`
            INSERT INTO trx_penyerahan (id_penyerahan, tgl_penyerahan, nama_penyerah, id_divisi, status_approval, ttd_penyerah, ttd_pic)
            VALUES (?, ?, ?, ?, 'Menunggu', 'n/a', 'n/a')
        `, [id_penyerahan, tgl_penyerahan, nama_penyerah, id_divisi]);

        for (const doc of dokumen) {
            await conn.query(`
                INSERT INTO detail_penyerahan (id_penyerahan, no_dokumen, nama_dokumen, tahun, jenis_dokumen, file_path, nama_klien, nilai_proyek)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [id_penyerahan, doc.no, doc.nama, doc.tahun, doc.jenis, doc.file_path || null, doc.nama_klien || null, doc.nilai_proyek || null]);
        }

        await conn.commit();
        res.json({ success: true, id_penyerahan });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// =========================================================================
// API: APPROVAL (Admin Setujui / Tolak)
// =========================================================================

// Daftar semua permintaan menunggu persetujuan
app.get('/api/pending', async (req, res) => {
    try {
        const peminjaman = await db.pool.query(`
            SELECT t.id_transaksi as id, 'peminjaman' as tipe, t.tgl_pinjam as tanggal, 
                   t.nama_peminjam as nama, t.email_peminjam as email, t.batas_waktu,
                   d.nama_divisi, COUNT(dt.id_detail) as jml_dokumen
            FROM trx_peminjaman t
            JOIN master_divisi d ON t.id_divisi = d.id_divisi
            LEFT JOIN detail_peminjaman dt ON t.id_transaksi = dt.id_transaksi
            WHERE t.status_approval = 'Menunggu'
            GROUP BY t.id_transaksi
            ORDER BY t.tgl_pinjam DESC
        `);

        const pengembalian = await db.pool.query(`
            SELECT lp.id_pengembalian as id, 'pengembalian' as tipe, lp.tgl_kembali as tanggal,
                   lp.nama_pengembali as nama, t.nama_peminjam, t.id_transaksi,
                   d.nama_divisi, lp.catatan_tolak as dokumen_json
            FROM log_pengembalian lp
            JOIN trx_peminjaman t ON lp.id_transaksi = t.id_transaksi
            JOIN master_divisi d ON t.id_divisi = d.id_divisi
            WHERE lp.status_approval = 'Menunggu'
            ORDER BY lp.tgl_kembali DESC
        `);

        const penyerahan = await db.pool.query(`
            SELECT p.id_penyerahan as id, 'penyerahan' as tipe, p.tgl_penyerahan as tanggal,
                   p.nama_penyerah as nama, d.nama_divisi,
                   COUNT(dp.id_detail) as jml_dokumen
            FROM trx_penyerahan p
            JOIN master_divisi d ON p.id_divisi = d.id_divisi
            LEFT JOIN detail_penyerahan dp ON p.id_penyerahan = dp.id_penyerahan
            WHERE p.status_approval = 'Menunggu'
            GROUP BY p.id_penyerahan
            ORDER BY p.tgl_penyerahan DESC
        `);

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
app.get('/api/pending/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        if (type === 'peminjaman') {
            const [trx] = await db.pool.query(`
                SELECT t.*, d.nama_divisi FROM trx_peminjaman t
                JOIN master_divisi d ON t.id_divisi = d.id_divisi
                WHERE t.id_transaksi = ?
            `, [id]);
            const details = await db.pool.query(`
                SELECT dp.*, md.nama_dokumen FROM detail_peminjaman dp
                JOIN master_dokumen md ON dp.no_dokumen = md.no_dokumen
                WHERE dp.id_transaksi = ?
            `, [id]);
            res.json({ ...trx, details });
        } else if (type === 'penyerahan') {
            const [trx] = await db.pool.query(`
                SELECT p.*, d.nama_divisi FROM trx_penyerahan p
                JOIN master_divisi d ON p.id_divisi = d.id_divisi
                WHERE p.id_penyerahan = ?
            `, [id]);
            const details = await db.pool.query(`
                SELECT * FROM detail_penyerahan WHERE id_penyerahan = ?
            `, [id]);
            res.json({ ...trx, details });
        } else if (type === 'pengembalian') {
            const [log] = await db.pool.query(`
                SELECT lp.*, t.nama_peminjam, t.id_transaksi as trx_id, d.nama_divisi
                FROM log_pengembalian lp
                JOIN trx_peminjaman t ON lp.id_transaksi = t.id_transaksi
                JOIN master_divisi d ON t.id_divisi = d.id_divisi
                WHERE lp.id_pengembalian = ?
            `, [id]);
            let dokumen_list = [];
            try { dokumen_list = JSON.parse(log.catatan_tolak); } catch { }
            
            // Get document names
            const details = [];
            for (const noDoc of dokumen_list) {
                const [doc] = await db.pool.query('SELECT * FROM master_dokumen WHERE no_dokumen = ?', [noDoc]);
                details.push(doc || { no_dokumen: noDoc, nama_dokumen: 'Unknown' });
            }
            res.json({ ...log, dokumen_list, details });
        } else {
            res.status(400).json({ error: 'Tipe tidak valid' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve permintaan
app.post('/api/approve', async (req, res) => {
    let conn;
    try {
        const { type, id, ttd_penyerah, ttd_pic } = req.body;
        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        if (type === 'peminjaman') {
            await conn.query(`UPDATE trx_peminjaman SET status_approval = 'Disetujui', status_keseluruhan = 'Dipinjam', ttd_peminjam = ?, ttd_pic = ? WHERE id_transaksi = ?`, [ttd_penyerah || 'n/a', ttd_pic || 'n/a', id]);

            // Update detail & master dokumen
            const details = await conn.query('SELECT no_dokumen FROM detail_peminjaman WHERE id_transaksi = ?', [id]);
            for (const d of details) {
                await conn.query("UPDATE detail_peminjaman SET status_dokumen = 'Dipinjam' WHERE id_transaksi = ? AND no_dokumen = ?", [id, d.no_dokumen]);
                await conn.query("UPDATE master_dokumen SET status = 'Dipinjam' WHERE no_dokumen = ?", [d.no_dokumen]);
            }

        } else if (type === 'pengembalian') {
            const [log] = await conn.query('SELECT * FROM log_pengembalian WHERE id_pengembalian = ?', [id]);
            if (!log) {
                await conn.rollback();
                return res.status(404).json({ error: 'Pengembalian tidak ditemukan' });
            }

            let dokumen_kembali = [];
            try { dokumen_kembali = JSON.parse(log.catatan_tolak); } catch { }

            await conn.query(`UPDATE log_pengembalian SET status_approval = 'Disetujui', ttd_pengembali = ?, ttd_pic = ?, catatan_tolak = NULL WHERE id_pengembalian = ?`, [ttd_penyerah || 'n/a', ttd_pic || 'n/a', id]);

            // Update detail peminjaman & master dokumen
            for (const noDoc of dokumen_kembali) {
                await conn.query(`UPDATE detail_peminjaman SET status_dokumen = 'Sudah Kembali', tgl_dikembalikan = ? WHERE id_transaksi = ? AND no_dokumen = ?`, [log.tgl_kembali, log.id_transaksi, noDoc]);
                await conn.query("UPDATE master_dokumen SET status = 'Tersedia' WHERE no_dokumen = ?", [noDoc]);
            }

            // Check if all returned
            const [remaining] = await conn.query(`
                SELECT COUNT(*) as total FROM detail_peminjaman 
                WHERE id_transaksi = ? AND status_dokumen = 'Dipinjam'
            `, [log.id_transaksi]);

            let newStatus = 'Kembali Sebagian';
            if (Number(remaining?.total || 0) === 0) newStatus = 'Selesai';
            await conn.query('UPDATE trx_peminjaman SET status_keseluruhan = ? WHERE id_transaksi = ?', [newStatus, log.id_transaksi]);

        } else if (type === 'penyerahan') {
            await conn.query(`UPDATE trx_penyerahan SET status_approval = 'Disetujui', ttd_penyerah = ?, ttd_pic = ? WHERE id_penyerahan = ?`, [ttd_penyerah || 'n/a', ttd_pic || 'n/a', id]);

            // Insert dokumen ke master
            const details = await conn.query('SELECT * FROM detail_penyerahan WHERE id_penyerahan = ?', [id]);
            for (const doc of details) {
                // Check if a file was pre-uploaded for this document
                let filePath = doc.file_path || null;
                if (!filePath) {
                    const safeNo = doc.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_');
                    try {
                        const uploadedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith(safeNo));
                        if (uploadedFiles.length > 0) filePath = uploadedFiles[0];
                    } catch (e) {}
                }

                const [existing] = await conn.query('SELECT no_dokumen FROM master_dokumen WHERE no_dokumen = ?', [doc.no_dokumen]);
                if (existing) {
                    // Update file_path if we have one
                    if (filePath) {
                        await conn.query('UPDATE master_dokumen SET file_path = ? WHERE no_dokumen = ?', [filePath, doc.no_dokumen]);
                    }
                } else {
                    await conn.query(`INSERT INTO master_dokumen (no_dokumen, nama_dokumen, tahun, jenis_dokumen, status, file_path, nama_klien, nilai_proyek) VALUES (?, ?, ?, ?, 'Tersedia', ?, ?, ?)`, [doc.no_dokumen, doc.nama_dokumen, doc.tahun, doc.jenis_dokumen, filePath, doc.nama_klien || null, doc.nilai_proyek || null]);
                }
            }
        } else {
            await conn.rollback();
            return res.status(400).json({ error: 'Tipe tidak valid' });
        }

        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Reject permintaan
app.post('/api/reject', async (req, res) => {
    let conn;
    try {
        const { type, id, catatan } = req.body;
        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        if (type === 'peminjaman') {
            await conn.query(`UPDATE trx_peminjaman SET status_approval = 'Ditolak', catatan_tolak = ?, status_keseluruhan = 'Ditolak' WHERE id_transaksi = ?`, [catatan || '', id]);
            // Hapus detail 
            await conn.query('DELETE FROM detail_peminjaman WHERE id_transaksi = ?', [id]);

        } else if (type === 'pengembalian') {
            await conn.query(`UPDATE log_pengembalian SET status_approval = 'Ditolak', catatan_tolak = ? WHERE id_pengembalian = ?`, [catatan || '', id]);

        } else if (type === 'penyerahan') {
            await conn.query(`UPDATE trx_penyerahan SET status_approval = 'Ditolak', catatan_tolak = ? WHERE id_penyerahan = ?`, [catatan || '', id]);
            // Hapus detail
            await conn.query('DELETE FROM detail_penyerahan WHERE id_penyerahan = ?', [id]);

        } else {
            await conn.rollback();
            return res.status(400).json({ error: 'Tipe tidak valid' });
        }

        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// =========================================================================
// API: MASTER DOKUMEN
// =========================================================================
app.get('/api/dokumen', async (req, res) => {
    try {
        const docs = await db.pool.query('SELECT * FROM master_dokumen ORDER BY no_dokumen');
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Download Template Excel
app.get('/api/dokumen/template', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Template Dokumen Baru');
        
        sheet.columns = [
            { header: 'No Dokumen', key: 'no_dokumen', width: 25 },
            { header: 'Nama Dokumen', key: 'nama_dokumen', width: 40 },
            { header: 'Tahun', key: 'tahun', width: 15 },
            { header: 'Jenis Dokumen', key: 'jenis_dokumen', width: 20 },
            { header: 'Nama Klien (Khusus Kontrak)', key: 'nama_klien', width: 30 },
            { header: 'Nilai Proyek (Khusus Kontrak)', key: 'nilai_proyek', width: 25 }
        ];

        // Styling headers
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

        // Add dummy data / instructions
        sheet.addRow({
            no_dokumen: 'DOC-2026-001',
            nama_dokumen: 'SOP Keuangan',
            tahun: 2026,
            jenis_dokumen: 'SOP',
            nama_klien: '',
            nilai_proyek: ''
        });
        sheet.addRow({
            no_dokumen: 'DOC-2026-002',
            nama_dokumen: 'Perjanjian Kerjasama Vendor',
            tahun: 2025,
            jenis_dokumen: 'Kontrak',
            nama_klien: 'PT Maju Bersama',
            nilai_proyek: 'Rp 500.000.000'
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Dokumen.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export to Excel
app.get('/api/dokumen/export', async (req, res) => {
    try {
        const docs = await db.pool.query('SELECT * FROM master_dokumen ORDER BY no_dokumen');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Database Dokumen');
        
        sheet.columns = [
            { header: 'No Dokumen', key: 'no_dokumen', width: 20 },
            { header: 'Nama / Judul Dokumen', key: 'nama_dokumen', width: 40 },
            { header: 'Tahun', key: 'tahun', width: 10 },
            { header: 'Jenis', key: 'jenis_dokumen', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Tempat Penyimpanan', key: 'tempat_penyimpanan', width: 25 },
            { header: 'Nama Klien', key: 'nama_klien', width: 30 },
            { header: 'Nilai Proyek', key: 'nilai_proyek', width: 25 },
            { header: 'Link Download File', key: 'file_link', width: 40 }
        ];

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

        const host = req.protocol + '://' + req.get('host');

        docs.forEach(doc => {
            const row = sheet.addRow({
                no_dokumen: doc.no_dokumen,
                nama_dokumen: doc.nama_dokumen,
                tahun: doc.tahun,
                jenis_dokumen: doc.jenis_dokumen,
                status: doc.status,
                tempat_penyimpanan: doc.tempat_penyimpanan || '-',
                nama_klien: doc.nama_klien || '-',
                nilai_proyek: doc.nilai_proyek || '-'
            });

            if (doc.file_path) {
                const link = `${host}/api/dokumen/download/${encodeURIComponent(doc.no_dokumen)}`;
                row.getCell('file_link').value = {
                    text: 'Download Dokumen',
                    hyperlink: link,
                    tooltip: `Unduh file ${doc.file_path}`
                };
                row.getCell('file_link').font = { color: { argb: 'FF0563C1' }, underline: true };
            } else {
                row.getCell('file_link').value = 'Tidak ada file';
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Database_Dokumen.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Import tempat penyimpanan from Excel (admin only)
app.post('/api/dokumen/import-tempat', upload.single('file'), async (req, res) => {
    let conn;
    try {
        if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const sheet = workbook.worksheets[0];
        if (!sheet) return res.status(400).json({ error: 'Worksheet tidak ditemukan' });

        // Read headers to find column indexes
        const headerRow = sheet.getRow(1);
        let noDocIdx = -1, tempatIdx = -1;
        headerRow.eachCell((cell, colNumber) => {
            const val = (cell.value || '').toString().toLowerCase().trim();
            if (val.includes('no') && (val.includes('dokumen') || val.includes('doc'))) noDocIdx = colNumber;
            if (val.includes('tempat') || val.includes('penyimpanan')) tempatIdx = colNumber;
        });

        if (noDocIdx === -1) return res.status(400).json({ error: 'Kolom "No Dokumen" tidak ditemukan di file Excel' });
        if (tempatIdx === -1) return res.status(400).json({ error: 'Kolom "Tempat Penyimpanan" tidak ditemukan di file Excel' });

        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        let updated = 0, notFound = 0;

        for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
            const row = sheet.getRow(rowNumber);
            if (!row) continue;
            const noDoc = (row.getCell(noDocIdx).value || '').toString().trim();
            const tempat = (row.getCell(tempatIdx).value || '').toString().trim();
            if (!noDoc || !tempat) continue;

            const [doc] = await conn.query('SELECT no_dokumen FROM master_dokumen WHERE no_dokumen = ?', [noDoc]);
            if (doc) {
                await conn.query('UPDATE master_dokumen SET tempat_penyimpanan = ? WHERE no_dokumen = ?', [tempat, noDoc]);
                updated++;
            } else {
                notFound++;
            }
        }

        await conn.commit();

        // Clean up uploaded file
        try { fs.unlinkSync(req.file.path); } catch (e) {}

        res.json({ success: true, updated, notFound });
    } catch (err) {
        if (conn) await conn.rollback();
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Upload file for a document
app.post('/api/dokumen/upload/:no_dokumen', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

        // Check if doc exists in master (may not exist yet for penyerahan pre-upload)
        const [doc] = await db.pool.query('SELECT * FROM master_dokumen WHERE no_dokumen = ?', [req.params.no_dokumen]);

        // Delete old file if exists
        if (doc && doc.file_path) {
            const oldPath = path.join(UPLOADS_DIR, doc.file_path);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) {}
            }
        }

        // Update master_dokumen if doc exists, otherwise file will be linked on approval
        if (doc) {
            await db.pool.query('UPDATE master_dokumen SET file_path = ? WHERE no_dokumen = ?', [req.file.filename, req.params.no_dokumen]);
        }
        res.json({ success: true, filename: req.file.filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Preview file (inline)
app.get('/api/dokumen/preview/:no_dokumen', async (req, res) => {
    try {
        const [doc] = await db.pool.query('SELECT file_path FROM master_dokumen WHERE no_dokumen = ?', [req.params.no_dokumen]);
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
app.get('/api/dokumen/download/:no_dokumen', async (req, res) => {
    try {
        const [doc] = await db.pool.query('SELECT file_path, nama_dokumen FROM master_dokumen WHERE no_dokumen = ?', [req.params.no_dokumen]);
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
app.patch('/api/dokumen/:no_dokumen', async (req, res) => {
    let conn;
    try {
        const { no_dokumen_baru, nama_dokumen, tahun, jenis_dokumen, status, tempat_penyimpanan, nama_klien, nilai_proyek } = req.body;
        const oldNoDoc = req.params.no_dokumen;
        const newNoDoc = no_dokumen_baru || oldNoDoc;

        const [doc] = await db.pool.query('SELECT * FROM master_dokumen WHERE no_dokumen = ?', [oldNoDoc]);
        if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });

        if (newNoDoc !== oldNoDoc) {
            // Check if new no_dokumen already exists
            const [existing] = await db.pool.query('SELECT no_dokumen FROM master_dokumen WHERE no_dokumen = ?', [newNoDoc]);
            if (existing) return res.status(400).json({ error: 'No dokumen baru sudah digunakan' });
            
            conn = await db.pool.getConnection();
            await conn.beginTransaction();

            // Insert as new row
            await conn.query(`INSERT INTO master_dokumen (no_dokumen, nama_dokumen, tahun, jenis_dokumen, status, file_path, tempat_penyimpanan, nama_klien, nilai_proyek) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [newNoDoc, nama_dokumen || doc.nama_dokumen, tahun || doc.tahun, jenis_dokumen || doc.jenis_dokumen, status || doc.status, doc.file_path, tempat_penyimpanan !== undefined ? tempat_penyimpanan : doc.tempat_penyimpanan, nama_klien !== undefined ? nama_klien : doc.nama_klien, nilai_proyek !== undefined ? nilai_proyek : doc.nilai_proyek]);
            
            // Update FK references
            await conn.query('UPDATE detail_peminjaman SET no_dokumen = ? WHERE no_dokumen = ?', [newNoDoc, oldNoDoc]);
            await conn.query('UPDATE detail_penyerahan SET no_dokumen = ? WHERE no_dokumen = ?', [newNoDoc, oldNoDoc]);
            
            // Delete old row
            await conn.query('DELETE FROM master_dokumen WHERE no_dokumen = ?', [oldNoDoc]);

            await conn.commit();
        } else {
            await db.pool.query('UPDATE master_dokumen SET nama_dokumen = ?, tahun = ?, jenis_dokumen = ?, status = ?, tempat_penyimpanan = ?, nama_klien = ?, nilai_proyek = ? WHERE no_dokumen = ?', 
                [nama_dokumen || doc.nama_dokumen, tahun || doc.tahun, jenis_dokumen || doc.jenis_dokumen, status || doc.status, tempat_penyimpanan !== undefined ? tempat_penyimpanan : doc.tempat_penyimpanan, nama_klien !== undefined ? nama_klien : doc.nama_klien, nilai_proyek !== undefined ? nilai_proyek : doc.nilai_proyek, oldNoDoc]);
        }

        res.json({ success: true, no_dokumen: newNoDoc });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Hapus dokumen
app.delete('/api/dokumen/:no_dokumen', async (req, res) => {
    try {
        const [doc] = await db.pool.query('SELECT * FROM master_dokumen WHERE no_dokumen = ?', [req.params.no_dokumen]);
        if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
        if (doc.status === 'Dipinjam') return res.status(400).json({ error: 'Tidak bisa menghapus dokumen yang sedang dipinjam' });
        
        // Hapus file jika ada
        if (doc.file_path) {
            const fp = path.join(UPLOADS_DIR, doc.file_path);
            if (fs.existsSync(fp)) {
                try { fs.unlinkSync(fp); } catch (e) {}
            }
        }
        await db.pool.query('DELETE FROM master_dokumen WHERE no_dokumen = ?', [req.params.no_dokumen]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: MASTER DIVISI
// =========================================================================
app.get('/api/divisi', async (req, res) => {
    try {
        const divisi = await db.pool.query('SELECT * FROM master_divisi ORDER BY kategori, nama_divisi');
        res.json(divisi);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/divisi', async (req, res) => {
    try {
        const { kategori, nama_divisi } = req.body;
        if (!kategori || !nama_divisi) {
            return res.status(400).json({ error: 'Kategori dan nama divisi harus diisi' });
        }
        await db.pool.query('INSERT INTO master_divisi (kategori, nama_divisi) VALUES (?, ?)', [kategori, nama_divisi]);
        res.json({ success: true });
    } catch (err) {
        if (err.message.includes('Duplicate entry') || err.message.includes('UNIQUE')) {
            res.status(400).json({ error: 'Nama divisi sudah ada' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

app.delete('/api/divisi/:id', async (req, res) => {
    try {
        await db.pool.query('DELETE FROM master_divisi WHERE id_divisi = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// START SERVER WITH DATABASE INITIALIZATION
// =========================================================================
db.initializeDatabase()
    .then(() => {
        app.listen(PORT, async () => {
            console.log(`\n🚀 SIONE Server berjalan di http://localhost:${PORT}`);
            console.log(`📂 Buka browser dan akses: http://localhost:${PORT}\n`);

            // Auto-link orphaned files to documents
            try {
                const docs = await db.pool.query('SELECT no_dokumen FROM master_dokumen WHERE file_path IS NULL');
                const files = fs.readdirSync(UPLOADS_DIR);
                let linked = 0;
                for (const doc of docs) {
                    const safeNo = doc.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_');
                    const match = files.find(f => f.startsWith(safeNo + '.'));
                    if (match) {
                        await db.pool.query('UPDATE master_dokumen SET file_path = ? WHERE no_dokumen = ?', [match, doc.no_dokumen]);
                        linked++;
                    }
                }
                if (linked > 0) console.log(`📎 ${linked} dokumen otomatis dihubungkan dengan file-nya`);
            } catch (e) { /* ignore */ }
        });
    })
    .catch(err => {
        console.error("❌ Gagal menginisialisasi database:", err.message);
        process.exit(1);
    });
