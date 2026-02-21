const sql = require('mssql');
const dbConfig = {
    user: 'admin_sione',
    password: 'sione123',
    server: 'localhost',
    port: 1433,
    database: 'PTSI_Services_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 10000
    }
};

async function createNotificationsTable() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(dbConfig);
        console.log('Running CREATE TABLE if not exists...');

        const query = `
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Notifications]') AND type in (N'U'))
        BEGIN
            CREATE TABLE Notifications (
                NotificationID INT IDENTITY(1,1) PRIMARY KEY,
                Title NVARCHAR(255) NOT NULL,
                Message NVARCHAR(MAX) NOT NULL,
                Type NVARCHAR(50) NOT NULL, -- 'New Request', 'Negotiation', 'Status Update', 'Message'
                RelatedID INT NULL, -- RequestID
                Timestamp DATETIME DEFAULT GETDATE(),
                IsRead BIT DEFAULT 0
            );
            PRINT 'Table Notifications created successfully.';
        END
        ELSE
        BEGIN
            PRINT 'Table Notifications already exists.';
        END
        `;

        const result = await pool.request().query(query);
        console.log('Migration complete:', result.recordset || 'No output rows.');
        await sql.close();
    } catch (err) {
        console.error('Migration failed:', err);
        await sql.close();
    }
}

createNotificationsTable();
