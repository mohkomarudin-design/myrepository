require('dotenv').config();
const mariadb = require('mariadb');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_PATH = path.join(__dirname, 'database.txt');
const dbName = process.env.DB_NAME || 'sione';

// --- Connection Pool (created after DB is ensured to exist) ---
let pool = null;

function getPool() {
    if (!pool) {
        pool = mariadb.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: dbName,
            connectionLimit: 10,
            dateStrings: true,
            bigIntAsNumber: true,
            insertIdAsNumber: true
        });
    }
    return pool;
}

// --- Simple password hashing (SHA-256 + salt) ---
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
    return salt + ':' + hash;
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    const check = crypto.createHash('sha256').update(salt + password).digest('hex');
    return check === hash;
}

// --- Initialize Database ---
async function initDb() {
    // 1. Create database if not exists (connect without specifying database)
    let tempConn;
    try {
        tempConn = await mariadb.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });
        await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
        console.log(`📦 Database '${dbName}' siap.`);
    } finally {
        if (tempConn) await tempConn.end();
    }

    // 2. Check if tables already exist
    const p = getPool();
    const tables = await p.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`, [dbName]);
    const existingTables = tables.map(t => t.TABLE_NAME);

    // 3. If no tables, run full schema initialization
    if (existingTables.length === 0) {
        console.log('📦 Menginisialisasi tabel dari schema...');
        const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

        // Remove SQL comments
        const cleaned = rawSchema
            .split('\n')
            .map(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('--')) return '';
                const commentIdx = line.indexOf('--');
                if (commentIdx > 0) {
                    const beforeComment = line.substring(0, commentIdx);
                    const quoteCount = (beforeComment.match(/'/g) || []).length;
                    if (quoteCount % 2 === 0) {
                        return beforeComment;
                    }
                }
                return line;
            })
            .join('\n');

        const statements = cleaned
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        let conn;
        try {
            conn = await p.getConnection();
            for (const stmt of statements) {
                try {
                    await conn.query(stmt);
                } catch (err) {
                    console.warn(`⚠️ Statement error: ${err.message}`);
                    console.warn(`   SQL: ${stmt.substring(0, 100)}...`);
                }
            }
        } finally {
            if (conn) conn.release();
        }

        // Insert default admin password (admin123)
        const defaultHash = hashPassword('admin123');
        try {
            await p.query('INSERT IGNORE INTO admin_settings (id, password_hash) VALUES (1, ?)', [defaultHash]);
        } catch (e) {
            console.warn('⚠️ Admin settings init:', e.message);
        }

        console.log('✅ Database berhasil diinisialisasi!');
    } else {
        console.log('✅ Database sudah ada, melewati inisialisasi schema.');
        
        // Ensure admin_settings has default entry
        try {
            const admin = await p.query('SELECT * FROM admin_settings WHERE id = 1');
            if (admin.length === 0) {
                const defaultHash = hashPassword('admin123');
                await p.query('INSERT INTO admin_settings (id, password_hash) VALUES (1, ?)', [defaultHash]);
                console.log('  ✅ Default admin password diinisialisasi');
            }
        } catch (e) {
            console.warn('  ⚠️ Admin settings check:', e.message);
        }
    }

    return p;
}

module.exports = {
    getPool,
    initDb,
    hashPassword,
    verifyPassword
};
