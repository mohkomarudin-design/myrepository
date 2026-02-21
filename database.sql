/* ==================================================================================
   MASTER SCRIPT SI-ONE: INTEGRATED FINAL FIX (DEBUGGED)
   Perbaikan: 
   - Menggunakan Variabel @SvcID agar Foreign Key tidak bentrok.
   - Menggabungkan Master Data Cabang (20 Cabang), Karyawan, dan Assignments.
   ================================================================================== */

USE master;
GO

-- ==================================================================================
-- 1. RESET DATABASE
-- ==================================================================================
IF EXISTS (SELECT name FROM sys.databases WHERE name = N'PTSI_Services_DB')
BEGIN
    ALTER DATABASE [PTSI_Services_DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [PTSI_Services_DB];
END
GO

CREATE DATABASE PTSI_Services_DB;
GO

USE PTSI_Services_DB;
GO

-- ==================================================================================
-- 2. MEMBUAT STRUKTUR TABEL
-- ==================================================================================
CREATE TABLE MasterPortfolios (PortfolioID INT PRIMARY KEY IDENTITY(1,1), PortfolioName NVARCHAR(100));
CREATE TABLE MasterCategories (CategoryID INT PRIMARY KEY IDENTITY(1,1), PortfolioID INT, CategoryName NVARCHAR(255), FOREIGN KEY (PortfolioID) REFERENCES MasterPortfolios(PortfolioID));
CREATE TABLE MasterSubCategories (SubCategoryID INT PRIMARY KEY IDENTITY(1,1), CategoryID INT, SubCategoryName NVARCHAR(MAX), FOREIGN KEY (CategoryID) REFERENCES MasterCategories(CategoryID));
CREATE TABLE ServiceCatalog (ServiceID INT PRIMARY KEY IDENTITY(1,1), SubCategoryID INT, ServiceName NVARCHAR(MAX), Description NVARCHAR(MAX), FOREIGN KEY (SubCategoryID) REFERENCES MasterSubCategories(SubCategoryID));
CREATE TABLE ServiceActivities (ActivityID INT PRIMARY KEY IDENTITY(1,1), ServiceID INT, StepOrder INT, ActivityName NVARCHAR(MAX), FOREIGN KEY (ServiceID) REFERENCES ServiceCatalog(ServiceID));
CREATE TABLE PricingParameters (ParamID INT PRIMARY KEY IDENTITY(1,1), ServiceID INT, ParameterName NVARCHAR(MAX), FOREIGN KEY (ServiceID) REFERENCES ServiceCatalog(ServiceID));
CREATE TABLE Customers (CustomerID INT PRIMARY KEY IDENTITY(1,1), CompanyName NVARCHAR(200), PICName NVARCHAR(100), PICPhone NVARCHAR(50), PICEmail NVARCHAR(100));

-- Tabel Master Cabang
CREATE TABLE Branches (BranchID INT PRIMARY KEY IDENTITY(1,1), BranchName NVARCHAR(200), Address NVARCHAR(500), Phone NVARCHAR(100), Fax NVARCHAR(100));

-- Tabel Master Karyawan
CREATE TABLE Employees (EmployeeID INT IDENTITY(1,1) PRIMARY KEY, NIK VARCHAR(20) UNIQUE NOT NULL, FullName NVARCHAR(100) NOT NULL, JobTitle NVARCHAR(50), Email NVARCHAR(100), HireDate DATE NOT NULL);

-- Tabel Relasi Penugasan Karyawan - Cabang (Branch-Assignment)
CREATE TABLE EmployeeBranchAssignments (AssignmentID INT IDENTITY(1,1) PRIMARY KEY, EmployeeID INT NOT NULL, BranchID INT NOT NULL, AssignedDate DATE DEFAULT GETDATE(), IsActive BIT DEFAULT 1, CONSTRAINT FK_Assignment_Employee FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID), CONSTRAINT FK_Assignment_Branch FOREIGN KEY (BranchID) REFERENCES Branches(BranchID));

