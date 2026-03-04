'use strict';

/**
 * generate-pdf.js
 * Modul untuk membuat PDF Formulir Safety Patrol K3 Di Proyek
 * Format dokumen: FP-MR15-05
 *
 * Bisa dipanggil langsung sebagai modul:
 *   const generatePDF = require('./generate-pdf');
 *   generatePDF(revisionNumber, revisionDate, outputStream);
 */

const PDFDocument = require('pdfkit');

// ─── Warna tema dokumen ────────────────────────────────────────────────────────
const COLOR_BORDER = '#000000';
const COLOR_BODY_TEXT = '#000000';
const COLOR_HEADER_BG = '#FFFFFF';

// ─── Ukuran halaman ────────────────────────────────────────────────────────────
const PAGE_MARGIN = 40;

/**
 * Buat PDF formulir FP-MR15-05 dan pipe ke stream.
 *
 * @param {string} revisionNumber  – Misal: 'Rev.02'
 * @param {string} revisionDate    – Misal: '4 Agustus 2022'
 * @param {Object} formData        - Data dari front-end form
 * @param {WritableStream} stream  – response/fs stream tujuan
 */
function generateInspectionPDF(revisionNumber, revisionDate, formData = {}, stream) {
    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
        info: {
            Title: 'Safety Patrol K3 Di Proyek – FP-MR15-05',
            Author: 'Sistem Safety Patrol K3',
        }
    });

    doc.pipe(stream);

    const pw = doc.page.width - PAGE_MARGIN * 2;  // usable width
    const pl = PAGE_MARGIN;                          // left X
    let y = PAGE_MARGIN;                          // current Y cursor

    // ── Helper: Draw bordered cell with text ─────────────────────────────────
    function drawCell(x, cy, w, h, text, opts = {}) {
        const {
            fontSize = 9,
            font = 'Helvetica',
            align = 'left',
            fillBg = null,
            bold = false,
            padding = 4
        } = opts;

        if (fillBg) {
            doc.rect(x, cy, w, h).fill(fillBg);
        }
        doc.rect(x, cy, w, h).stroke(COLOR_BORDER);

        doc.font(bold ? 'Helvetica-Bold' : font)
            .fontSize(fontSize)
            .fillColor(COLOR_BODY_TEXT)
            .text(text, x + padding, cy + padding, {
                width: w - padding * 2,
                height: h - padding * 2,
                align: align
            });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. HEADER & LOGO
    // ══════════════════════════════════════════════════════════════════════════
    try {
        doc.image('LOGO HEADER FORM.png', pl, y, { width: 80 });
    } catch (e) {
        console.error('Logo tidak ditemukan:', e.message);
    }

    const headerRightW = 150;
    const headerH = 14;

    // FP-MR15-05
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BODY_TEXT)
        .text('FP-MR15-05', pl + pw - headerRightW + 4, y, { width: headerRightW - 8, align: 'right' });
    y += headerH;

    // Rev
    doc.font('Helvetica').fontSize(9)
        .text(revisionNumber, pl + pw - headerRightW + 4, y, { width: headerRightW - 8, align: 'right' });
    y += headerH;

    // Tgl Rev
    doc.font('Helvetica').fontSize(9)
        .text('Tgl Rev. ' + revisionDate, pl + pw - headerRightW + 4, y, { width: headerRightW - 8, align: 'right' });
    y += headerH + 8;

    // ══════════════════════════════════════════════════════════════════════════
    // 2. JUDUL
    // ══════════════════════════════════════════════════════════════════════════
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_BODY_TEXT)
        .text('SAFETY PATROL K3 DI PROYEK', pl, y, { width: pw, align: 'center' });
    y += 22;

    // ══════════════════════════════════════════════════════════════════════════
    // 3. DATA UMUM — 5 baris info
    // ══════════════════════════════════════════════════════════════════════════
    const labelW = 160;
    const sepW = 10; // for ":"
    const valW = pw - labelW - sepW;
    const rowH = 18;

    const infoFields = [
        { label: 'Nama  Proyek', key: 'nama_proyek' },
        { label: 'Unit Kerja', key: 'unit_kerja' },
        { label: 'Area/Wilayah', key: 'area_wilayah' },
        { label: 'Tanggal Safety Patrol', key: 'tanggal_patrol' },
        { label: 'Petugas Safety Patrol', key: 'petugas_patrol' },
    ];

    infoFields.forEach((field) => {
        // Label cell
        doc.rect(pl, y, labelW, rowH).stroke(COLOR_BORDER);
        doc.font('Helvetica').fontSize(9).fillColor(COLOR_BODY_TEXT)
            .text(field.label, pl + 4, y + 4, { width: labelW - 8 });

        // Separator ":"
        doc.rect(pl + labelW, y, sepW, rowH).stroke(COLOR_BORDER);
        doc.font('Helvetica').fontSize(9)
            .text(':', pl + labelW + 2, y + 4, { width: sepW - 4, align: 'center' });

        // Value cell
        doc.rect(pl + labelW + sepW, y, valW, rowH).stroke(COLOR_BORDER);
        const val = formData[field.key] || '';
        if (val) {
            doc.font('Helvetica').fontSize(9).fillColor(COLOR_BODY_TEXT)
                .text(val, pl + labelW + sepW + 4, y + 4, { width: valW - 8 });
        }

        y += rowH;
    });

    y += 8;

    // ══════════════════════════════════════════════════════════════════════════
    // 4. TABEL CHECKLIST — Sesuai referensi
    // ══════════════════════════════════════════════════════════════════════════
    // Kolom: NO | URAIAN | ADA | TIDAK | CATATAN
    const colNo = 30;
    const colUraian = pw * 0.48;
    const colAda = 40;
    const colTidak = 45;
    const colCatatan = pw - colNo - colUraian - colAda - colTidak;
    const tblHeaderH = 28;

    // ── Header Row ──
    // NO
    doc.rect(pl, y, colNo, tblHeaderH).stroke(COLOR_BORDER);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_BODY_TEXT)
        .text('NO', pl, y + 4, { width: colNo, align: 'center' });

    // URAIAN
    doc.rect(pl + colNo, y, colUraian, tblHeaderH).stroke(COLOR_BORDER);
    doc.text('URAIAN', pl + colNo, y + 4, { width: colUraian, align: 'center' });

    // HASIL INSPEKSI — spans ADA + TIDAK
    const colHasil = colAda + colTidak;
    doc.rect(pl + colNo + colUraian, y, colHasil, tblHeaderH / 2).stroke(COLOR_BORDER);
    doc.text('HASIL INSPEKSI', pl + colNo + colUraian, y + 2, { width: colHasil, align: 'center' });

    // ADA / TIDAK sub-headers
    doc.rect(pl + colNo + colUraian, y + tblHeaderH / 2, colAda, tblHeaderH / 2).stroke(COLOR_BORDER);
    doc.fontSize(7).text('ADA', pl + colNo + colUraian, y + tblHeaderH / 2 + 3, { width: colAda, align: 'center' });

    doc.rect(pl + colNo + colUraian + colAda, y + tblHeaderH / 2, colTidak, tblHeaderH / 2).stroke(COLOR_BORDER);
    doc.text('TIDAK', pl + colNo + colUraian + colAda, y + tblHeaderH / 2 + 3, { width: colTidak, align: 'center' });

    // CATATAN
    doc.rect(pl + colNo + colUraian + colHasil, y, colCatatan, tblHeaderH).stroke(COLOR_BORDER);
    doc.fontSize(8).text('CATATAN', pl + colNo + colUraian + colHasil, y + 4, { width: colCatatan, align: 'center' });

    y += tblHeaderH;

    // ── Checklist Data ──
    const sections = [
        {
            title: 'TEMPAT KERJA KANTOR PROYEK',
            number: '1',
            items: [
                'Adanya Rambu-rambu K3',
                'Bersih dari ceceran oli atau tumpahan lainnya',
                'Jalur untuk jalan bebas dari halangan/benda-benda (Misal produk, kabel, dll)',
                'APD dan Kotak P3K disediakan',
                'Memiliki penerangan yang memadai',
                'Memiliki ventilasi udara yang memadai',
                'Terdapat APAR',
                'Tersedia air minum yang cukup',
                'Terdapat tanda jalur evakuasi yang jelas terlihat',
                'Adanya pembatasan ijin masuk pada daerah-daerah berbahaya',
                'Kondisi Peralatan Kantor (kabel, steker dlm kondisi baik/tdk bocor/rusak)',
                'Wadah penyimpanan bahan memiliki simbol dan label yang jelas',
                'Penempatan dan penyimpanan bahan/material sesuai',
                'Mesin/peralatan dalam perbaikan diberi penandaan (LOTO) yang jelas',
                'Wadah penyimpanan bahan dalam kondisi baik (tidak bocor/rusak)',
            ]
        },
        {
            title: 'PEKERJA DAN CARA KERJA',
            number: '2',
            items: [
                'Pekerja menggunakan APD yang layak dan standar',
                'Pekerjaan dilakukan sesuai dengan instruksi kerja yang telah ditetapkan',
                'Menggunakan peralatan kerja yang layak',
                'Pekerja bekerja dengan serius',
                'Pekerja menerima surat tugas',
                'Pekerja menerima sosialisasi/pengenalan/pelatihan terkait dengan SMK3',
            ]
        },
        {
            title: 'TRANSPORTASI',
            number: '3',
            items: [
                'Kendaraan yang digunakan dalam kondisi layak dan aman (Rem bagus, Sabuk Pengaman, Ban Mobil Layak)',
                'Kelengkapan Kendaraan sesuai (STNK, SIM)',
                'Kotak P3K disediakan',
                'Apar disediakan',
            ]
        }
    ];

    const dataRowH = 16;
    const sectionRowH = 18;

    sections.forEach((section) => {
        // Cek apakah perlu pindah halaman
        if (y + sectionRowH > doc.page.height - PAGE_MARGIN - 40) {
            doc.addPage();
            y = PAGE_MARGIN;
        }

        // ── Section Header Row ──
        // NO column with section number
        doc.rect(pl, y, colNo, sectionRowH).stroke(COLOR_BORDER);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BODY_TEXT)
            .text(section.number, pl, y + 4, { width: colNo, align: 'center' });

        // Section title spans remaining columns
        const titleW = pw - colNo;
        doc.rect(pl + colNo, y, titleW, sectionRowH).stroke(COLOR_BORDER);
        doc.font('Helvetica-Bold').fontSize(9)
            .text(section.title, pl + colNo + 4, y + 4, { width: titleW - 8 });

        y += sectionRowH;

        // ── Item Rows ──
        let sectionGlobalItemIndex = 0;
        // Count previous section items to find our global starting index
        for (let i = 0; i < sections.findIndex(s => s.title === section.title); i++) {
            sectionGlobalItemIndex += sections[i].items.length;
        }

        section.items.forEach((item, itemIdx) => {
            const currentGlobalIndex = sectionGlobalItemIndex + itemIdx;

            // Find data for this specific item if it exists
            let itemData = null;
            if (formData.checklist && Array.isArray(formData.checklist)) {
                if (currentGlobalIndex < formData.checklist.length) {
                    itemData = formData.checklist[currentGlobalIndex];
                }
            }

            // Estimate required height based on notes AND item text itself
            let requiredH = dataRowH;

            // Check uraian wrapping height
            const itemTextHeight = doc.heightOfString(item, { width: colUraian - 8, fontSize: 8 });
            if (itemTextHeight + 8 > requiredH) {
                requiredH = itemTextHeight + 8;
            }

            // Check combined catatan and photo wrapping height
            let combinedCatatanH = 0;
            if (itemData && itemData.catatan) {
                combinedCatatanH += doc.heightOfString(itemData.catatan, { width: colCatatan - 8, fontSize: 8 }) + 4;
            }
            if (itemData && itemData.photos && itemData.photos.length > 0) {
                combinedCatatanH += (itemData.photos.length * 40) + ((itemData.photos.length - 1) * 4) + 4;
            }

            if (combinedCatatanH + 8 > requiredH) {
                requiredH = combinedCatatanH + 8;
            }

            // Cek apakah perlu pindah halaman
            if (y + requiredH > doc.page.height - PAGE_MARGIN - 40) {
                doc.addPage();
                y = PAGE_MARGIN;
            }

            // NO column (kosong untuk items)
            doc.rect(pl, y, colNo, requiredH).stroke(COLOR_BORDER);

            // URAIAN
            doc.rect(pl + colNo, y, colUraian, requiredH).stroke(COLOR_BORDER);
            doc.font('Helvetica').fontSize(8).fillColor(COLOR_BODY_TEXT)
                .text(item, pl + colNo + 4, y + 4, { width: colUraian - 8 });

            // ADA (checkbox area)
            doc.rect(pl + colNo + colUraian, y, colAda, requiredH).stroke(COLOR_BORDER);
            if (itemData && itemData.status && itemData.status.toLowerCase() === 'ada') {
                console.log(`✅ Rendering ADA for item [${currentGlobalIndex}]`);
                doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_BODY_TEXT)
                    .text('V', pl + colNo + colUraian, y + (requiredH / 2) - 6, { width: colAda, align: 'center' });
            }

            // TIDAK (checkbox area)
            doc.rect(pl + colNo + colUraian + colAda, y, colTidak, requiredH).stroke(COLOR_BORDER);
            if (itemData && itemData.status && itemData.status.toLowerCase() === 'tidak') {
                console.log(`❌ Rendering TIDAK for item [${currentGlobalIndex}]`);
                doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_BODY_TEXT)
                    .text('V', pl + colNo + colUraian + colAda, y + (requiredH / 2) - 6, { width: colTidak, align: 'center' });
            }

            // CATATAN
            doc.rect(pl + colNo + colUraian + colAda + colTidak, y, colCatatan, requiredH).stroke(COLOR_BORDER);
            let catatanY = y + 4;
            if (itemData && itemData.catatan) {
                doc.font('Helvetica').fontSize(8)
                    .text(itemData.catatan, pl + colNo + colUraian + colAda + colTidak + 4, catatanY, { width: colCatatan - 8 });
                catatanY += doc.heightOfString(itemData.catatan, { width: colCatatan - 8, fontSize: 8 }) + 4;
            }

            // Draw photos in CATATAN column if any
            if (itemData && itemData.photos && itemData.photos.length > 0) {
                let imgY = catatanY;
                itemData.photos.forEach(photoBase64 => {
                    if (photoBase64.startsWith('data:image')) {
                        try {
                            doc.image(photoBase64, pl + colNo + colUraian + colAda + colTidak + 4, imgY, { width: 50 });
                            imgY += 44; // 40px height + 4px margin
                        } catch (e) {
                            console.error('Error rendering image to PDF', e);
                        }
                    }
                });
            }

            y += requiredH;
        });
    });

    y += 10;

    // ══════════════════════════════════════════════════════════════════════════
    // 5. KOLOM MASUKAN DARI TENAGA KERJA
    // ══════════════════════════════════════════════════════════════════════════
    if (y + 80 > doc.page.height - PAGE_MARGIN - 80) {
        doc.addPage();
        y = PAGE_MARGIN;
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BODY_TEXT)
        .text('Kolom untuk mencari masukan dari Tenaga Kerja :', pl, y, { width: pw });
    y += 14;

    const masukanHeightNeeded = formData.masukan_tenaga_kerja ?
        Math.max(60, doc.heightOfString(formData.masukan_tenaga_kerja, { width: pw - 8, fontSize: 9 }) + 10) : 60;
    doc.rect(pl, y, pw, masukanHeightNeeded).stroke(COLOR_BORDER);
    if (formData.masukan_tenaga_kerja) {
        doc.font('Helvetica').fontSize(9)
            .text(formData.masukan_tenaga_kerja, pl + 4, y + 4, { width: pw - 8 });
    }
    y += masukanHeightNeeded + 8;

    // ══════════════════════════════════════════════════════════════════════════
    // 6. TEMUAN LAIN
    // ══════════════════════════════════════════════════════════════════════════
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BODY_TEXT)
        .text('Temuan lain (Jika ada) :', pl, y, { width: pw });
    y += 14;

    const temuanHeightNeeded = formData.temuan_lain ?
        Math.max(50, doc.heightOfString(formData.temuan_lain, { width: pw - 8, fontSize: 9 }) + 10) : 50;
    doc.rect(pl, y, pw, temuanHeightNeeded).stroke(COLOR_BORDER);
    if (formData.temuan_lain) {
        doc.font('Helvetica').fontSize(9)
            .text(formData.temuan_lain, pl + 4, y + 4, { width: pw - 8 });
    }
    y += temuanHeightNeeded + 12;

    // ══════════════════════════════════════════════════════════════════════════
    // 7. TANDA TANGAN
    // ══════════════════════════════════════════════════════════════════════════
    if (y + 90 > doc.page.height - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
    }

    const sigW = pw / 2; // Split into 2 columns instead of 3
    const sigH = 75;
    const sigs = [
        { label: 'Dibuat Oleh,', role: 'HSE Lapangan', key: 'dibuat' },
        { label: 'Diperiksa Oleh,', role: 'Leader Site', key: 'diperiksa' },
    ];

    sigs.forEach((sig, i) => {
        const sx = pl + i * sigW;
        doc.rect(sx, y, sigW, sigH).stroke(COLOR_BORDER);

        // Label (Disetujui/Diperiksa/Dibuat)
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_BODY_TEXT)
            .text(sig.label, sx + 4, y + 4, { width: sigW - 8, align: 'center' });

        // Role
        doc.font('Helvetica').fontSize(8)
            .text(sig.role, sx + 4, y + 16, { width: sigW - 8, align: 'center' });

        // Tanda tangan image (if exists)
        const sigData = formData.signatures && formData.signatures[sig.key];
        if (sigData && sigData.dataUrl) {
            try {
                // scale image to fit within signature area
                doc.image(sigData.dataUrl, sx + (sigW / 2) - 30, y + 25, { width: 60, height: 30 });
            } catch (e) { console.error('Error drawing sig image', e); }
        }

        // Garis tanda tangan
        doc.moveTo(sx + 15, y + sigH - 22).lineTo(sx + sigW - 15, y + sigH - 22)
            .stroke(COLOR_BORDER);

        // Nama Terang
        let sigName = 'Nama Terang';
        if (sigData && sigData.name) {
            sigName = sigData.name;
            doc.font('Helvetica-Bold');
        } else {
            doc.font('Helvetica');
        }

        doc.fontSize(8).fillColor(COLOR_BODY_TEXT)
            .text(sigName, sx + 4, y + sigH - 18, { width: sigW - 8, align: 'center' });
    });

    y += sigH + 10;

    doc.end();
}

module.exports = generateInspectionPDF;
