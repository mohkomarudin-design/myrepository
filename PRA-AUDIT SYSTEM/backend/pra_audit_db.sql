CREATE DATABASE IF NOT EXISTS pra_audit_db;
USE pra_audit_db;

CREATE TABLE IF NOT EXISTS locations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  pic VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_programs (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS documents_master (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('auditor', 'auditee') NOT NULL,
  location_id INT,
  name VARCHAR(255) NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_records (
  id VARCHAR(100) PRIMARY KEY,
  audit_id VARCHAR(50),
  location_id INT,
  document_id VARCHAR(50),
  year INT NOT NULL,
  status ENUM('clear', 'yellow', 'red') DEFAULT 'red',
  notes TEXT,
  updated_at DATETIME NULL,
  FOREIGN KEY (audit_id) REFERENCES audit_programs(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents_master(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(100) PRIMARY KEY,
  record_id VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  isRevised BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (record_id) REFERENCES audit_records(id) ON DELETE CASCADE
);

-- Insert Mock Data
INSERT INTO locations (id, name, pic) VALUES 
(1, 'TJ Priok', 'Panji'),
(2, 'TJ Uban', 'Bima'),
(3, 'Palembang', 'Bima'),
(4, 'Cilacap', 'Panji'),
(5, 'Dumai', 'Bima'),
(6, 'Bali', 'Panji'),
(7, 'VP TE', 'Panji')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO audit_programs (id, name) VALUES 
('A1', 'Audit ISO 17020 QnQ'),
('A2', 'Audit BPK'),
('A3', 'Audit Internal (K3)')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO documents_master (id, name) VALUES 
('D01', 'CV Personil'),
('D02', 'FP-DSDM01-02 Uraian Jabatan'),
('D03', 'FP-DSDM31-03 Jadwal Pemantauan Kinerja'),
('D04', 'FP-DSDM31-04 Form Penilaian Kinerja'),
('D05', 'FP-MR38-02 Pernyataan Kesediaan Personil'),
('D06', 'FP-MR40-01 Daftar Peralatan'),
('D07', 'FP-MR40-02 Daftar Pemantauan Peralatan'),
('D08', 'FP-MR40-03 Program Kalibrasi Peralatan'),
('D09', 'FP-MR40-04 Laporan Kerusakan Alat'),
('D10', 'FP-MR40-05 Log Book Penggunaan Alat'),
('D11', 'Sertifikat Kalibrasi')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO users (username, password, role, location_id, name) VALUES 
('admin', '123', 'auditor', NULL, 'Super Auditor'),
('priok', '123', 'auditee', 1, 'Admin TJ Priok'),
('uban', '123', 'auditee', 2, 'Admin TJ Uban'),
('palembang', '123', 'auditee', 3, 'Admin Palembang')
ON DUPLICATE KEY UPDATE name=VALUES(name);