CREATE TABLE TransactionHeader (RequestID INT PRIMARY KEY IDENTITY(1,1), TicketNumber AS ('REQ-' + CAST(YEAR(GETDATE()) AS VARCHAR) + '-' + CAST(RequestID AS VARCHAR)), CustomerID INT NULL, ServiceID INT, ProjectLocation NVARCHAR(255), ProjectValue DECIMAL(18, 2), DurationMonths INT, RequestDate DATETIME DEFAULT GETDATE(), GuestName NVARCHAR(100), GuestPhone NVARCHAR(50), Status NVARCHAR(50) DEFAULT 'New Request', PaymentTerms INT DEFAULT 1, AdditionalNotes NVARCHAR(MAX), Specification NVARCHAR(MAX), WorkMethod NVARCHAR(MAX), FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID), FOREIGN KEY (ServiceID) REFERENCES ServiceCatalog(ServiceID));
CREATE TABLE TransactionDetail (DetailID INT PRIMARY KEY IDENTITY(1,1), RequestID INT, ServiceType NVARCHAR(200), Location NVARCHAR(255), Specification NVARCHAR(MAX), WorkMethod NVARCHAR(MAX), CustomDescription NVARCHAR(MAX), EstimatedPrice DECIMAL(18,2) DEFAULT 0, FOREIGN KEY (RequestID) REFERENCES TransactionHeader(RequestID));
CREATE TABLE AppUsers (UserID INT PRIMARY KEY IDENTITY(1,1), Username NVARCHAR(50) NOT NULL UNIQUE, PasswordHash NVARCHAR(255), FullName NVARCHAR(100), Role NVARCHAR(20), PortfolioID INT NULL, CustomerID INT NULL, FOREIGN KEY (PortfolioID) REFERENCES MasterPortfolios(PortfolioID), FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID));
GO

-- ==================================================================================
-- 3. INSERT 6 PORTOFOLIO UTAMA
-- ==================================================================================
INSERT INTO MasterPortfolios (PortfolioName) VALUES 
('DBS Oil Gas & Renewable Energy'), ('DBS Sustainability & Environment'), 
('DBS Coal & Mineral'), ('DBS Infrastructur & Transportasi'), 
('DBS Industrial Services'), ('DBS Government & Institution');
GO

-- ==================================================================================
-- 4. INSERT DATA LAYANAN (MENGGUNAKAN VARIABEL ID)
-- ==================================================================================
BEGIN TRANSACTION;

DECLARE @SvcID INT; 

-- [A] DBS OIL GAS
INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (1, 'Infrastruktur Migas');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Pesawat Uap & Bejana Tekan');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Inspeksi & Sertifikasi Peralatan');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Review Dokumen'), (@SvcID, 2, 'Pemeriksaan Visual'), (@SvcID, 3, 'NDT Check'), (@SvcID, 4, 'Uji Fungsi');

INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (1, 'Survei Kebumian');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Seismik');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Survei Seismik 2D/3D');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Topografi'), (@SvcID, 2, 'Akuisisi Data'), (@SvcID, 3, 'Processing Data'), (@SvcID, 4, 'Interpretasi');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Panjang Lintasan (km)'), (@SvcID, 'Medan (Darat/Laut)');

INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (1, 'Verifikasi');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Ekspor Migas');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Verifikasi Penelusuran Teknis Ekspor (VPTE)');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Cek Regulasi'), (@SvcID, 2, 'Pre-shipment Survey'), (@SvcID, 3, 'Sampling'), (@SvcID, 4, 'Loading Supervision');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Jumlah Shipment'), (@SvcID, 'Volume (MT)');

-- [B] DBS COAL & MINERAL
INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (3, 'Marine Survey');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Batubara');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Draught Survey');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Initial Survey'), (@SvcID, 2, 'Final Survey'), (@SvcID, 3, 'Calculation Report');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Kapasitas Kapal (DWT)');

INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (3, 'Coal Handling');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Stockpile');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Stockpile Opname');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Topografi Cut & Fill'), (@SvcID, 2, 'Densitas Material'), (@SvcID, 3, 'Volume Calculation');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Luas Area (Ha)');

-- [C] DBS INFRASTRUKTUR
INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (4, 'Manajemen Aset');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Aset Fisik');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Inventarisasi Aset');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Sensus Fisik'), (@SvcID, 2, 'Tagging Barcode'), (@SvcID, 3, 'Penilaian Kondisi');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Jumlah Aset');

