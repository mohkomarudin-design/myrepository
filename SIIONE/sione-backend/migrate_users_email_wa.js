require('dotenv').config();
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function migrateEmailWA() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);

        console.log('Altering AppUsers table...');
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE Name = N'Email' 
                AND Object_ID = Object_ID(N'AppUsers')
            )
            BEGIN
                ALTER TABLE AppUsers ADD Email NVARCHAR(100) NULL;
            END

            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE Name = N'PhoneWA' 
                AND Object_ID = Object_ID(N'AppUsers')
            )
            BEGIN
                ALTER TABLE AppUsers ADD PhoneWA NVARCHAR(50) NULL;
            END
        `);
        console.log('Successfully added Email and PhoneWA columns to AppUsers.');

        sql.close();
        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
        sql.close();
    }
}

migrateEmailWA();
