'use strict';

const express = require('express');
const cors = require('cors');
const db = require('./database');
const generateInspectionPDF = require('./generate-pdf');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

const { google } = require('googleapis');
const { PassThrough, Duplex } = require('stream');
const fs = require('fs');

// Konfigurasi Google Drive Upload
const GDRIVE_FOLDER_ID = '1EwTaJuTZtS2A_LZZDtFv8RrbE7SVYX7i';

// Helper function to upload to Google Drive
async function uploadToGoogleDrive(buffer, filename) {
    if (!fs.existsSync('./google-credentials.json')) {
        console.warn('⚠️ File google-credentials.json tidak ditemukan. Melewati proses upload ke Google Drive.');
        return null;
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive.file']
        });

        const drive = google.drive({ version: 'v3', auth });

        // Ubah buffer menjadi stream agar bisa dibaca oleh google drive api
        const bufferStream = new Duplex();
        bufferStream.push(buffer);
        bufferStream.push(null);

        const fileMetadata = {
            name: filename,
            parents: [GDRIVE_FOLDER_ID]
        };

        const media = {
            mimeType: 'application/pdf',
            body: bufferStream
        };

        const res = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        console.log(`✅ Berhasil upload ke Google Drive! File ID: ${res.data.id}`);
        return res.data;
    } catch (err) {
        console.error('❌ Terjadi kesalahan saat upload ke Google Drive:', err.message);
        return null; // Don't crash the generation if upload fails
    }
}

// =========================================================================
// API: FORM SETTINGS
// =========================================================================

/**
 * GET /api/settings
 * Mengembalikan nilai revision_number dan revision_date saat ini.
 * Response: { revision_number: string, revision_date: string }
 */
app.get('/api/settings', (req, res) => {
    try {
        const rows = db.prepare(`SELECT setting_key, setting_value FROM form_settings`).all();
        const settings = {};
        for (const row of rows) {
            settings[row.setting_key] = row.setting_value;
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/settings
 * Memperbarui nilai revision_number dan/atau revision_date.
 * Request body: { revision_number?: string, revision_date?: string }
 * Response:     { success: true, data: { revision_number, revision_date } }
 */
app.put('/api/settings', (req, res) => {
    try {
        const { revision_number, revision_date } = req.body;

        if (revision_number === undefined && revision_date === undefined) {
            return res.status(400).json({
                error: 'Minimal satu field harus disertakan: revision_number atau revision_date.'
            });
        }

        const updateSetting = db.prepare(`
            UPDATE form_settings
            SET setting_value = ?
            WHERE setting_key = ?
        `);

        const applyUpdate = db.transaction(() => {
            if (revision_number !== undefined) {
                updateSetting.run(revision_number, 'revision_number');
            }
            if (revision_date !== undefined) {
                updateSetting.run(revision_date, 'revision_date');
            }
        });

        applyUpdate();

        const rows = db.prepare(`SELECT setting_key, setting_value FROM form_settings`).all();
        const updatedSettings = {};
        for (const row of rows) {
            updatedSettings[row.setting_key] = row.setting_value;
        }

        res.json({ success: true, data: updatedSettings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// API: GENERATE PDF (FP-MR15-05)
// =========================================================================

/**
 * POST /api/generate-pdf
 * Membuat dan mengunduh PDF formulir inspeksi FP-MR15-05
 * dengan nomor & tanggal revisi terkini dari database.
 * Response: PDF file (application/pdf)
 */
app.post('/api/generate-pdf', (req, res) => {
    try {
        console.log("-----------------------------------------");
        console.log("PDF Generation Triggered!");
        if (req.body && req.body.checklist) {
            console.log("First checklist item received:", req.body.checklist[0]);
        }

        const rows = db.prepare(`SELECT setting_key, setting_value FROM form_settings`).all();
        const settings = {};
        for (const row of rows) {
            settings[row.setting_key] = row.setting_value;
        }

        const revisionNumber = settings.revision_number || 'Rev.00';
        const revisionDate = settings.revision_date || '-';

        const filename = `FP-MR15-05_Inspeksi_Safety_Patrol_${Date.now()}.pdf`;

        // 1. Simpan output ke stream PassThrough
        const docStream = new PassThrough();
        const chunks = [];
        docStream.on('data', chunk => chunks.push(chunk));
        docStream.on('end', async () => {
            const pdfBuffer = Buffer.concat(chunks);

            // 2. Upload ke Google Drive di belakang layar
            uploadToGoogleDrive(pdfBuffer, filename);

            // 3. Kirim file PDF ke client
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(pdfBuffer);
        });

        // 4. Mulai generate PDF ke stream (bukan ke res langsung)
        generateInspectionPDF(revisionNumber, revisionDate, req.body || {}, docStream);

    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ error: 'Gagal membuat PDF: ' + err.message });
    }
});

// =========================================================================
// START SERVER
// =========================================================================

app.listen(PORT, () => {
    console.log(`\n🚀 Server Safety Patrol K3 berjalan di http://localhost:${PORT}`);
    console.log(`   GET  /api/settings      — Ambil nomor & tanggal revisi`);
    console.log(`   PUT  /api/settings      — Update nomor & tanggal revisi`);
    console.log(`   POST /api/generate-pdf  — Generate & unduh PDF FP-MR15-05`);
    console.log(`\n   Buka: http://localhost:${PORT}/inspection-form.html`);
    console.log(`          http://localhost:${PORT}/admin-dashboard.html\n`);
});