-- [D] DBS INDUSTRIAL
INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (5, 'Verifikasi TKDN');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Industri');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Verifikasi TKDN');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Self Assessment Review'), (@SvcID, 2, 'Factory Visit'), (@SvcID, 3, 'Penghitungan Bobot');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Nilai Proyek (Rp)');

-- [E] DBS SUSTAINABILITY
INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (2, 'Lingkungan');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Perizinan');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'AMDAL / UKL-UPL');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Kerangka Acuan'), (@SvcID, 2, 'Survei Rona Awal'), (@SvcID, 3, 'Sidang Komisi');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Luas Lahan (Ha)');

INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (2, 'Ketenagalistrikan');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'SLO');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Sertifikat Laik Operasi (SLO)');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'Cek Dokumen'), (@SvcID, 2, 'Cek Instalasi'), (@SvcID, 3, 'Uji Mata Sistem');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Kapasitas Daya (kVA)');

-- [F] LINTAS DIVISI / LAINNYA
INSERT INTO MasterCategories (PortfolioID, CategoryName) VALUES (1, 'NDT Services');
INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (SCOPE_IDENTITY(), 'Non Destructive Test');
INSERT INTO ServiceCatalog (SubCategoryID, ServiceName) VALUES (SCOPE_IDENTITY(), 'Pengujian Tak Merusak (NDT)');
SET @SvcID = SCOPE_IDENTITY(); 
INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@SvcID, 1, 'RT: Gamma Ray'), (@SvcID, 2, 'UT: Ultrasonic'), (@SvcID, 3, 'MT: Magnetic Particle');
INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@SvcID, 'Jumlah Titik / Luasan');

COMMIT;
GO

-- ==================================================================================
-- 5. INSERT DATA USERS & APP
-- ==================================================================================
INSERT INTO AppUsers (Username, PasswordHash, FullName, Role) VALUES ('super_admin', 'ptsipusat', 'Super Admin Pusat', 'SuperAdmin');
INSERT INTO AppUsers (Username, PasswordHash, FullName, Role, PortfolioID) VALUES 
('admin_migas', 'migas123', 'Admin Divisi Migas', 'AdminDBS', 1),
('admin_coal', 'coal123', 'Admin Divisi Coal', 'AdminDBS', 3),
('admin_infra', 'infra123', 'Admin Divisi Infra', 'AdminDBS', 4);
GO

-- ==================================================================================
-- 6. INSERT DATA 20 CABANG PT SURVEYOR INDONESIA
-- ==================================================================================
INSERT INTO Branches (BranchName, Address, Phone, Fax)
VALUES 
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
GO

-- ==================================================================================
-- 7. INSERT DATA KARYAWAN & PENUGASAN (BRANCH ASSIGNMENTS)
-- ==================================================================================
INSERT INTO Employees (NIK, FullName, JobTitle, Email, HireDate)
VALUES 
('SI-001', 'Budi Santoso', 'Manager', 'budi@ptsi.co.id', '2020-01-01'),
('SI-002', 'Ani Wijaya', 'Surveyor', 'ani@ptsi.co.id', '2021-02-15');

-- Penugasan: Budi ke Jakarta (ID 1), Ani ke Surabaya (ID 3)
INSERT INTO EmployeeBranchAssignments (EmployeeID, BranchID, AssignedDate)
VALUES 
(1, 1, '2020-01-01'),
(2, 3, '2021-02-15');
GO

-- ==================================================================================
-- 8. QUERY VERIFIKASI AKHIR UNTUK MEMASTIKAN DATA MASUK
-- ==================================================================================

-- Cek Data Layanan dan Parameter
SELECT * FROM ServiceActivities;
SELECT * FROM PricingParameters;

-- Cek Data Karyawan beserta Cabang Penugasannya
SELECT 
    e.NIK,
    e.FullName AS [Nama Karyawan],
    e.JobTitle AS [Jabatan],
    b.BranchName AS [Nama Cabang],
    b.Address AS [Alamat Cabang]
FROM Employees e
JOIN EmployeeBranchAssignments eba ON e.EmployeeID = eba.EmployeeID
JOIN Branches b ON eba.BranchID = b.BranchID
WHERE eba.IsActive = 1;
GO