const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'sione.db');
const SCHEMA_PATH = path.join(__dirname, 'database.txt');

let needInit = !fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

if (needInit) {
    console.log('📦 Menginisialisasi database baru dari schema...');
    const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    // Remove all SQL comments (single-line -- comments)
    const cleaned = rawSchema
        .split('\n')
        .map(line => {
            // Remove inline comments but preserve strings
            // Simple approach: remove lines that are only comments, and strip trailing comments
            const trimmed = line.trim();
            if (trimmed.startsWith('--')) return '';
            // Remove trailing comments (not inside strings)
            const commentIdx = line.indexOf('--');
            if (commentIdx > 0) {
                // Check if -- is inside single quotes
                const beforeComment = line.substring(0, commentIdx);
                const quoteCount = (beforeComment.match(/'/g) || []).length;
                if (quoteCount % 2 === 0) {
                    return beforeComment;
                }
            }
            return line;
        })
        .join('\n');

    // Split by semicolon and execute each statement
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

    console.log('✅ Database berhasil diinisialisasi!');
}

module.exports = db;
