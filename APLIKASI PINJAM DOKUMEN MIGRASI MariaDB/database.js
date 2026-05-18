require('dotenv').config();
const mariadb = require('mariadb');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_PATH = path.join(__dirname, 'database.txt');
const dbName = process.env.DB_NAME || process.env.DB_DATABASE || 'sione';

let pool;

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

// --- Database Initialization ---
async function initializeDatabase() {
    // 1. First, connect to MariaDB server without specifying a database to ensure the database exists
    const tempPool = mariadb.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        connectionLimit: 2,
        allowPublicKeyRetrieval: true
    });

    let tempConn;
    try {
        tempConn = await tempPool.getConnection();
        console.log(`Checking/Creating database "${dbName}"...`);
        await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    } catch (err) {
        console.error('❌ Gagal memeriksa/membuat database:', err.message);
        throw err;
    } finally {
        if (tempConn) tempConn.release();
        await tempPool.end();
    }

    // 2. Now, create the actual connection pool with the database specified
    pool = mariadb.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        connectionLimit: 10,
        allowPublicKeyRetrieval: true,
        dateStrings: true
    });

    let conn;
    try {
        conn = await pool.getConnection();
        console.log('✅ Terhubung ke MariaDB!');

        // Read and execute schema
        const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
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

        for (const stmt of statements) {
            if (stmt.toUpperCase().startsWith('PRAGMA')) continue;
            try {
                await conn.query(stmt);
            } catch (err) {
                // Ignore "already exists" errors for CREATE TABLE IF NOT EXISTS
                if (!err.message.includes('already exists') && !err.message.includes('already exist')) {
                    console.warn(`⚠️ Statement error: ${err.message}`);
                    console.warn(`   SQL: ${stmt.substring(0, 80)}...`);
                }
            }
        }

        // Ensure default admin password exists
        try {
            const [admin] = await conn.query('SELECT * FROM admin_settings WHERE id = 1');
            if (!admin) {
                const defaultHash = hashPassword('admin123');
                await conn.query('INSERT INTO admin_settings (id, password_hash) VALUES (1, ?)', [defaultHash]);
                console.log('  ✅ Default admin password diinisialisasi (admin123)');
            }
        } catch (e) {
            console.warn('  ⚠️ Admin settings init:', e.message);
        }

        console.log('✅ Database siap!');
    } catch (err) {
        console.error('❌ Gagal menginisialisasi database:', err.message);
        throw err;
    } finally {
        if (conn) conn.release();
    }
}

// Export pool getter and utilities
module.exports = {
    get pool() { return pool; },
    hashPassword,
    verifyPassword,
    initializeDatabase
};
