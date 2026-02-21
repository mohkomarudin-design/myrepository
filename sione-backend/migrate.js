// Run migration script via Node.js
const sql = require('mssql');

const dbConfig = {
    user: 'admin_sione',
    password: 'sione123',
    server: '127.0.0.1',
    port: 1433,
    database: 'PTSI_Services_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function runMigration() {
    try {
        const pool = await sql.connect(dbConfig);
        console.log('✅ Connected to DB');

        // 1. Check if Status column exists
        const colCheck = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM sys.columns 
            WHERE object_id = OBJECT_ID('TransactionHeader') AND name = 'Status'
        `);

        if (colCheck.recordset[0].cnt === 0) {
            console.log('Adding columns to TransactionHeader...');
            await pool.request().query(`
                ALTER TABLE TransactionHeader ADD
                    Status NVARCHAR(50) DEFAULT 'New Request',
                    PaymentTerms INT DEFAULT 1,
                    AdditionalNotes NVARCHAR(MAX),
                    Specification NVARCHAR(MAX),
                    WorkMethod NVARCHAR(255),
                    SubTotal DECIMAL(18,2),
                    TaxRate DECIMAL(5,2) DEFAULT 12,
                    TaxAmount DECIMAL(18,2),
                    GrandTotal DECIMAL(18,2),
                    AssignedAdminID INT NULL,
                    LastUpdated DATETIME DEFAULT GETDATE()
            `);
            console.log('✅ TransactionHeader columns added');
        } else {
            console.log('⏭️  TransactionHeader columns already exist, skipping');
        }

        // 2. Create TransactionDetail
        const tableCheck = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM sys.tables WHERE name = 'TransactionDetail'
        `);

        if (tableCheck.recordset[0].cnt === 0) {
            console.log('Creating TransactionDetail table...');
            await pool.request().query(`
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
                )
            `);
            console.log('✅ TransactionDetail table created');
        } else {
            console.log('⏭️  TransactionDetail table already exists, skipping');
        }

        // 3. Verify
        const cols = await pool.request().query(`SELECT COUNT(*) AS cnt FROM sys.columns WHERE object_id = OBJECT_ID('TransactionHeader')`);
        const tbl = await pool.request().query(`SELECT COUNT(*) AS cnt FROM sys.tables WHERE name = 'TransactionDetail'`);
        console.log(`\n📊 TransactionHeader has ${cols.recordset[0].cnt} columns`);
        console.log(`📊 TransactionDetail exists: ${tbl.recordset[0].cnt > 0 ? 'YES' : 'NO'}`);
        console.log('\n🎉 Migration complete!');

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

runMigration();
