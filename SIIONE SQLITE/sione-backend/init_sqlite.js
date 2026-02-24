const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');

async function initDB() {
    // Delete existing if any, to start fresh
    if (fs.existsSync('./database.sqlite')) {
        fs.unlinkSync('./database.sqlite');
    }

    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    console.log('✅ Connected to SQLite database.');

    // Enable foreign keys
    await db.exec('PRAGMA foreign_keys = ON;');

    console.log('Creating tables...');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS MasterPortfolios (
            PortfolioID INTEGER PRIMARY KEY AUTOINCREMENT,
            PortfolioName TEXT
        );

        CREATE TABLE IF NOT EXISTS MasterCategories (
            CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
            PortfolioID INTEGER,
            CategoryName TEXT,
            FOREIGN KEY (PortfolioID) REFERENCES MasterPortfolios(PortfolioID)
        );

        CREATE TABLE IF NOT EXISTS MasterSubCategories (
            SubCategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
            CategoryID INTEGER,
            SubCategoryName TEXT,
            FOREIGN KEY (CategoryID) REFERENCES MasterCategories(CategoryID)
        );

        CREATE TABLE IF NOT EXISTS ServiceCatalog (
            ServiceID INTEGER PRIMARY KEY AUTOINCREMENT,
            SubCategoryID INTEGER,
            ServiceName TEXT,
            Description TEXT,
            FOREIGN KEY (SubCategoryID) REFERENCES MasterSubCategories(SubCategoryID)
        );

        CREATE TABLE IF NOT EXISTS ServiceActivities (
            ActivityID INTEGER PRIMARY KEY AUTOINCREMENT,
            ServiceID INTEGER,
            StepOrder INTEGER,
            ActivityName TEXT,
            FOREIGN KEY (ServiceID) REFERENCES ServiceCatalog(ServiceID)
        );

        CREATE TABLE IF NOT EXISTS PricingParameters (
            ParamID INTEGER PRIMARY KEY AUTOINCREMENT,
            ServiceID INTEGER,
            ParameterName TEXT,
            UnitPrice REAL DEFAULT 0,
            FOREIGN KEY (ServiceID) REFERENCES ServiceCatalog(ServiceID)
        );

        CREATE TABLE IF NOT EXISTS Customers (
            CustomerID INTEGER PRIMARY KEY AUTOINCREMENT,
            CompanyName TEXT,
            PICName TEXT,
            PICPhone TEXT,
            PICEmail TEXT
        );

        CREATE TABLE IF NOT EXISTS Branches (
            BranchID INTEGER PRIMARY KEY AUTOINCREMENT,
            BranchName TEXT,
            Address TEXT,
            Phone TEXT,
            Fax TEXT
        );

        CREATE TABLE IF NOT EXISTS Employees (
            EmployeeID INTEGER PRIMARY KEY AUTOINCREMENT,
            NIK TEXT UNIQUE NOT NULL,
            FullName TEXT NOT NULL,
            JobTitle TEXT,
            Email TEXT,
            HireDate TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS EmployeeBranchAssignments (
            AssignmentID INTEGER PRIMARY KEY AUTOINCREMENT,
            EmployeeID INTEGER NOT NULL,
            BranchID INTEGER NOT NULL,
            AssignedDate TEXT DEFAULT CURRENT_DATE,
            IsActive INTEGER DEFAULT 1,
            FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID),
            FOREIGN KEY (BranchID) REFERENCES Branches(BranchID)
        );

        CREATE TABLE IF NOT EXISTS TransactionHeader (
            RequestID INTEGER PRIMARY KEY AUTOINCREMENT,
            TicketNumber TEXT,
            CustomerID INTEGER,
            ServiceID INTEGER,
            ProjectLocation TEXT,
            ProjectValue REAL,
            DurationMonths INTEGER,
            RequestDate DATETIME DEFAULT CURRENT_TIMESTAMP,
            GuestName TEXT,
            GuestPhone TEXT,
            Status TEXT DEFAULT 'New Request',
            PaymentTerms INTEGER DEFAULT 1,
            AdditionalNotes TEXT,
            Specification TEXT,
            WorkMethod TEXT,
            SubTotal REAL,
            AdjustmentAmount REAL,
            DiscountAmount REAL,
            TaxRate REAL DEFAULT 12,
            TaxAmount REAL,
            GrandTotal REAL,
            AssignedAdminID INTEGER NULL,
            LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID),
            FOREIGN KEY (ServiceID) REFERENCES ServiceCatalog(ServiceID)
        );

        CREATE TABLE IF NOT EXISTS TransactionDetail (
            DetailID INTEGER PRIMARY KEY AUTOINCREMENT,
            RequestID INTEGER NOT NULL,
            ServiceType TEXT,
            Location TEXT,
            Specification TEXT,
            WorkMethod TEXT,
            CustomDescription TEXT,
            EstimatedPrice REAL DEFAULT 0,
            FinalPrice REAL DEFAULT 0,
            FOREIGN KEY (RequestID) REFERENCES TransactionHeader(RequestID) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS AppUsers (
            UserID INTEGER PRIMARY KEY AUTOINCREMENT,
            Username TEXT NOT NULL UNIQUE,
            PasswordHash TEXT,
            FullName TEXT,
            Role TEXT,
            PortfolioID INTEGER NULL,
            CustomerID INTEGER NULL,
            Email TEXT NULL,
            PhoneWA TEXT NULL,
            FOREIGN KEY (PortfolioID) REFERENCES MasterPortfolios(PortfolioID),
            FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
        );

        CREATE TABLE IF NOT EXISTS Notifications (
            NotificationID INTEGER PRIMARY KEY AUTOINCREMENT,
            Title TEXT NOT NULL,
            Message TEXT NOT NULL,
            Type TEXT NOT NULL,
            RelatedID INTEGER NULL,
            Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            IsRead INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS Messages (
            MessageID INTEGER PRIMARY KEY AUTOINCREMENT,
            RequestID INTEGER NOT NULL,
            Sender TEXT NOT NULL,
            MessageText TEXT NOT NULL,
            AttachmentData TEXT,
            Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            IsRead INTEGER DEFAULT 0,
            FOREIGN KEY (RequestID) REFERENCES TransactionHeader(RequestID) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS NegotiationHistory (
            NegotiationID INTEGER PRIMARY KEY AUTOINCREMENT,
            RequestID INTEGER NOT NULL,
            Round INTEGER NOT NULL,
            ProposedBy TEXT NOT NULL,
            ProposedTotal REAL,
            Notes TEXT,
            CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (RequestID) REFERENCES TransactionHeader(RequestID) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS TransactionParameterValues (
            ValueID INTEGER PRIMARY KEY AUTOINCREMENT,
            DetailID INTEGER NOT NULL,
            ParamID INTEGER NOT NULL,
            Value TEXT,
            InputValue TEXT,
            CalculatedPrice REAL,
            FOREIGN KEY (DetailID) REFERENCES TransactionDetail(DetailID) ON DELETE CASCADE,
            FOREIGN KEY (ParamID) REFERENCES PricingParameters(ParamID) ON DELETE CASCADE
        );

        -- Portfolios
        INSERT INTO MasterPortfolios (PortfolioName) VALUES 
        ('DBS Oil Gas & Renewable Energy'), ('DBS Sustainability & Environment'), 
        ('DBS Coal & Mineral'), ('DBS Infrastructur & Transportasi'), 
        ('DBS Industrial Services'), ('DBS Government & Institution');

        -- Users
        INSERT INTO AppUsers (Username, PasswordHash, FullName, Role) VALUES ('super_admin', 'ptsipusat', 'Super Admin Pusat', 'SuperAdmin');
        INSERT INTO AppUsers (Username, PasswordHash, FullName, Role, PortfolioID) VALUES 
        ('admin_migas', 'migas123', 'Admin Divisi Migas', 'AdminDBS', 1),
        ('admin_coal', 'coal123', 'Admin Divisi Coal', 'AdminDBS', 3),
        ('admin_infra', 'infra123', 'Admin Divisi Infra', 'AdminDBS', 4);

        -- Branches
        INSERT INTO Branches (BranchName, Address, Phone, Fax) VALUES 
        ('JAKARTA', 'Jl. Lenteng Agung Raya No.21 & 24 RT.6/RW.1 Lenteng Agung, Jagakarsa Jakarta Selatan - 12530', '(021) 3973 6050', '(021) 3973 6005'),
        ('SEMARANG', 'Jl. Peterongan Timur No.11B Kec. Semarang Selatan Semarang - 50242', '(024) 845 0918', '(024) 845 1093'),
        ('SURABAYA', 'Jl. Margorejo Indah No. 51 Surabaya - 60238 Jawa Timur', '(031) 9985 8797', '(031) 9985 9114'),
        ('MAKASSAR', 'Jl. Kumala No.128 Jongaya, Kec. Tamalate Makassar, Sulsel - 90223', '(0411) 805 7781', NULL),
        ('BALIKPAPAN', 'Jl. Ars. Muhammad No.4 Klandasan Ulu Balikpapan, Kaltim', '(0542) 882 0050', '(0542) 882 0051'),
        ('PALEMBANG', 'Jl. Soekarno Hatta No.3040A Alang-alang Lebar, Palembang', '(0711) 5614 188', '(0711) 5715 138'),
        ('PEKANBARU', 'Jl. Bukit Raya Indah No.1 Simpang Tiga, Pekanbaru Riau - 28284', '(0761) 848 878', '(0761) 848 213'),
        ('BATAM', 'Jl. Kerapu No. 02 Batu Ampar Pulau Batam - 29432', '(0778) 411 411', '(0778) 411 787'),
        ('MEDAN', 'Jl. Sunggal No. 197 Tanjung Rejo, Medan - 20122 Sumatera Utara', '(061) 4256 9565', '(061) 4256 9564'),
        ('SINGAPORE', '7500A Beach Rd #11-301 The Plaza Singapore 199591', '+65 6883 0634', '+65 6339 3631'),
        ('ACEH', 'Jl. Jend. Sudirman No. 26 Banda Aceh NAD - 23239', '(0651) 414 94', '(0651) 414 94'),
        ('LAMPUNG', 'Perumahan Natar Ida Jl. Anambas Blok B9 Merak Batin, Natar, Lampung Selatan', '0811 936 634', NULL),
        ('CILEGON', 'Komplek Perumahan Pondok Cilegon Indah Blok A 7 No. 8 Cibeber Cilegon, Banten - 42422', '(0254) 386 215', '(0254) 386 215'),
        ('CILACAP', 'Jl. Perintis Kemerdekaan No.54, RT 05 RW 01, Rejanegara, Cilacap, Jawa Tengah - 53231', '0898 6292 756', NULL),
        ('BANJARBARU', 'Jl. A. Yani Km 30.5 No.22A Landasan Ulin, Banjarbaru Kalimantan Selatan 70721', '(0511) 4777 333', '(0511) 4780 316'),
        ('BALI', 'Jln. Cok Agung Tresna No.15 Dangin Puri Klod, Kec. Denpasar Denpasar, Bali - 80232', '(0361) 4784 888', NULL),
        ('MOROWALI', 'Desa Bahomoleo, Kec. Bungku Tengah Kab. Morowali, Sulawesi Tengah - 94973', '0852-4198-6865', NULL),
        ('KENDARI', 'Ruko Pergudangan Kendari Indah Blok A3-R3, Punggolaka, Kota Kendari Sulawesi Tenggara - 93115', '0821 1176 560', NULL),
        ('TERNATE', 'Jl. Lingkar Sabia, Taman Facei, Kota Ternate, Maluku Utara 97751', '0857 2877 7375', NULL),
        ('SORONG', 'Jl Sultan Hasanuddin Kel. Klaligi, Kec. Sorong Manoi, Kota Sorong, Papua Barat Daya', '0811 8450 712', NULL);

        -- Employees
        INSERT INTO Employees (NIK, FullName, JobTitle, Email, HireDate) VALUES 
        ('SI-001', 'Budi Santoso', 'Manager', 'budi@ptsi.co.id', '2020-01-01'),
        ('SI-002', 'Ani Wijaya', 'Surveyor', 'ani@ptsi.co.id', '2021-02-15');

        -- Employee Branch Assignments
        INSERT INTO EmployeeBranchAssignments (EmployeeID, BranchID, AssignedDate) VALUES 
        (1, 1, '2020-01-01'),
        (2, 3, '2021-02-15');

        -- Create TicketNumber Trigger for TransactionHeader
        CREATE TRIGGER AssignTicketNumber
        AFTER INSERT ON TransactionHeader
        BEGIN
            UPDATE TransactionHeader 
            SET TicketNumber = 'REQ-' || strftime('%Y', 'now') || '-' || NEW.RequestID
            WHERE RequestID = NEW.RequestID;
        END;
    `);

    // [A] DBS OIL GAS
    const svc1Id = await insertService(db, 1, 'Infrastruktur Migas', 'Pesawat Uap & Bejana Tekan', 'Inspeksi & Sertifikasi Peralatan');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc1Id}, 1, 'Review Dokumen'), (${svc1Id}, 2, 'Pemeriksaan Visual'), (${svc1Id}, 3, 'NDT Check'), (${svc1Id}, 4, 'Uji Fungsi');
    `);

    const svc2Id = await insertService(db, 1, 'Survei Kebumian', 'Seismik', 'Survei Seismik 2D/3D');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc2Id}, 1, 'Topografi'), (${svc2Id}, 2, 'Akuisisi Data'), (${svc2Id}, 3, 'Processing Data'), (${svc2Id}, 4, 'Interpretasi');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc2Id}, 'Panjang Lintasan (km)'), (${svc2Id}, 'Medan (Darat/Laut)');
    `);

    const svc3Id = await insertService(db, 1, 'Verifikasi', 'Ekspor Migas', 'Verifikasi Penelusuran Teknis Ekspor (VPTE)');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc3Id}, 1, 'Cek Regulasi'), (${svc3Id}, 2, 'Pre-shipment Survey'), (${svc3Id}, 3, 'Sampling'), (${svc3Id}, 4, 'Loading Supervision');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc3Id}, 'Jumlah Shipment'), (${svc3Id}, 'Volume (MT)');
    `);

    // [B] DBS COAL & MINERAL
    const svc4Id = await insertService(db, 3, 'Marine Survey', 'Batubara', 'Draught Survey');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc4Id}, 1, 'Initial Survey'), (${svc4Id}, 2, 'Final Survey'), (${svc4Id}, 3, 'Calculation Report');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc4Id}, 'Kapasitas Kapal (DWT)');
    `);

    const svc5Id = await insertService(db, 3, 'Coal Handling', 'Stockpile', 'Stockpile Opname');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc5Id}, 1, 'Topografi Cut & Fill'), (${svc5Id}, 2, 'Densitas Material'), (${svc5Id}, 3, 'Volume Calculation');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc5Id}, 'Luas Area (Ha)');
    `);

    // [C] DBS INFRASTRUKTUR
    const svc6Id = await insertService(db, 4, 'Manajemen Aset', 'Aset Fisik', 'Inventarisasi Aset');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc6Id}, 1, 'Sensus Fisik'), (${svc6Id}, 2, 'Tagging Barcode'), (${svc6Id}, 3, 'Penilaian Kondisi');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc6Id}, 'Jumlah Aset');
    `);

    // [D] DBS INDUSTRIAL
    const svc7Id = await insertService(db, 5, 'Verifikasi TKDN', 'Industri', 'Verifikasi TKDN');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc7Id}, 1, 'Self Assessment Review'), (${svc7Id}, 2, 'Factory Visit'), (${svc7Id}, 3, 'Penghitungan Bobot');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc7Id}, 'Nilai Proyek (Rp)');
    `);

    // [E] DBS SUSTAINABILITY
    const svc8Id = await insertService(db, 2, 'Lingkungan', 'Perizinan', 'AMDAL / UKL-UPL');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc8Id}, 1, 'Kerangka Acuan'), (${svc8Id}, 2, 'Survei Rona Awal'), (${svc8Id}, 3, 'Sidang Komisi');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc8Id}, 'Luas Lahan (Ha)');
    `);

    const svc9Id = await insertService(db, 2, 'Ketenagalistrikan', 'SLO', 'Sertifikat Laik Operasi (SLO)');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc9Id}, 1, 'Cek Dokumen'), (${svc9Id}, 2, 'Cek Instalasi'), (${svc9Id}, 3, 'Uji Mata Sistem');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc9Id}, 'Kapasitas Daya (kVA)');
    `);

    // [F] LINTAS DIVISI / LAINNYA
    const svc10Id = await insertService(db, 1, 'NDT Services', 'Non Destructive Test', 'Pengujian Tak Merusak (NDT)');
    await db.exec(`
        INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES 
        (${svc10Id}, 1, 'RT: Gamma Ray'), (${svc10Id}, 2, 'UT: Ultrasonic'), (${svc10Id}, 3, 'MT: Magnetic Particle');
        INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (${svc10Id}, 'Jumlah Titik / Luasan');
    `);

    console.log('✅ SQLite Tables & Seed Data initialized!');
    await db.close();
}

async function insertService(db, portId, catName, subCatName, svcName) {
    let cat = await db.get(`SELECT CategoryID FROM MasterCategories WHERE CategoryName = ?`, [catName]);
    if (!cat) {
        const r = await db.run(`INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (?, ?)`, [portId, catName]);
        cat = { CategoryID: r.lastID };
    }

    let subCat = await db.get(`SELECT SubCategoryID FROM MasterSubCategories WHERE SubCategoryName = ? AND CategoryID = ?`, [subCatName, cat.CategoryID]);
    if (!subCat) {
        const r = await db.run(`INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (?, ?)`, [cat.CategoryID, subCatName]);
        subCat = { SubCategoryID: r.lastID };
    }

    const r = await db.run(`INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (?, ?)`, [subCat.SubCategoryID, svcName]);
    return r.lastID;
}

initDB().catch(console.error);
