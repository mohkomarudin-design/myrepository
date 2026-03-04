const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'safety_patrol.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// =========================================================================
// CREATE TABLES
// =========================================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS form_settings (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key   TEXT NOT NULL UNIQUE,
        setting_value TEXT NOT NULL
    );
`);

// =========================================================================
// SEED DEFAULT VALUES
// =========================================================================

const seedSettings = db.transaction(() => {
    const insert = db.prepare(`
        INSERT OR IGNORE INTO form_settings (setting_key, setting_value)
        VALUES (?, ?)
    `);

    insert.run('revision_number', 'Rev.02');
    insert.run('revision_date', '4 Agustus 2022');
});

seedSettings();

console.log('✅ Database siap — tabel form_settings berhasil diinisialisasi.');

module.exports = db;
