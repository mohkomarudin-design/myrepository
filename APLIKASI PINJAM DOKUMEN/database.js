const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'sione.db');
const SCHEMA_PATH = path.join(__dirname, 'database.txt');

let needInit = !fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

if (needInit) {
    console.log('📦 Menginisialisasi database baru dari schema...');
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
            db.exec(stmt + ';');
        } catch (err) {
            console.warn(`⚠️ Statement error: ${err.message}`);
            console.warn(`   SQL: ${stmt.substring(0, 80)}...`);
        }
    }

    // Insert default admin password (admin123)
    const defaultHash = hashPassword('admin123');
    try {
        db.prepare('INSERT OR IGNORE INTO admin_settings (id, password_hash) VALUES (1, ?)').run(defaultHash);
    } catch (e) {
        console.warn('⚠️ Admin settings init:', e.message);
    }

    console.log('✅ Database berhasil diinisialisasi!');
} else {
    // --- MIGRATION: Add new columns if they don't exist ---
    console.log('🔄 Memeriksa migrasi database...');

    const migrate = (table, column, definition) => {
        try {
            const cols = db.prepare(`PRAGMA table_info(${table})`).all();
            if (!cols.find(c => c.name === column)) {
                db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                console.log(`  ✅ Kolom ${column} ditambahkan ke ${table}`);
            }
        } catch (e) {
            console.warn(`  ⚠️ Migrasi ${table}.${column}: ${e.message}`);
        }
    };

    // trx_peminjaman migrations
    migrate('trx_peminjaman', 'email_peminjam', 'TEXT');
    migrate('trx_peminjaman', 'status_approval', "TEXT NOT NULL DEFAULT 'Disetujui'");
    migrate('trx_peminjaman', 'catatan_tolak', 'TEXT');

    // log_pengembalian migrations
    migrate('log_pengembalian', 'status_approval', "TEXT NOT NULL DEFAULT 'Disetujui'");
    migrate('log_pengembalian', 'catatan_tolak', 'TEXT');

    // trx_penyerahan migrations
    migrate('trx_penyerahan', 'status_approval', "TEXT NOT NULL DEFAULT 'Disetujui'");
    migrate('trx_penyerahan', 'catatan_tolak', 'TEXT');

    // Create admin_settings table if not exists
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS admin_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            password_hash TEXT NOT NULL,
            reset_token TEXT,
            reset_token_expiry TEXT
        )`);
        const admin = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
        if (!admin) {
            const defaultHash = hashPassword('admin123');
            db.prepare('INSERT INTO admin_settings (id, password_hash) VALUES (1, ?)').run(defaultHash);
            console.log('  ✅ Default admin password diinisialisasi');
        }
    } catch (e) {
        console.warn('  ⚠️ Admin settings migration:', e.message);
    }

    // Create detail_penyerahan table if not exists
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS detail_penyerahan (
            id_detail INTEGER PRIMARY KEY AUTOINCREMENT,
            id_penyerahan TEXT NOT NULL,
            no_dokumen TEXT NOT NULL,
            nama_dokumen TEXT NOT NULL,
            tahun INTEGER NOT NULL,
            jenis_dokumen TEXT NOT NULL,
            file_path TEXT,
            FOREIGN KEY (id_penyerahan) REFERENCES trx_penyerahan(id_penyerahan) ON DELETE CASCADE
        )`);
    } catch (e) {
        console.warn('  ⚠️ detail_penyerahan migration:', e.message);
    }

    console.log('✅ Migrasi selesai!');
}

db.hashPassword = hashPassword;
db.verifyPassword = verifyPassword;

module.exports = db;
