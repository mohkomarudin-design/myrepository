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

async function importExcel() {
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

        console.log(`Found ${data.length} rows to import.`);

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const portfolioName = row['Pemilik Portofolio'];
            const categoryName = row['Bidang / Sektor'];
            const subCategoryName = row['Subbidang / Objek Pekerjaan'];
            const serviceName = row['Jenis Pekerjaan'];
            const activitiesRaw = row['Rincian Kegiatan / Tahapan (Gabungan Lengkap)'];
            const parametersRaw = row['Parameter Penentuan Harga'];

            if (!portfolioName || !serviceName) continue;

            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                const req = transaction.request();

                // 1. Portfolio
                let pRes = await req.input('pName', sql.NVarChar, portfolioName).query('SELECT PortfolioID FROM MasterPortfolios WHERE PortfolioName = @pName');
                let portfolioId;
                if (pRes.recordset.length > 0) {
                    portfolioId = pRes.recordset[0].PortfolioID;
                } else {
                    let pIns = await req.query('INSERT INTO MasterPortfolios (PortfolioName) OUTPUT INSERTED.PortfolioID VALUES (@pName)');
                    portfolioId = pIns.recordset[0].PortfolioID;
                }

                // 2. Category
                let cRes = await req.input('cName', sql.NVarChar, categoryName).input('pId', sql.Int, portfolioId).query('SELECT CategoryID FROM MasterCategories WHERE CategoryName = @cName AND PortfolioID = @pId');
                let categoryId;
                if (cRes.recordset.length > 0) {
                    categoryId = cRes.recordset[0].CategoryID;
                } else {
                    let cIns = await req.query('INSERT INTO MasterCategories (PortfolioID, CategoryName) OUTPUT INSERTED.CategoryID VALUES (@pId, @cName)');
                    categoryId = cIns.recordset[0].CategoryID;
                }

                // 3. SubCategory
                let sRes = await req.input('sName', sql.NVarChar, subCategoryName).input('cId', sql.Int, categoryId).query('SELECT SubCategoryID FROM MasterSubCategories WHERE SubCategoryName = @sName AND CategoryID = @cId');
                let subCategoryId;
                if (sRes.recordset.length > 0) {
                    subCategoryId = sRes.recordset[0].SubCategoryID;
                } else {
                    let sIns = await req.query('INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) OUTPUT INSERTED.SubCategoryID VALUES (@cId, @sName)');
                    subCategoryId = sIns.recordset[0].SubCategoryID;
                }

                // 4. Service
                // Delete if exists to recreate clean? Or just skip if exists? 
                // Let's insert blindly, or check if it exists in this exact subcat.
                let svcRes = await req.input('svcName', sql.NVarChar, serviceName).input('subCatId', sql.Int, subCategoryId).query('SELECT ServiceID FROM ServiceCatalog WHERE ServiceName = @svcName AND SubCategoryID = @subCatId');
                let serviceId;

                if (svcRes.recordset.length > 0) {
                    console.log(`Row ${i + 1}: Service '${serviceName}' already exists. Skipping insertion.`);
                    await transaction.rollback();
                    continue;
                }

                let svcIns = await req.query('INSERT INTO ServiceCatalog (SubCategoryID, ServiceName, Description) OUTPUT INSERTED.ServiceID VALUES (@subCatId, @svcName, \'\')');
                serviceId = svcIns.recordset[0].ServiceID;

                // 5. Activities
                if (activitiesRaw) {
                    // Split by newline and filter empty
                    const activities = activitiesRaw.split(/\\r?\\n/).map(a => a.trim().replace(/^\\d+\\.?\\s*|-\\s*|•\\s*/, '')).filter(a => a.length > 0);
                    for (let j = 0; j < activities.length; j++) {
                        let reqAct = transaction.request();
                        await reqAct.input('svcId', sql.Int, serviceId)
                            .input('order', sql.Int, j + 1)
                            .input('actName', sql.NVarChar, activities[j])
                            .query('INSERT INTO ServiceActivities (ServiceID, StepOrder, ActivityName) VALUES (@svcId, @order, @actName)');
                    }
                }

                // 6. Pricing Parameters
                if (parametersRaw) {
                    const parameters = parametersRaw.split(/\\r?\\n/).map(p => p.trim().replace(/^•\\s*/, '')).filter(p => p.length > 0);
                    for (let k = 0; k < parameters.length; k++) {
                        let reqParam = transaction.request();
                        await reqParam.input('svcId', sql.Int, serviceId)
                            .input('pName', sql.NVarChar, parameters[k])
                            .query('INSERT INTO PricingParameters (ServiceID, ParameterName) VALUES (@svcId, @pName)');
                    }
                }

                res = await transaction.commit();
                console.log(`Row ${i + 1}: Inserted '${serviceName}' successfully.`);
            } catch (err) {
                console.error(`Row ${i + 1}: Error - ${err.message}`);
                await transaction.rollback();
            }
        }

        console.log('Import finished.');
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        if (pool) await pool.close();
    }
}

importExcel();
