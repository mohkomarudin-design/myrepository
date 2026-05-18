const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function run() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    console.log('Updating dummy prices for parameters...');
    const params = await db.all('SELECT ParamID, ParameterName FROM PricingParameters');
    
    await db.exec('BEGIN TRANSACTION');
    try {
        for (const p of params) {
            let price = 0;
            const name = p.ParameterName.toLowerCase();
            
            // Assign some 'realistic' dummy prices based on keywords
            if (name.includes('lokasi') || name.includes('site') || name.includes('pabrik') || name.includes('negara')) {
                price = Math.floor(Math.random() * 5 + 2) * 500000; // 1M - 3M
            } else if (name.includes('spesifikasi') || name.includes('kompleksitas') || name.includes('jenis')) {
                price = Math.floor(Math.random() * 10 + 5) * 1000000; // 5M - 14M
            } else if (name.includes('luas') || name.includes('panjang') || name.includes('area') || name.includes('diameter')) {
                price = Math.floor(Math.random() * 5 + 1) * 200000; // 200k - 1M
            } else if (name.includes('durasi') || name.includes('waktu')) {
                price = Math.floor(Math.random() * 5 + 5) * 500000; // 2.5M - 4.5M
            } else if (name.includes('jumlah') || name.includes('kapasitas') || name.includes('volume') || name.includes('skala') || name.includes('nilai')) {
                price = Math.floor(Math.random() * 20 + 2) * 100000; // 200k - 2.1M
            } else {
                price = Math.floor(Math.random() * 10 + 2) * 100000; // 200k - 1.1M
            }
            
            await db.run('UPDATE PricingParameters SET UnitPrice = ? WHERE ParamID = ?', [price, p.ParamID]);
        }
        await db.exec('COMMIT');
        console.log(`Updated ${params.length} parameters with dummy prices.`);
    } catch (err) {
        await db.exec('ROLLBACK');
        console.error('Error updating prices:', err);
    }
}

run();
