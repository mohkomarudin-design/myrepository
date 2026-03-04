const db = require('./database');
const fs = require('fs');

console.log('=== Documents in master_dokumen ===');
const docs = db.prepare('SELECT no_dokumen, nama_dokumen, file_path FROM master_dokumen').all();
docs.forEach(d => console.log(d.no_dokumen, '|', d.file_path || 'NO FILE'));

console.log('\n=== Files in uploads/ ===');
try {
    const files = fs.readdirSync('./uploads');
    console.log(files);
} catch (e) { console.log('No uploads dir'); }

console.log('\n=== Recent penyerahan details ===');
const details = db.prepare('SELECT id_penyerahan, no_dokumen, nama_dokumen, file_path FROM detail_penyerahan').all();
details.forEach(d => console.log(d.id_penyerahan, '|', d.no_dokumen, '|', d.file_path || 'NO FILE'));
