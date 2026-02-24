/* ==================================================================================
   MIGRATION SCRIPT: Add CRUD support for Permintaan Surat Penawaran (Safe Mode)
   ================================================================================== */

USE PTSI_Services_DB;
GO

-- 1. ADD COLUMNS TO TransactionHeader (Check each individually)

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'Status')
    ALTER TABLE TransactionHeader ADD Status NVARCHAR(50) DEFAULT 'New Request';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'PaymentTerms')
    ALTER TABLE TransactionHeader ADD PaymentTerms INT DEFAULT 1;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'AdditionalNotes')
    ALTER TABLE TransactionHeader ADD AdditionalNotes NVARCHAR(MAX);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'Specification')
    ALTER TABLE TransactionHeader ADD Specification NVARCHAR(MAX);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'WorkMethod')
    ALTER TABLE TransactionHeader ADD WorkMethod NVARCHAR(255);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'SubTotal')
    ALTER TABLE TransactionHeader ADD SubTotal DECIMAL(18,2);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'AdjustmentAmount')
    ALTER TABLE TransactionHeader ADD AdjustmentAmount DECIMAL(18,2) DEFAULT 0;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'TaxRate')
    ALTER TABLE TransactionHeader ADD TaxRate DECIMAL(5,2) DEFAULT 12;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'TaxAmount')
    ALTER TABLE TransactionHeader ADD TaxAmount DECIMAL(18,2);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'GrandTotal')
    ALTER TABLE TransactionHeader ADD GrandTotal DECIMAL(18,2);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'AssignedAdminID')
    ALTER TABLE TransactionHeader ADD AssignedAdminID INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'LastUpdated')
    ALTER TABLE TransactionHeader ADD LastUpdated DATETIME DEFAULT GETDATE();
GO

-- 2. CREATE TransactionDetail TABLE
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TransactionDetail')
BEGIN
    CREATE TABLE TransactionDetail (
        DetailID INT PRIMARY KEY IDENTITY(1,1),
        RequestID INT NOT NULL,
        ServiceType NVARCHAR(255),
        Location NVARCHAR(255),
        Specification NVARCHAR(MAX),
        WorkMethod NVARCHAR(255),
        CustomDescription NVARCHAR(MAX),
        EstimatedPrice DECIMAL(18,2) DEFAULT 0,
        FinalPrice DECIMAL(18,2) DEFAULT 0,
        FOREIGN KEY (RequestID) REFERENCES TransactionHeader(RequestID) ON DELETE CASCADE
    );
END
GO

-- 3. VERIFY
SELECT 'TransactionHeader columns' AS Info, COUNT(*) AS Cnt FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader');
SELECT 'TransactionDetail exists' AS Info, COUNT(*) AS Cnt FROM sys.tables WHERE name = 'TransactionDetail';
GO
