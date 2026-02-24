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

async function createMessagesTable() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(dbConfig);
        console.log('Running CREATE TABLE if not exists...');

        // Ensure TransactionHeader has RequestID as primary key which it does
        const query = `
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Messages]') AND type in (N'U'))
        BEGIN
            CREATE TABLE Messages (
                MessageID INT IDENTITY(1,1) PRIMARY KEY,
                RequestID INT NOT NULL,
                Sender NVARCHAR(50) NOT NULL, -- 'Client' or 'Admin'
                MessageText NVARCHAR(MAX) NOT NULL,
                Timestamp DATETIME DEFAULT GETDATE(),
                IsRead BIT DEFAULT 0,
                FOREIGN KEY (RequestID) REFERENCES TransactionHeader(RequestID) ON DELETE CASCADE
            );
            PRINT 'Table Messages created successfully.';
        END
        ELSE
        BEGIN
            PRINT 'Table Messages already exists.';
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

createMessagesTable();
