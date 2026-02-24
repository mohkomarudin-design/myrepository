const xlsx = require('xlsx');
const path = require('path');
const file = path.join(__dirname, '../Rekapitulasi Portofolio dan Paramater Harga.xlsx');
try {
    const workbook = xlsx.readFile(file);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const mapping = {};
    data.forEach(item => {
        const portfolio = item['Pemilik Portofolio'];
        const bidang = item['Bidang / Sektor'];
        if (portfolio && bidang) {
            if (!mapping[portfolio]) mapping[portfolio] = new Set();
            mapping[portfolio].add(bidang);
        }
    });

    for (const k in mapping) {
        mapping[k] = Array.from(mapping[k]);
    }

    console.log(JSON.stringify(mapping, null, 2));
} catch (e) {
    console.error(e);
}
