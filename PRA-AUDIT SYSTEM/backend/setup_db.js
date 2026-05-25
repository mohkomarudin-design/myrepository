const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setup() {
  try {
    // Connect without database
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('Connected to MariaDB...');
    
    const sqlScript = fs.readFileSync(path.join(__dirname, 'pra_audit_db.sql'), 'utf8');
    
    console.log('Running SQL Script...');
    await conn.query(sqlScript);
    
    console.log('Database pra_audit_db setup completed successfully!');
    await conn.end();
  } catch (err) {
    console.error('Failed to setup database:', err);
  }
}

setup();
