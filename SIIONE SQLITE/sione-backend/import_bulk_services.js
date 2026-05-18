const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const dataLayanan = [
    { layanan: "Inspeksi Pesawat Uap, Pesawat Angkat & Angkut, Bejana Tekan, Instalasi Pipa Penyalur, Tangki Timbun", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Lokasi\n• Spesifikasi Alat\n• Jumlah Unit / Tangki\n• Diameter & Tinggi (Tangki)\n• Panjang Jalur (Pipa)" },
    { layanan: "Sertifikasi Pesawat Uap, Pesawat Angkat & Angkut, Bejana Tekan, Instalasi Pipa Penyalur, Tangki Timbun", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Lokasi\n• Spesifikasi Alat\n• Jumlah Unit / Tangki\n• Diameter & Tinggi (Tangki)\n• Panjang Jalur (Pipa)" },
    { layanan: "Resertifikasi Pesawat Uap, Pesawat Angkat & Angkut, Bejana Tekan, Instalasi Pipa Penyalur, Tangki Timbun", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Lokasi\n• Spesifikasi Alat\n• Jumlah Unit / Tangki\n• Diameter & Tinggi (Tangki)\n• Panjang Jalur (Pipa)" },
    { layanan: "Inspeksi Pesawat Uap, Pesawat Angkat & Angkut, Bejana Tekan, Instalasi Pipa Penyalur, Tangki Timbun, Elevator/Escalator", cabang: "DBS Sustainability & Environment", parameter: "• Lokasi\n• Spesifikasi Alat\n• Jumlah Unit" },
    { layanan: "Sertifikasi Pesawat Uap, Pesawat Angkat & Angkut, Bejana Tekan, Instalasi Pipa Penyalur, Tangki Timbun, Elevator/Escalator", cabang: "DBS Sustainability & Environment", parameter: "• Lokasi\n• Spesifikasi Alat\n• Jumlah Unit" },
    { layanan: "Resertifikasi Pesawat Uap, Pesawat Angkat & Angkut, Bejana Tekan, Instalasi Pipa Penyalur, Tangki Timbun, Elevator/Escalator", cabang: "DBS Sustainability & Environment", parameter: "• Lokasi\n• Spesifikasi Alat\n• Jumlah Unit" },
    { layanan: "Verifikasi Penelusuran Teknis Ekspor (VPTE), Gas, Minyak & Petrokimia, Mineral & Batubara, Timah & Bijih Mineral", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Lokasi\n• Jumlah Shipment / Volume / Partai" },
    { layanan: "Survei Seismik 2D/3D", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Panjang Lintasan (km)\n• Medan (Darat/Laut)" },
    { layanan: "Inspeksi Rig & Peralatan Pemboran", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Kapasitas Rig (HP)\n• Lokasi" },
    { layanan: "Audit Energi, Energi Baru Terbarukan", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Luas Bangunan\n• Jumlah Peralatan\n• Kompleksitas Sistem" },
    { layanan: "Sistem Manajemen Keselamatan Ketenagalistrikan (SMK2) Pembangkit / Jaringan", cabang: "DBS Oil Gas & Renewable Energy", parameter: "• Lokasi\n• Kapasitas Pembangkit" },
    { layanan: "Draught Survey & Quality / Quantity, Batubara & Kokas, Bijih (Ore) & Timah", cabang: "DBS Coal & Mineral", parameter: "• Lokasi\n• Kapasitas Kapal (DWT)\n• Jumlah Tongkang / Volume" },
    { layanan: "Stockpile Calculation (Opname), Stockpile Management", cabang: "DBS Coal & Mineral", parameter: "• Luas Area (Ha)\n• Volume (MT)\n• Durasi Pekerjaan" },
    { layanan: "QA/QC Produk Mineral & Batubara, Quality Assurance", cabang: "DBS Coal & Mineral", parameter: "• Jumlah Titik Sampling\n• Parameter Analisa" },
    { layanan: "Inspeksi Pra Pengapalan, Survey Perkapalan", cabang: "DBS Coal & Mineral", parameter: "• Ukuran Kapal\n• Durasi Muat" },
    { layanan: "Studi Kelayakan Tambang (Feasibility Study), Mining (Pertambangan)", cabang: "DBS Coal & Mineral", parameter: "• Luas IUP\n• Lingkup Kajian" },
    { layanan: "Inventarisasi & Manajemen Aset, Aset Fisik", cabang: "DBS Infrastructur & Transportasi", parameter: "• Jumlah Aset\n• Sebaran Lokasi" },
    { layanan: "Detail Engineering Design (DED), Desain Konstruksi", cabang: "DBS Infrastructur & Transportasi", parameter: "• Luas Bangunan / Area\n• Kompleksitas Desain" },
    { layanan: "Supervisi Konstruksi, Supervisi", cabang: "DBS Infrastructur & Transportasi", parameter: "• Nilai Proyek\n• Durasi Proyek" },
    { layanan: "Sertifikasi Penunjang Penyalur Petir, Pemadam Kebakaran", cabang: "DBS Infrastructur & Transportasi", parameter: "• Lokasi\n• Jumlah Titik / Sistem" },
    { layanan: "Resertifikasi Penunjang Penyalur Petir, Pemadam Kebakaran", cabang: "DBS Infrastructur & Transportasi", parameter: "• Lokasi\n• Jumlah Titik / Sistem" },
    { layanan: "Verifikasi TKDN (Tingkat Komponen Dalam Negeri), TKDN", cabang: "DBS Industrial Services", parameter: "• Nilai Proyek\n• Jenis Barang/Jasa" },
    { layanan: "Sertifikasi ISO (9001, 14001, 45001) & SMK3, Sistem Manajemen", cabang: "DBS Industrial Services", parameter: "• Jumlah Karyawan\n• Jumlah Site / Lokasi\n• Skala Risiko" },
    { layanan: "Sertifikasi Halal, Produk", cabang: "DBS Industrial Services", parameter: "• Jumlah Produk / Varian\n• Skala Usaha" },
    { layanan: "Konsultansi ESG & Sustainability Report, ESG", cabang: "DBS Sustainability & Environment", parameter: "• Skala Perusahaan\n• Standar yang digunakan" },
    { layanan: "Net Zero Roadmap & Inventarisasi GRK, Iklim / Karbon", cabang: "DBS Sustainability & Environment", parameter: "• Jumlah Sumber Emisi\n• Target Penurunan" },
    { layanan: "AMDAL / UKL-UPL, Lingkungan", cabang: "DBS Sustainability & Environment", parameter: "• Luas Lahan\n• Besaran Dampak" },
    { layanan: "Sertifikasi Laik Operasi (SLO), Sistem Laik Operasi", cabang: "DBS Sustainability & Environment", parameter: "• Kapasitas Daya (kVA)\n• Lokasi" },
    { layanan: "Pengujian Tak Merusak (NDT), Non Destructive Testing", cabang: "Lintas DBS (Oil Gas / SNE)", parameter: "• Jenis Metode\n• Jumlah Titik / Luasan" },
    { layanan: "Pemantauan Harga Pokok, Program Pemerintah", cabang: "DBS Government & Institution", parameter: "• Jumlah Lokasi\n• Jumlah Komoditas" },
    { layanan: "Verifikasi IJEPA / IKCEPA (Origin Criteria), Fasilitas Ekonomi / Perdagangan", cabang: "DBS Government & Institution", parameter: "• Lokasi Pabrik\n• Jenis Produk" },
    { layanan: "Verifikasi VPTI (Impor), Impor", cabang: "DBS Government & Institution", parameter: "• Negara Asal\n• Jumlah Partai/Volume" }
  ];

async function run() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    console.log('Inserting bulk services...');
    await db.exec('BEGIN TRANSACTION');

    try {
        // Clear all existing data from these tables so we have a clean slate matching the user request
        // NOTE: if you want to keep the old ones, remove these lines.
        await db.exec('DELETE FROM TransactionParameterValues');
        await db.exec('DELETE FROM TransactionDetail');
        await db.exec('DELETE FROM TransactionHeader');
        await db.exec('DELETE FROM PricingParameters');
        await db.exec('DELETE FROM ServiceActivities');
        await db.exec('DELETE FROM ServiceCatalog');

        for (const item of dataLayanan) {
            // 1. Get or create Portfolio
            let portfolio = await db.get('SELECT PortfolioID FROM MasterPortfolios WHERE PortfolioName = ?', [item.cabang]);
            if (!portfolio) {
                const pRes = await db.run('INSERT INTO MasterPortfolios (PortfolioName) VALUES (?)', [item.cabang]);
                portfolio = { PortfolioID: pRes.lastID };
            }

            // 2. We need a default Category and SubCategory for the Portfolio.
            let cat = await db.get('SELECT CategoryID FROM MasterCategories WHERE PortfolioID = ? AND CategoryName = ?', [portfolio.PortfolioID, 'General Category']);
            if (!cat) {
                 const cRes = await db.run('INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (?, ?)', [portfolio.PortfolioID, 'General Category']);
                 cat = { CategoryID: cRes.lastID };
            }

            let subCat = await db.get('SELECT SubCategoryID FROM MasterSubCategories WHERE CategoryID = ? AND SubCategoryName = ?', [cat.CategoryID, 'General SubCategory']);
            if (!subCat) {
                const sRes = await db.run('INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (?, ?)', [cat.CategoryID, 'General SubCategory']);
                subCat = { SubCategoryID: sRes.lastID };
            }

            // 3. Insert Service
            const svcRes = await db.run('INSERT INTO ServiceCatalog (SubCategoryID, ServiceName, Description) VALUES (?, ?, ?)', 
                [subCat.SubCategoryID, item.layanan, '']
            );
            const serviceId = svcRes.lastID;

            // 4. Insert Parameters
            if (item.parameter) {
                // Remove '• ' and split by newline
                const paramsList = item.parameter.split('\n').map(p => p.replace('• ', '').trim()).filter(p => p.length > 0);
                for (const pName of paramsList) {
                    await db.run('INSERT INTO PricingParameters (ServiceID, ParameterName, UnitPrice) VALUES (?, ?, ?)', 
                        [serviceId, pName, 0]
                    );
                }
            }
        }

        await db.exec('COMMIT');
        console.log('Bulk insert successful! Replaced all services with the new list.');
    } catch (err) {
        await db.exec('ROLLBACK');
        console.error('Error inserting data:', err);
    }
}

run();
