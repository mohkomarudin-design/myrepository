const xlsx = require('xlsx');
const sql = require('mssql');
const path = require('path');

const dbConfig = {
    user: 'admin_sione',
    password: 'sione123',
    server: 'localhost',
    port: 1433,
    database: 'PTSI_Services_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 10000
    }
};

async function updateParameters() {
    let pool;
    try {
        console.log('Connecting to database...');
        pool = await sql.connect(dbConfig);
        console.log('Connected.');

        const filePath = path.join(__dirname, '../Rekapitulasi Portofolio dan Paramater Harga.xlsx');
        console.log(`Reading Excel file: ${filePath}`);
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log(`Found ${data.length} rows to check.`);

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const serviceName = row['Jenis Pekerjaan'];
            const parametersRaw = row['Parameter Penentuan Harga'];

            if (!serviceName) continue;

            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                const req = transaction.request();

                // Find ServiceID
                const svcRes = await req.input('svcName', sql.NVarChar, serviceName).query('SELECT ServiceID FROM ServiceCatalog WHERE ServiceName = @svcName');

                if (svcRes.recordset.length === 0) {
                    console.log(`Row ${i + 1}: Service '${serviceName}' not found in DB. Skipping.`);
                    await transaction.rollback();
                    continue;
                }

                const serviceId = svcRes.recordset[0].ServiceID;

                // Delete existing pricing parameters
                await req.input('currSvcId', sql.Int, serviceId).query('DELETE FROM PricingParameters WHERE ServiceID = @currSvcId');

                // Insert new parameters
                if (parametersRaw) {
                    const parameters = parametersRaw.split(/\\r?\\n|\r?\n/).map(p => p.trim().replace(/^•\s*/, '')).filter(p => p.length > 0);
                    for (let k = 0; k < parameters.length; k++) {
                        let reqParam = transaction.request();
                        await reqParam.input('insSvcId', sql.Int, serviceId)
                            .input('pName', sql.NVarChar, parameters[k])
                            .query('INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@insSvcId, @pName)');
                    }
                }

                await transaction.commit();
                console.log(`Row ${i + 1}: Updated parameters for '${serviceName}'.`);
            } catch (err) {
                console.error(`Row ${i + 1}: Error - ${err.message}`);
                await transaction.rollback();
            }
        }

        console.log('Parameter update finished.');
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        if (pool) await pool.close();
    }
}

updateParameters();
