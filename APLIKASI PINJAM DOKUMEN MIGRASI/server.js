const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { getPool, initDb, hashPassword, verifyPassword } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
let pool;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        if (req.params.no_dokumen) {
            cb(null, req.params.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_') + ext);
        } else {
            cb(null, 'temp_import_' + Date.now() + ext);
        }
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// === ADMIN LOGIN ===
app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        const rows = await pool.query('SELECT password_hash FROM admin_settings WHERE id = 1');
        if (!rows[0]) return res.status(500).json({ error: 'Admin belum dikonfigurasi' });
        if (verifyPassword(password, rows[0].password_hash)) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Kata sandi salah' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/password', async (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        if (!new_password || new_password.length < 4) return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
        const rows = await pool.query('SELECT password_hash FROM admin_settings WHERE id = 1');
        if (!rows[0]) return res.status(500).json({ error: 'Admin belum dikonfigurasi' });
        if (!verifyPassword(old_password, rows[0].password_hash)) return res.status(403).json({ error: 'Password lama salah' });
        const newHash = hashPassword(new_password);
        await pool.query('UPDATE admin_settings SET password_hash = ?, reset_token = NULL WHERE id = 1', [newHash]);
        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/generate-reset', async (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000).toISOString();
        await pool.query('UPDATE admin_settings SET reset_token = ?, reset_token_expiry = ? WHERE id = 1', [token, expiry]);
        const resetFile = path.join(__dirname, 'admin_reset.json');
        fs.writeFileSync(resetFile, JSON.stringify({ token, expiry, instruksi: 'Gunakan token ini di halaman login untuk mereset password admin.' }, null, 2));
        res.json({ success: true, message: 'File reset dibuat: admin_reset.json', file_path: resetFile });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/reset-password', async (req, res) => {
    try {
        const { token, new_password } = req.body;
        if (!new_password || new_password.length < 4) return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
        const rows = await pool.query('SELECT reset_token, reset_token_expiry FROM admin_settings WHERE id = 1');
        const admin = rows[0];
        if (!admin || !admin.reset_token) return res.status(400).json({ error: 'Tidak ada token reset yang aktif' });
        if (admin.reset_token !== token) return res.status(403).json({ error: 'Token reset tidak valid' });
        if (new Date(admin.reset_token_expiry) < new Date()) return res.status(400).json({ error: 'Token reset sudah kadaluarsa' });
        const newHash = hashPassword(new_password);
        await pool.query('UPDATE admin_settings SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = 1', [newHash]);
        const resetFile = path.join(__dirname, 'admin_reset.json');
        if (fs.existsSync(resetFile)) fs.unlinkSync(resetFile);
        res.json({ success: true, message: 'Password berhasil direset' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === DASHBOARD ===
app.get('/api/dashboard', async (req, res) => {
    try {
        const sedangDipinjam = (await pool.query("SELECT COUNT(DISTINCT id_transaksi) as total FROM trx_peminjaman WHERE status_keseluruhan IN ('Dipinjam','Kembali Sebagian') AND status_approval='Disetujui'"))[0];
        const terlambat = (await pool.query("SELECT COUNT(*) as total FROM trx_peminjaman WHERE batas_waktu < CURDATE() AND status_keseluruhan IN ('Dipinjam','Kembali Sebagian') AND status_approval='Disetujui'"))[0];
        const totalBulanIni = (await pool.query("SELECT COUNT(*) as total FROM trx_peminjaman WHERE DATE_FORMAT(tgl_pinjam,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m') AND status_approval='Disetujui'"))[0];
        const pendingCount = (await pool.query("SELECT (SELECT COUNT(*) FROM trx_peminjaman WHERE status_approval='Menunggu')+(SELECT COUNT(*) FROM log_pengembalian WHERE status_approval='Menunggu')+(SELECT COUNT(*) FROM trx_penyerahan WHERE status_approval='Menunggu') as total"))[0];
        res.json({ sedangDipinjam: sedangDipinjam.total, terlambat: terlambat.total, totalBulanIni: totalBulanIni.total, pendingCount: pendingCount.total });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === TRANSAKSI ===
app.get('/api/transaksi', async (req, res) => {
    try {
        const transaksi = await pool.query(`SELECT t.id_transaksi,t.tgl_pinjam,t.batas_waktu,t.nama_peminjam,t.email_peminjam,t.status_keseluruhan,t.status_approval,t.ttd_peminjam,t.ttd_pic,d.nama_divisi,d.kategori,COUNT(dt.id_detail) as jml_dokumen,SUM(CASE WHEN dt.status_dokumen='Sudah Kembali' THEN 1 ELSE 0 END) as jml_kembali FROM trx_peminjaman t JOIN master_divisi d ON t.id_divisi=d.id_divisi LEFT JOIN detail_peminjaman dt ON t.id_transaksi=dt.id_transaksi WHERE t.status_approval='Disetujui' GROUP BY t.id_transaksi ORDER BY t.tgl_pinjam DESC`);
        const now = new Date().toISOString().split('T')[0];
        for (const trx of transaksi) {
            if (trx.batas_waktu < now && trx.status_keseluruhan !== 'Selesai') {
                trx.status_keseluruhan = 'Terlambat';
                await pool.query("UPDATE trx_peminjaman SET status_keseluruhan='Terlambat' WHERE id_transaksi=?", [trx.id_transaksi]);
            }
        }
        res.json(transaksi);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/transaksi/:id', async (req, res) => {
    try {
        const trx = (await pool.query('SELECT t.*,d.nama_divisi FROM trx_peminjaman t JOIN master_divisi d ON t.id_divisi=d.id_divisi WHERE t.id_transaksi=?', [req.params.id]))[0];
        if (!trx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
        const details = await pool.query('SELECT dp.*,md.nama_dokumen FROM detail_peminjaman dp JOIN master_dokumen md ON dp.no_dokumen=md.no_dokumen WHERE dp.id_transaksi=?', [req.params.id]);
        res.json({ ...trx, details });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/peminjaman', async (req, res) => {
    try {
        const { batas_waktu, id_divisi, nama_peminjam, email_peminjam, dokumen, file_lampiran } = req.body;
        const tgl_pinjam = new Date().toISOString().split('T')[0];
        const bulan = String(new Date().getMonth()+1).padStart(2,'0');
        const tahun = String(new Date().getFullYear()).slice(-2);
        const lastRows = await pool.query('SELECT id_transaksi FROM trx_peminjaman WHERE id_transaksi LIKE ? ORDER BY id_transaksi DESC LIMIT 1', [`OGRE-${tahun}${bulan}-%`]);
        let nextNum = 1;
        if (lastRows[0]) { const parts = lastRows[0].id_transaksi.split('-'); nextNum = parseInt(parts[2]) + 1; }
        const id_transaksi = `OGRE-${tahun}${bulan}-${String(nextNum).padStart(3,'0')}`;
        await pool.query('INSERT INTO trx_peminjaman (id_transaksi,tgl_pinjam,batas_waktu,id_divisi,nama_peminjam,email_peminjam,file_lampiran,status_keseluruhan,status_approval,ttd_peminjam,ttd_pic) VALUES (?,?,?,?,?,?,?,\'Menunggu Persetujuan\',\'Menunggu\',\'n/a\',\'n/a\')', [id_transaksi, tgl_pinjam, batas_waktu, id_divisi, nama_peminjam, email_peminjam||null, file_lampiran||null]);
        for (const noDoc of dokumen) {
            await pool.query("INSERT INTO detail_peminjaman (id_transaksi,no_dokumen,status_dokumen) VALUES (?,?,'Menunggu')", [id_transaksi, noDoc]);
        }
        res.json({ success: true, id_transaksi });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === PENGEMBALIAN ===
app.post('/api/pengembalian', async (req, res) => {
    try {
        const { id_transaksi, dokumen_kembali, nama_pengembali } = req.body;
        const tgl_kembali = new Date().toISOString().split('T')[0];
        const result = await pool.query("INSERT INTO log_pengembalian (id_transaksi,tgl_kembali,nama_pengembali,status_approval,ttd_pengembali,ttd_pic) VALUES (?,?,?,'Menunggu','n/a','n/a')", [id_transaksi, tgl_kembali, nama_pengembali||'n/a']);
        await pool.query('UPDATE log_pengembalian SET catatan_tolak=? WHERE id_pengembalian=?', [JSON.stringify(dokumen_kembali), result.insertId]);
        res.json({ success: true, id_pengembalian: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === PENYERAHAN ===
app.post('/api/penyerahan', async (req, res) => {
    try {
        const { nama_penyerah, id_divisi, dokumen } = req.body;
        const tgl_penyerahan = new Date().toISOString().split('T')[0];
        const bulan = String(new Date().getMonth()+1).padStart(2,'0');
        const tahun = String(new Date().getFullYear()).slice(-2);
        const lastRows = await pool.query('SELECT id_penyerahan FROM trx_penyerahan WHERE id_penyerahan LIKE ? ORDER BY id_penyerahan DESC LIMIT 1', [`RCV-${tahun}${bulan}-%`]);
        let nextNum = 1;
        if (lastRows[0]) { const parts = lastRows[0].id_penyerahan.split('-'); nextNum = parseInt(parts[2]) + 1; }
        const id_penyerahan = `RCV-${tahun}${bulan}-${String(nextNum).padStart(3,'0')}`;
        await pool.query("INSERT INTO trx_penyerahan (id_penyerahan,tgl_penyerahan,nama_penyerah,id_divisi,status_approval,ttd_penyerah,ttd_pic) VALUES (?,?,?,?,'Menunggu','n/a','n/a')", [id_penyerahan, tgl_penyerahan, nama_penyerah, id_divisi]);
        for (const doc of dokumen) {
            await pool.query('INSERT INTO detail_penyerahan (id_penyerahan,no_dokumen,nama_dokumen,tahun,jenis_dokumen,file_path,nama_klien,nilai_proyek) VALUES (?,?,?,?,?,?,?,?)', [id_penyerahan, doc.no, doc.nama, doc.tahun, doc.jenis, doc.file_path||null, doc.nama_klien||null, doc.nilai_proyek||null]);
        }
        res.json({ success: true, id_penyerahan });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === PENDING/APPROVAL ===
app.get('/api/pending', async (req, res) => {
    try {
        const peminjaman = await pool.query("SELECT t.id_transaksi as id,'peminjaman' as tipe,t.tgl_pinjam as tanggal,t.nama_peminjam as nama,t.email_peminjam as email,t.batas_waktu,d.nama_divisi,COUNT(dt.id_detail) as jml_dokumen FROM trx_peminjaman t JOIN master_divisi d ON t.id_divisi=d.id_divisi LEFT JOIN detail_peminjaman dt ON t.id_transaksi=dt.id_transaksi WHERE t.status_approval='Menunggu' GROUP BY t.id_transaksi ORDER BY t.tgl_pinjam DESC");
        const pengembalian = await pool.query("SELECT lp.id_pengembalian as id,'pengembalian' as tipe,lp.tgl_kembali as tanggal,lp.nama_pengembali as nama,t.nama_peminjam,t.id_transaksi,d.nama_divisi,lp.catatan_tolak as dokumen_json FROM log_pengembalian lp JOIN trx_peminjaman t ON lp.id_transaksi=t.id_transaksi JOIN master_divisi d ON t.id_divisi=d.id_divisi WHERE lp.status_approval='Menunggu' ORDER BY lp.tgl_kembali DESC");
        const penyerahan = await pool.query("SELECT p.id_penyerahan as id,'penyerahan' as tipe,p.tgl_penyerahan as tanggal,p.nama_penyerah as nama,d.nama_divisi,COUNT(dp.id_detail) as jml_dokumen FROM trx_penyerahan p JOIN master_divisi d ON p.id_divisi=d.id_divisi LEFT JOIN detail_penyerahan dp ON p.id_penyerahan=dp.id_penyerahan WHERE p.status_approval='Menunggu' GROUP BY p.id_penyerahan ORDER BY p.tgl_penyerahan DESC");
        pengembalian.forEach(p => { try { p.dokumen_list = JSON.parse(p.dokumen_json); } catch { p.dokumen_list = []; } delete p.dokumen_json; });
        res.json({ peminjaman, pengembalian, penyerahan });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/pending/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        if (type === 'peminjaman') {
            const trx = (await pool.query('SELECT t.*,d.nama_divisi FROM trx_peminjaman t JOIN master_divisi d ON t.id_divisi=d.id_divisi WHERE t.id_transaksi=?', [id]))[0];
            const details = await pool.query('SELECT dp.*,md.nama_dokumen FROM detail_peminjaman dp JOIN master_dokumen md ON dp.no_dokumen=md.no_dokumen WHERE dp.id_transaksi=?', [id]);
            res.json({ ...trx, details });
        } else if (type === 'penyerahan') {
            const trx = (await pool.query('SELECT p.*,d.nama_divisi FROM trx_penyerahan p JOIN master_divisi d ON p.id_divisi=d.id_divisi WHERE p.id_penyerahan=?', [id]))[0];
            const details = await pool.query('SELECT * FROM detail_penyerahan WHERE id_penyerahan=?', [id]);
            res.json({ ...trx, details });
        } else if (type === 'pengembalian') {
            const log = (await pool.query('SELECT lp.*,t.nama_peminjam,t.id_transaksi as trx_id,d.nama_divisi FROM log_pengembalian lp JOIN trx_peminjaman t ON lp.id_transaksi=t.id_transaksi JOIN master_divisi d ON t.id_divisi=d.id_divisi WHERE lp.id_pengembalian=?', [id]))[0];
            let dokumen_list = []; try { dokumen_list = JSON.parse(log.catatan_tolak); } catch {}
            const details = [];
            for (const noDoc of dokumen_list) {
                const doc = (await pool.query('SELECT * FROM master_dokumen WHERE no_dokumen=?', [noDoc]))[0];
                details.push(doc || { no_dokumen: noDoc, nama_dokumen: 'Unknown' });
            }
            res.json({ ...log, dokumen_list, details });
        } else { res.status(400).json({ error: 'Tipe tidak valid' }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/approve', async (req, res) => {
    try {
        const { type, id, ttd_penyerah, ttd_pic } = req.body;
        if (type === 'peminjaman') {
            await pool.query("UPDATE trx_peminjaman SET status_approval='Disetujui',status_keseluruhan='Dipinjam',ttd_peminjam=?,ttd_pic=? WHERE id_transaksi=?", [ttd_penyerah||'n/a', ttd_pic||'n/a', id]);
            const details = await pool.query('SELECT no_dokumen FROM detail_peminjaman WHERE id_transaksi=?', [id]);
            for (const d of details) {
                await pool.query("UPDATE detail_peminjaman SET status_dokumen='Dipinjam' WHERE id_transaksi=? AND no_dokumen=?", [id, d.no_dokumen]);
                await pool.query("UPDATE master_dokumen SET status='Dipinjam' WHERE no_dokumen=?", [d.no_dokumen]);
            }
        } else if (type === 'pengembalian') {
            const log = (await pool.query('SELECT * FROM log_pengembalian WHERE id_pengembalian=?', [id]))[0];
            if (!log) return res.status(404).json({ error: 'Pengembalian tidak ditemukan' });
            let dokumen_kembali = []; try { dokumen_kembali = JSON.parse(log.catatan_tolak); } catch {}
            await pool.query("UPDATE log_pengembalian SET status_approval='Disetujui',ttd_pengembali=?,ttd_pic=?,catatan_tolak=NULL WHERE id_pengembalian=?", [ttd_penyerah||'n/a', ttd_pic||'n/a', id]);
            for (const noDoc of dokumen_kembali) {
                await pool.query("UPDATE detail_peminjaman SET status_dokumen='Sudah Kembali',tgl_dikembalikan=? WHERE id_transaksi=? AND no_dokumen=?", [log.tgl_kembali, log.id_transaksi, noDoc]);
                await pool.query("UPDATE master_dokumen SET status='Tersedia' WHERE no_dokumen=?", [noDoc]);
            }
            const remaining = (await pool.query("SELECT COUNT(*) as total FROM detail_peminjaman WHERE id_transaksi=? AND status_dokumen='Dipinjam'", [log.id_transaksi]))[0];
            let newStatus = remaining.total === 0 ? 'Selesai' : 'Kembali Sebagian';
            await pool.query('UPDATE trx_peminjaman SET status_keseluruhan=? WHERE id_transaksi=?', [newStatus, log.id_transaksi]);
        } else if (type === 'penyerahan') {
            await pool.query("UPDATE trx_penyerahan SET status_approval='Disetujui',ttd_penyerah=?,ttd_pic=? WHERE id_penyerahan=?", [ttd_penyerah||'n/a', ttd_pic||'n/a', id]);
            const details = await pool.query('SELECT * FROM detail_penyerahan WHERE id_penyerahan=?', [id]);
            for (const doc of details) {
                let filePath = doc.file_path || null;
                if (!filePath) {
                    const safeNo = doc.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_');
                    const uploadedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith(safeNo));
                    if (uploadedFiles.length > 0) filePath = uploadedFiles[0];
                }
                const existing = (await pool.query('SELECT no_dokumen FROM master_dokumen WHERE no_dokumen=?', [doc.no_dokumen]))[0];
                if (existing) {
                    if (filePath) await pool.query('UPDATE master_dokumen SET file_path=? WHERE no_dokumen=?', [filePath, doc.no_dokumen]);
                } else {
                    await pool.query("INSERT INTO master_dokumen (no_dokumen,nama_dokumen,tahun,jenis_dokumen,status,file_path,nama_klien,nilai_proyek) VALUES (?,?,?,?,'Tersedia',?,?,?)", [doc.no_dokumen, doc.nama_dokumen, doc.tahun, doc.jenis_dokumen, filePath, doc.nama_klien||null, doc.nilai_proyek||null]);
                }
            }
        } else { return res.status(400).json({ error: 'Tipe tidak valid' }); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reject', async (req, res) => {
    try {
        const { type, id, catatan } = req.body;
        if (type === 'peminjaman') {
            await pool.query("UPDATE trx_peminjaman SET status_approval='Ditolak',catatan_tolak=?,status_keseluruhan='Ditolak' WHERE id_transaksi=?", [catatan||'', id]);
            await pool.query('DELETE FROM detail_peminjaman WHERE id_transaksi=?', [id]);
        } else if (type === 'pengembalian') {
            await pool.query("UPDATE log_pengembalian SET status_approval='Ditolak',catatan_tolak=? WHERE id_pengembalian=?", [catatan||'', id]);
        } else if (type === 'penyerahan') {
            await pool.query("UPDATE trx_penyerahan SET status_approval='Ditolak',catatan_tolak=? WHERE id_penyerahan=?", [catatan||'', id]);
            await pool.query('DELETE FROM detail_penyerahan WHERE id_penyerahan=?', [id]);
        } else { return res.status(400).json({ error: 'Tipe tidak valid' }); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === MASTER DOKUMEN ===
app.get('/api/dokumen', async (req, res) => {
    try {
        const docs = await pool.query('SELECT * FROM master_dokumen ORDER BY no_dokumen');
        res.json(docs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
        sheet.addRow({ no_dokumen: 'DOC-2026-001', nama_dokumen: 'SOP Keuangan', tahun: 2026, jenis_dokumen: 'SOP', nama_klien: '', nilai_proyek: '' });
        sheet.addRow({ no_dokumen: 'DOC-2026-002', nama_dokumen: 'Perjanjian Kerjasama Vendor', tahun: 2025, jenis_dokumen: 'Kontrak', nama_klien: 'PT Maju Bersama', nilai_proyek: 'Rp 500.000.000' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Dokumen.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dokumen/export', async (req, res) => {
    try {
        const docs = await pool.query('SELECT * FROM master_dokumen ORDER BY no_dokumen');
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
            const row = sheet.addRow({ no_dokumen: doc.no_dokumen, nama_dokumen: doc.nama_dokumen, tahun: doc.tahun, jenis_dokumen: doc.jenis_dokumen, status: doc.status, tempat_penyimpanan: doc.tempat_penyimpanan||'-', nama_klien: doc.nama_klien||'-', nilai_proyek: doc.nilai_proyek||'-' });
            if (doc.file_path) {
                const link = host+'/api/dokumen/download/'+encodeURIComponent(doc.no_dokumen);
                row.getCell('file_link').value = { text: 'Download Dokumen', hyperlink: link, tooltip: 'Unduh file '+doc.file_path };
                row.getCell('file_link').font = { color: { argb: 'FF0563C1' }, underline: true };
            } else { row.getCell('file_link').value = 'Tidak ada file'; }
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Database_Dokumen.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dokumen/import-tempat', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const sheet = workbook.worksheets[0];
        if (!sheet) return res.status(400).json({ error: 'Worksheet tidak ditemukan' });
        const headerRow = sheet.getRow(1);
        let noDocIdx = -1, tempatIdx = -1;
        headerRow.eachCell((cell, colNumber) => {
            const val = (cell.value||'').toString().toLowerCase().trim();
            if (val.includes('no') && (val.includes('dokumen')||val.includes('doc'))) noDocIdx = colNumber;
            if (val.includes('tempat')||val.includes('penyimpanan')) tempatIdx = colNumber;
        });
        if (noDocIdx === -1) return res.status(400).json({ error: 'Kolom "No Dokumen" tidak ditemukan' });
        if (tempatIdx === -1) return res.status(400).json({ error: 'Kolom "Tempat Penyimpanan" tidak ditemukan' });
        let updated = 0, notFound = 0;
        for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
            const row = sheet.getRow(rowNum);
            const noDoc = (row.getCell(noDocIdx).value||'').toString().trim();
            const tempat = (row.getCell(tempatIdx).value||'').toString().trim();
            if (!noDoc || !tempat) continue;
            const doc = (await pool.query('SELECT no_dokumen FROM master_dokumen WHERE no_dokumen=?', [noDoc]))[0];
            if (doc) { await pool.query('UPDATE master_dokumen SET tempat_penyimpanan=? WHERE no_dokumen=?', [tempat, noDoc]); updated++; }
            else { notFound++; }
        }
        fs.unlinkSync(req.file.path);
        res.json({ success: true, updated, notFound });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dokumen/upload/:no_dokumen', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
        const doc = (await pool.query('SELECT * FROM master_dokumen WHERE no_dokumen=?', [req.params.no_dokumen]))[0];
        if (doc && doc.file_path) { const oldPath = path.join(UPLOADS_DIR, doc.file_path); if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); }
        if (doc) { await pool.query('UPDATE master_dokumen SET file_path=? WHERE no_dokumen=?', [req.file.filename, req.params.no_dokumen]); }
        res.json({ success: true, filename: req.file.filename });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dokumen/preview/:no_dokumen', async (req, res) => {
    try {
        const doc = (await pool.query('SELECT file_path FROM master_dokumen WHERE no_dokumen=?', [req.params.no_dokumen]))[0];
        if (!doc || !doc.file_path) return res.status(404).json({ error: 'File tidak tersedia' });
        const filePath = path.join(UPLOADS_DIR, doc.file_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan di server' });
        res.setHeader('Content-Disposition', 'inline; filename="'+doc.file_path+'"');
        res.sendFile(filePath);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dokumen/download/:no_dokumen', async (req, res) => {
    try {
        const doc = (await pool.query('SELECT file_path,nama_dokumen FROM master_dokumen WHERE no_dokumen=?', [req.params.no_dokumen]))[0];
        if (!doc || !doc.file_path) return res.status(404).json({ error: 'File tidak tersedia' });
        const filePath = path.join(UPLOADS_DIR, doc.file_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan di server' });
        const ext = path.extname(doc.file_path);
        const downloadName = doc.nama_dokumen.replace(/[^a-zA-Z0-9 _-]/g, '') + ext;
        res.download(filePath, downloadName);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/dokumen/:no_dokumen', async (req, res) => {
    try {
        const { no_dokumen_baru, nama_dokumen, tahun, jenis_dokumen, status, tempat_penyimpanan, nama_klien, nilai_proyek } = req.body;
        const oldNoDoc = req.params.no_dokumen;
        const newNoDoc = no_dokumen_baru || oldNoDoc;
        const doc = (await pool.query('SELECT * FROM master_dokumen WHERE no_dokumen=?', [oldNoDoc]))[0];
        if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
        if (newNoDoc !== oldNoDoc) {
            const existing = (await pool.query('SELECT no_dokumen FROM master_dokumen WHERE no_dokumen=?', [newNoDoc]))[0];
            if (existing) return res.status(400).json({ error: 'No dokumen baru sudah digunakan' });
            await pool.query('INSERT INTO master_dokumen (no_dokumen,nama_dokumen,tahun,jenis_dokumen,status,file_path,tempat_penyimpanan,nama_klien,nilai_proyek) VALUES (?,?,?,?,?,?,?,?,?)', [newNoDoc, nama_dokumen||doc.nama_dokumen, tahun||doc.tahun, jenis_dokumen||doc.jenis_dokumen, status||doc.status, doc.file_path, tempat_penyimpanan!==undefined?tempat_penyimpanan:doc.tempat_penyimpanan, nama_klien!==undefined?nama_klien:doc.nama_klien, nilai_proyek!==undefined?nilai_proyek:doc.nilai_proyek]);
            await pool.query('UPDATE detail_peminjaman SET no_dokumen=? WHERE no_dokumen=?', [newNoDoc, oldNoDoc]);
            await pool.query('UPDATE detail_penyerahan SET no_dokumen=? WHERE no_dokumen=?', [newNoDoc, oldNoDoc]);
            await pool.query('DELETE FROM master_dokumen WHERE no_dokumen=?', [oldNoDoc]);
        } else {
            await pool.query('UPDATE master_dokumen SET nama_dokumen=?,tahun=?,jenis_dokumen=?,status=?,tempat_penyimpanan=?,nama_klien=?,nilai_proyek=? WHERE no_dokumen=?', [nama_dokumen||doc.nama_dokumen, tahun||doc.tahun, jenis_dokumen||doc.jenis_dokumen, status||doc.status, tempat_penyimpanan!==undefined?tempat_penyimpanan:doc.tempat_penyimpanan, nama_klien!==undefined?nama_klien:doc.nama_klien, nilai_proyek!==undefined?nilai_proyek:doc.nilai_proyek, oldNoDoc]);
        }
        res.json({ success: true, no_dokumen: newNoDoc });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/dokumen/:no_dokumen', async (req, res) => {
    try {
        const doc = (await pool.query('SELECT * FROM master_dokumen WHERE no_dokumen=?', [req.params.no_dokumen]))[0];
        if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
        if (doc.status === 'Dipinjam') return res.status(400).json({ error: 'Tidak bisa menghapus dokumen yang sedang dipinjam' });
        if (doc.file_path) { const fp = path.join(UPLOADS_DIR, doc.file_path); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
        await pool.query('DELETE FROM master_dokumen WHERE no_dokumen=?', [req.params.no_dokumen]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === MASTER DIVISI ===
app.get('/api/divisi', async (req, res) => {
    try { res.json(await pool.query('SELECT * FROM master_divisi ORDER BY kategori,nama_divisi')); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/divisi', async (req, res) => {
    try {
        const { kategori, nama_divisi } = req.body;
        if (!kategori || !nama_divisi) return res.status(400).json({ error: 'Kategori dan nama divisi harus diisi' });
        await pool.query('INSERT INTO master_divisi (kategori,nama_divisi) VALUES (?,?)', [kategori, nama_divisi]);
        res.json({ success: true });
    } catch (err) {
        if (err.message.includes('Duplicate')) res.status(400).json({ error: 'Nama divisi sudah ada' });
        else res.status(500).json({ error: err.message });
    }
});

app.delete('/api/divisi/:id', async (req, res) => {
    try { await pool.query('DELETE FROM master_divisi WHERE id_divisi=?', [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// === MASTER JENIS DOKUMEN ===
app.get('/api/jenis_dokumen', async (req, res) => {
    try { res.json(await pool.query('SELECT * FROM master_jenis_dokumen ORDER BY id')); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/jenis_dokumen', async (req, res) => {
    try {
        const { nama_jenis } = req.body;
        if (!nama_jenis) return res.status(400).json({ error: 'Nama jenis harus diisi' });
        await pool.query('INSERT INTO master_jenis_dokumen (nama_jenis) VALUES (?)', [nama_jenis]);
        res.json({ success: true });
    } catch (err) {
        if (err.message.includes('Duplicate')) res.status(400).json({ error: 'Jenis dokumen sudah ada' });
        else res.status(500).json({ error: err.message });
    }
});

// === START SERVER ===
async function startServer() {
    pool = await initDb();
    
    // Inisialisasi tabel master_jenis_dokumen jika belum ada
    await pool.query(`CREATE TABLE IF NOT EXISTS master_jenis_dokumen (id INT AUTO_INCREMENT PRIMARY KEY, nama_jenis VARCHAR(100) NOT NULL UNIQUE)`);
    const existingJenis = await pool.query('SELECT COUNT(*) as count FROM master_jenis_dokumen');
    if (existingJenis[0].count === 0) {
        const defaults = ['SOP', 'Blueprint', 'Laporan', 'Kontrak', 'Sertifikat', 'BAST', 'Lainnya'];
        for (const j of defaults) {
            await pool.query('INSERT IGNORE INTO master_jenis_dokumen (nama_jenis) VALUES (?)', [j]);
        }
    }

    app.listen(PORT, async () => {
        console.log('\nðŸš€ SIONE Server berjalan di http://localhost:' + PORT);
        console.log('ðŸ“‚ Buka browser dan akses: http://localhost:' + PORT + '\n');
        try {
            const docs = await pool.query('SELECT no_dokumen FROM master_dokumen WHERE file_path IS NULL');
            const files = fs.readdirSync(UPLOADS_DIR);
            let linked = 0;
            for (const doc of docs) {
                const safeNo = doc.no_dokumen.replace(/[^a-zA-Z0-9-_]/g, '_');
                const match = files.find(f => f.startsWith(safeNo + '.'));
                if (match) { await pool.query('UPDATE master_dokumen SET file_path=? WHERE no_dokumen=?', [match, doc.no_dokumen]); linked++; }
            }
            if (linked > 0) console.log('ðŸ“Ž ' + linked + ' dokumen otomatis dihubungkan dengan file-nya');
        } catch (e) { /* ignore */ }
    });
}

startServer().catch(err => { console.error('âŒ Gagal start server:', err); process.exit(1); });
