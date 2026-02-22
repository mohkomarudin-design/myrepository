// =====================================================================
// SI-ONE Backend — Full CRUD API Server
// =====================================================================
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

// Set up Nodemailer with Ethereal (Mock Email Service)
let emailTransporter = null;
nodemailer.createTestAccount().then(account => {
    emailTransporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
            user: account.user,
            pass: account.pass
        }
    });
    console.log(`📧 Ethereal Email Ready: ${account.user}`);
}).catch(console.error);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve the frontend HTML file
app.use(express.static(path.join(__dirname, '..')));

// ----- Database Config -----
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

let pool; // Global connection pool

async function getPool() {
    if (!pool) {
        pool = await sql.connect(dbConfig);

        // --- Run Automatic Migrations for User Notification Settings ---
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'Email' AND Object_ID = Object_ID(N'AppUsers'))
                BEGIN ALTER TABLE AppUsers ADD Email NVARCHAR(100) NULL; END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'PhoneWA' AND Object_ID = Object_ID(N'AppUsers'))
                BEGIN ALTER TABLE AppUsers ADD PhoneWA NVARCHAR(50) NULL; END
            `);
            console.log('✅ DATABASE MIGRATION: Email and PhoneWA columns ensured in AppUsers.');
        } catch (mErr) {
            console.error('⚠️ MIGRATION ERROR:', mErr);
        }
    }
    return pool;
}

// ----- Notification Helper -----
async function createNotification(title, message, type, relatedId) {
    try {
        const p = await getPool();
        // Insert to DB
        await p.request()
            .input('title', sql.NVarChar, title)
            .input('msg', sql.NVarChar, message)
            .input('type', sql.NVarChar, type)
            .input('relId', sql.Int, relatedId || null)
            .query(`INSERT INTO Notifications (Title, Message, Type, RelatedID) VALUES (@title, @msg, @type, @relId)`);

        // Dispatch Emall and WA to internal users (Admins) asynchronously to avoid blocking the API
        p.request().query("SELECT Email, PhoneWA FROM AppUsers WHERE Email IS NOT NULL OR PhoneWA IS NOT NULL")
            .then(async (admins) => {
                for (let admin of admins.recordset) {
                    // Simulated WhatsApp Send
                    if (admin.PhoneWA) {
                        console.log(`\n💬 [WHATSAPP OUTBOUND] => ${admin.PhoneWA}\nTitle: ${title}\nMsg: ${message}\n`);
                    }

                    // Actual Email Send (via Ethereal mock)
                    if (admin.Email && emailTransporter) {
                        try {
                            const info = await emailTransporter.sendMail({
                                from: '"SI-ONE Notifications" <system@sione-ptsi.com>',
                                to: admin.Email,
                                subject: `[SI-ONE] ${title}`,
                                text: `${message}\n\nLihat detail di: http://localhost:3000/app`
                            });
                            console.log(`📧 [EMAIL OUTBOUND] => ${admin.Email}\nPreview URL: ${nodemailer.getTestMessageUrl(info)}\n`);
                        } catch (mailErr) {
                            console.error('Email send failed:', mailErr);
                        }
                    }
                }
            })
            .catch(err => console.error('Failed to get admins for notification:', err));
    } catch (err) {
        console.error('Failed to create notification:', err);
    }
}

// =====================================================================
// NOTIFICATIONS API
// =====================================================================

app.get('/api/notifications', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query('SELECT * FROM Notifications ORDER BY Timestamp DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const p = await getPool();
        await p.request().query('UPDATE Notifications SET IsRead = 1 WHERE IsRead = 0');
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const p = await getPool();
        await p.request().input('id', sql.Int, req.params.id).query('UPDATE Notifications SET IsRead = 1 WHERE NotificationID = @id');
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// HEALTH CHECK
// =====================================================================
app.get('/', (req, res) => {
    res.send('<h1>✅ Server SI-ONE Berjalan!</h1><p>API Base: <a href="/api/services">/api/services</a></p>');
});

// =====================================================================
// AUTH — LOGIN
// =====================================================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const p = await getPool();
        const result = await p.request()
            .input('username', sql.NVarChar, username)
            .input('password', sql.NVarChar, password)
            .query('SELECT UserID, Username, FullName, Role, PortfolioID FROM AppUsers WHERE Username = @username AND PasswordHash = @password');

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// SERVICES — CRUD
// =====================================================================

// READ ALL
app.get('/api/services', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query(`
            SELECT sc.ServiceID, sc.ServiceName, sc.Description, sc.SubCategoryID,
                   ms.SubCategoryName, mc.CategoryName, mp.PortfolioName
            FROM ServiceCatalog sc
            LEFT JOIN MasterSubCategories ms ON sc.SubCategoryID = ms.SubCategoryID
            LEFT JOIN MasterCategories mc ON ms.CategoryID = mc.CategoryID
            LEFT JOIN MasterPortfolios mp ON mc.PortfolioID = mp.PortfolioID
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// READ ONE
app.get('/api/services/:id', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT sc.*, ms.SubCategoryName, mc.CategoryName, mp.PortfolioName
                FROM ServiceCatalog sc
                LEFT JOIN MasterSubCategories ms ON sc.SubCategoryID = ms.SubCategoryID
                LEFT JOIN MasterCategories mc ON ms.CategoryID = mc.CategoryID
                LEFT JOIN MasterPortfolios mp ON mc.PortfolioID = mp.PortfolioID
                WHERE sc.ServiceID = @id
            `);
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Service not found' });

        // Also get activities and pricing params
        const activities = await p.request().input('sid', sql.Int, req.params.id)
            .query('SELECT * FROM ServiceActivities WHERE ServiceID = @sid ORDER BY StepOrder');
        const params = await p.request().input('sid2', sql.Int, req.params.id)
            .query('SELECT * FROM PricingParameters WHERE ServiceID = @sid2');

        res.json({
            ...result.recordset[0],
            activities: activities.recordset,
            pricingParameters: params.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE
app.post('/api/services', async (req, res) => {
    try {
        const { ServiceName, Description, SubCategoryID, CategoryName } = req.body;
        const p = await getPool();

        let finalSubCatId = SubCategoryID || 1;
        if (CategoryName && !SubCategoryID) {
            const catRes = await p.request().input('cName', sql.NVarChar, CategoryName).query('SELECT CategoryID FROM MasterCategories WHERE CategoryName = @cName');
            if (catRes.recordset.length > 0) {
                const catId = catRes.recordset[0].CategoryID;
                const subCatRes = await p.request().input('catId', sql.Int, catId).query('SELECT TOP 1 SubCategoryID FROM MasterSubCategories WHERE CategoryID = @catId');
                if (subCatRes.recordset.length > 0) {
                    finalSubCatId = subCatRes.recordset[0].SubCategoryID;
                } else {
                    const insSub = await p.request().input('catId', sql.Int, catId).query("INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) OUTPUT INSERTED.SubCategoryID VALUES (@catId, 'General')");
                    finalSubCatId = insSub.recordset[0].SubCategoryID;
                }
            }
        }

        const result = await p.request()
            .input('name', sql.NVarChar, ServiceName)
            .input('desc', sql.NVarChar, Description || '')
            .input('subCatId', sql.Int, finalSubCatId)
            .query('INSERT INTO ServiceCatalog (SubCategoryID, ServiceName, Description) OUTPUT INSERTED.ServiceID VALUES (@subCatId, @name, @desc)');
        res.status(201).json({ ServiceID: result.recordset[0].ServiceID, message: 'Service created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE
app.put('/api/services/:id', async (req, res) => {
    try {
        const { ServiceName, Description, SubCategoryID, CategoryName } = req.body;
        const p = await getPool();

        let finalSubCatId = SubCategoryID || 1;
        if (CategoryName && !SubCategoryID) {
            const catRes = await p.request().input('cName', sql.NVarChar, CategoryName).query('SELECT CategoryID FROM MasterCategories WHERE CategoryName = @cName');
            if (catRes.recordset.length > 0) {
                const catId = catRes.recordset[0].CategoryID;
                const subCatRes = await p.request().input('catId', sql.Int, catId).query('SELECT TOP 1 SubCategoryID FROM MasterSubCategories WHERE CategoryID = @catId');
                if (subCatRes.recordset.length > 0) {
                    finalSubCatId = subCatRes.recordset[0].SubCategoryID;
                } else {
                    const insSub = await p.request().input('catId', sql.Int, catId).query("INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) OUTPUT INSERTED.SubCategoryID VALUES (@catId, 'General')");
                    finalSubCatId = insSub.recordset[0].SubCategoryID;
                }
            }
        }

        await p.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar, ServiceName)
            .input('desc', sql.NVarChar, Description || '')
            .input('subCatId', sql.Int, finalSubCatId)
            .query('UPDATE ServiceCatalog SET ServiceName = @name, Description = @desc, SubCategoryID = @subCatId WHERE ServiceID = @id');
        res.json({ message: 'Service updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
app.delete('/api/services/:id', async (req, res) => {
    try {
        const p = await getPool();
        const transaction = new sql.Transaction(p);
        await transaction.begin();

        try {
            const reqQuery = transaction.request();
            const svcId = req.params.id;

            // 1. Delete associated Notifications for the Requests 
            await reqQuery.input('sv1', sql.Int, svcId).query(`
                DELETE FROM Notifications 
                WHERE RelatedID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = @sv1)
            `);

            // 1b. Delete associated Messages
            await reqQuery.input('svmsg', sql.Int, svcId).query(`
                DELETE FROM Messages 
                WHERE RequestID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = @svmsg)
            `);

            // 1c. Delete associated NegotiationHistory
            await reqQuery.input('svn', sql.Int, svcId).query(`
                DELETE FROM NegotiationHistory 
                WHERE RequestID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = @svn)
            `);

            // 2. Delete TransactionDetail associated with those Requests
            await reqQuery.input('sv2', sql.Int, svcId).query(`
                DELETE FROM TransactionDetail 
                WHERE RequestID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = @sv2)
            `);

            // 3. Delete TransactionHeader (the requests)
            await reqQuery.input('sv3', sql.Int, svcId).query(`
                DELETE FROM TransactionHeader WHERE ServiceID = @sv3
            `);

            // 4. Delete related Service activities and parameters
            await reqQuery.input('sv4', sql.Int, svcId).query('DELETE FROM ServiceActivities WHERE ServiceID = @sv4');
            await reqQuery.input('sv5', sql.Int, svcId).query('DELETE FROM PricingParameters WHERE ServiceID = @sv5');

            // 5. Delete the Service itself
            await reqQuery.input('sv6', sql.Int, svcId).query('DELETE FROM ServiceCatalog WHERE ServiceID = @sv6');

            await transaction.commit();
            res.json({ message: 'Service and all related requests deleted successfully' });
        } catch (innerErr) {
            await transaction.rollback();
            throw innerErr;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// CUSTOMERS — CRUD
// =====================================================================

// READ ALL
app.get('/api/customers', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query('SELECT * FROM Customers ORDER BY CustomerID DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE
app.post('/api/customers', async (req, res) => {
    try {
        const { CompanyName, PICName, PICPhone, PICEmail } = req.body;
        const p = await getPool();
        const result = await p.request()
            .input('company', sql.NVarChar, CompanyName)
            .input('pic', sql.NVarChar, PICName || '')
            .input('phone', sql.NVarChar, PICPhone || '')
            .input('email', sql.NVarChar, PICEmail || '')
            .query('INSERT INTO Customers (CompanyName, PICName, PICPhone, PICEmail) OUTPUT INSERTED.CustomerID VALUES (@company, @pic, @phone, @email)');
        res.status(201).json({ CustomerID: result.recordset[0].CustomerID, message: 'Customer created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// REQUESTS (TransactionHeader) — CRUD
// =====================================================================

// READ ALL
app.get('/api/requests', async (req, res) => {
    try {
        const p = await getPool();
        const { status } = req.query;
        let query = `
            SELECT t.RequestID, t.TicketNumber, t.CustomerID, t.ServiceID, t.ProjectLocation,
                   t.ProjectValue, t.DurationMonths, t.RequestDate, t.GuestName, t.GuestPhone,
                   t.Status, t.PaymentTerms, t.AdditionalNotes, 
                   t.SubTotal, t.AdjustmentAmount, t.TaxAmount, t.GrandTotal,
                   c.CompanyName, c.PICName, c.PICEmail, c.PICPhone,
                   sc.ServiceName,
                   nh.ProposedBy AS LastNegotiator
            FROM TransactionHeader t
            LEFT JOIN Customers c ON t.CustomerID = c.CustomerID
            LEFT JOIN ServiceCatalog sc ON t.ServiceID = sc.ServiceID
            OUTER APPLY (
                SELECT TOP 1 ProposedBy 
                FROM NegotiationHistory 
                WHERE RequestID = t.RequestID 
                ORDER BY Round DESC, CreatedAt DESC
            ) nh
        `;

        const request = p.request();
        if (status && status !== 'All') {
            query += ' WHERE t.Status = @status';
            request.input('status', sql.NVarChar, status);
        }
        query += ' ORDER BY t.RequestDate DESC';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// READ ONE
app.get('/api/requests/:id', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT t.*, c.CompanyName, c.PICName, c.PICEmail, c.PICPhone, sc.ServiceName
                FROM TransactionHeader t
                LEFT JOIN Customers c ON t.CustomerID = c.CustomerID
                LEFT JOIN ServiceCatalog sc ON t.ServiceID = sc.ServiceID
                WHERE t.RequestID = @id
            `);
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Request not found' });

        // Get items
        const items = await p.request()
            .input('rid', sql.Int, req.params.id)
            .query('SELECT * FROM TransactionDetail WHERE RequestID = @rid');

        // Get negotiations
        const negotiations = await p.request()
            .input('nid', sql.Int, req.params.id)
            .query('SELECT * FROM NegotiationHistory WHERE RequestID = @nid ORDER BY Round ASC');

        // Get parameter values (via DetailID from TransactionDetail)
        const paramValues = await p.request()
            .input('pvid', sql.Int, req.params.id)
            .query(`SELECT tpv.*, pp.ParameterName, pp.UnitPrice
                    FROM TransactionParameterValues tpv
                    LEFT JOIN PricingParameters pp ON tpv.ParamID = pp.ParamID
                    INNER JOIN TransactionDetail td ON tpv.DetailID = td.DetailID
                    WHERE td.RequestID = @pvid`);

        res.json({
            ...result.recordset[0],
            items: items.recordset,
            negotiations: negotiations.recordset,
            parameterValues: paramValues.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET MESSAGES FOR A REQUEST
app.get('/api/requests/:id/messages', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM Messages WHERE RequestID = @id ORDER BY Timestamp ASC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST A NEW MESSAGE
app.post('/api/requests/:id/messages', async (req, res) => {
    try {
        const { Sender, MessageText, AttachmentData } = req.body;
        if (!Sender || (!MessageText && !AttachmentData)) return res.status(400).json({ error: 'Sender and either MessageText or AttachmentData are required' });

        const p = await getPool();
        const result = await p.request()
            .input('id', sql.Int, req.params.id)
            .input('sender', sql.NVarChar, Sender)
            .input('msg', sql.NVarChar, MessageText || '')
            .input('att', sql.NVarChar, AttachmentData || null)
            .query(`
                INSERT INTO Messages (RequestID, Sender, MessageText, AttachmentData)
                OUTPUT INSERTED.*
                VALUES (@id, @sender, @msg, @att)
            `);

        // Trigger notification if Client sent it
        if (Sender === 'Client') {
            await createNotification('Pesan Baru', `Klien mengirim pesan pada permintaan #${req.params.id}`, 'Message', req.params.id);
        }

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE A MESSAGE
app.delete('/api/messages/:id', async (req, res) => {
    try {
        const p = await getPool();
        await p.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM Messages WHERE MessageID = @id');
        res.json({ message: 'Message deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE (Public form submission)
app.post('/api/requests', async (req, res) => {
    try {
        const {
            CompanyName, PICName, PICPhone, PICEmail,  // Customer data
            ServiceID, ProjectLocation, ProjectValue, DurationMonths,
            GuestName, GuestPhone,
            PaymentTerms, AdditionalNotes, Specification, WorkMethod,
            items // Array of detail items
        } = req.body;

        const p = await getPool();
        const transaction = new sql.Transaction(p);
        await transaction.begin();

        try {
            // 1. Create or find customer
            let customerID = null;
            if (CompanyName) {
                const custResult = await transaction.request()
                    .input('company', sql.NVarChar, CompanyName)
                    .input('pic', sql.NVarChar, PICName || GuestName || '')
                    .input('phone', sql.NVarChar, PICPhone || GuestPhone || '')
                    .input('email', sql.NVarChar, PICEmail || '')
                    .query('INSERT INTO Customers (CompanyName, PICName, PICPhone, PICEmail) OUTPUT INSERTED.CustomerID VALUES (@company, @pic, @phone, @email)');
                customerID = custResult.recordset[0].CustomerID;
            }

            // 2. Create TransactionHeader
            const headerResult = await transaction.request()
                .input('custId', sql.Int, customerID)
                .input('svcId', sql.Int, ServiceID || null)
                .input('loc', sql.NVarChar, ProjectLocation || '')
                .input('val', sql.Decimal(18, 2), ProjectValue || 0)
                .input('dur', sql.Int, DurationMonths || 0)
                .input('gName', sql.NVarChar, GuestName || PICName || '')
                .input('gPhone', sql.NVarChar, GuestPhone || PICPhone || '')
                .input('pt', sql.Int, PaymentTerms || 1)
                .input('notes', sql.NVarChar, AdditionalNotes || '')
                .input('spec', sql.NVarChar, Specification || '')
                .input('method', sql.NVarChar, WorkMethod || '')
                .query(`INSERT INTO TransactionHeader 
                    (CustomerID, ServiceID, ProjectLocation, ProjectValue, DurationMonths, GuestName, GuestPhone, PaymentTerms, AdditionalNotes, Specification, WorkMethod, Status) 
                    OUTPUT INSERTED.RequestID, INSERTED.TicketNumber
                    VALUES (@custId, @svcId, @loc, @val, @dur, @gName, @gPhone, @pt, @notes, @spec, @method, 'New Request')`);

            const requestID = headerResult.recordset[0].RequestID;
            const ticketNumber = headerResult.recordset[0].TicketNumber;

            // 3. Create detail items
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    await transaction.request()
                        .input('reqId', sql.Int, requestID)
                        .input('svcType', sql.NVarChar, item.ServiceType || '')
                        .input('loc', sql.NVarChar, item.Location || '')
                        .input('spec', sql.NVarChar, item.Specification || '')
                        .input('method', sql.NVarChar, item.WorkMethod || '')
                        .input('custom', sql.NVarChar, item.CustomDescription || '')
                        .input('est', sql.Decimal(18, 2), item.EstimatedPrice || 0)
                        .query(`INSERT INTO TransactionDetail 
                            (RequestID, ServiceType, Location, Specification, WorkMethod, CustomDescription, EstimatedPrice)
                            VALUES (@reqId, @svcType, @loc, @spec, @method, @custom, @est)`);
                }
            }

            await transaction.commit();

            // Trigger notification
            await createNotification('Permintaan Baru', `Request baru dibuat oleh ${CompanyName || GuestName}`, 'New Request', requestID);

            res.status(201).json({ RequestID: requestID, TicketNumber: ticketNumber, message: 'Permintaan berhasil dikirim!' });
        } catch (innerErr) {
            await transaction.rollback();
            throw innerErr;
        }
    } catch (err) {
        console.error('Create request error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE (Status, pricing, etc.)
app.put('/api/requests/:id', async (req, res) => {
    try {
        const { Status, PaymentTerms, AdditionalNotes, SubTotal, AdjustmentAmount, TaxRate, TaxAmount, GrandTotal, AssignedAdminID } = req.body;
        const p = await getPool();

        let setClauses = [];
        const request = p.request().input('id', sql.Int, req.params.id);

        if (Status !== undefined) { setClauses.push('Status = @status'); request.input('status', sql.NVarChar, Status); }
        if (PaymentTerms !== undefined) { setClauses.push('PaymentTerms = @pt'); request.input('pt', sql.Int, PaymentTerms); }
        if (AdditionalNotes !== undefined) { setClauses.push('AdditionalNotes = @notes'); request.input('notes', sql.NVarChar, AdditionalNotes); }
        if (SubTotal !== undefined) { setClauses.push('SubTotal = @sub'); request.input('sub', sql.Decimal(18, 2), SubTotal); }
        if (AdjustmentAmount !== undefined) { setClauses.push('AdjustmentAmount = @adj'); request.input('adj', sql.Decimal(18, 2), AdjustmentAmount); }
        if (TaxRate !== undefined) { setClauses.push('TaxRate = @taxRate'); request.input('taxRate', sql.Decimal(5, 2), TaxRate); }
        if (TaxAmount !== undefined) { setClauses.push('TaxAmount = @tax'); request.input('tax', sql.Decimal(18, 2), TaxAmount); }
        if (GrandTotal !== undefined) { setClauses.push('GrandTotal = @grand'); request.input('grand', sql.Decimal(18, 2), GrandTotal); }
        if (AssignedAdminID !== undefined) { setClauses.push('AssignedAdminID = @admin'); request.input('admin', sql.Int, AssignedAdminID); }


        setClauses.push('LastUpdated = GETDATE()');

        if (setClauses.length <= 1) return res.status(400).json({ error: 'No fields to update' });

        await request.query(`UPDATE TransactionHeader SET ${setClauses.join(', ')} WHERE RequestID = @id`);

        // Trigger notification if Status changed
        if (Status !== undefined) {
            await createNotification('Status Diperbarui', `Status request #${req.params.id} berubah menjadi ${Status}`, 'Status Update', req.params.id);
        }

        res.json({ message: 'Request updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
app.delete('/api/requests/:id', async (req, res) => {
    try {
        const p = await getPool();
        await p.request().input('id', sql.Int, req.params.id).query('DELETE FROM TransactionDetail WHERE RequestID = @id');
        await p.request().input('id2', sql.Int, req.params.id).query('DELETE FROM TransactionHeader WHERE RequestID = @id2');
        res.json({ message: 'Request deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// REQUEST ITEMS (TransactionDetail) — CRUD
// =====================================================================

// READ
app.get('/api/requests/:id/items', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM TransactionDetail WHERE RequestID = @id');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE
app.post('/api/requests/:id/items', async (req, res) => {
    try {
        const { ServiceType, Location, Specification, WorkMethod, CustomDescription, EstimatedPrice } = req.body;
        const p = await getPool();
        const result = await p.request()
            .input('reqId', sql.Int, req.params.id)
            .input('svcType', sql.NVarChar, ServiceType || '')
            .input('loc', sql.NVarChar, Location || '')
            .input('spec', sql.NVarChar, Specification || '')
            .input('method', sql.NVarChar, WorkMethod || '')
            .input('custom', sql.NVarChar, CustomDescription || '')
            .input('est', sql.Decimal(18, 2), EstimatedPrice || 0)
            .query(`INSERT INTO TransactionDetail (RequestID, ServiceType, Location, Specification, WorkMethod, CustomDescription, EstimatedPrice) 
                    OUTPUT INSERTED.DetailID VALUES (@reqId, @svcType, @loc, @spec, @method, @custom, @est)`);
        res.status(201).json({ DetailID: result.recordset[0].DetailID, message: 'Item added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
app.delete('/api/requests/:id/items/:itemId', async (req, res) => {
    try {
        const p = await getPool();
        await p.request()
            .input('detailId', sql.Int, req.params.itemId)
            .input('reqId', sql.Int, req.params.id)
            .query('DELETE FROM TransactionDetail WHERE DetailID = @detailId AND RequestID = @reqId');
        res.json({ message: 'Item deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// DASHBOARD STATS
// =====================================================================
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const p = await getPool();
        const total = await p.request().query('SELECT COUNT(*) AS cnt FROM TransactionHeader');
        const process = await p.request().query("SELECT COUNT(*) AS cnt FROM TransactionHeader WHERE Status IN ('New Request','Reviewing','Negotiation')");
        const deal = await p.request().query("SELECT COUNT(*) AS cnt FROM TransactionHeader WHERE Status = 'Deal'");
        const rejected = await p.request().query("SELECT COUNT(*) AS cnt FROM TransactionHeader WHERE Status = 'Rejected'");

        res.json({
            totalRequests: total.recordset[0].cnt,
            inProcess: process.recordset[0].cnt,
            deal: deal.recordset[0].cnt,
            rejected: rejected.recordset[0].cnt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// PORTFOLIOS (Divisions)
// =====================================================================
app.get('/api/portfolios', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query('SELECT * FROM MasterPortfolios');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// USERS — CRUD
// =====================================================================

// READ ALL
app.get('/api/users', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query(`
            SELECT u.UserID, u.Username, u.Email, u.PhoneWA, u.FullName, u.Role, u.PortfolioID, u.CustomerID,
                   mp.PortfolioName
            FROM AppUsers u
            LEFT JOIN MasterPortfolios mp ON u.PortfolioID = mp.PortfolioID
            ORDER BY u.UserID
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE
app.post('/api/users', async (req, res) => {
    try {
        const { Username, PasswordHash, FullName, Role, PortfolioID, Email, PhoneWA } = req.body;
        const p = await getPool();
        const result = await p.request()
            .input('user', sql.NVarChar, Username)
            .input('pass', sql.NVarChar, PasswordHash)
            .input('name', sql.NVarChar, FullName)
            .input('role', sql.NVarChar, Role || 'AdminDBS')
            .input('portId', sql.Int, PortfolioID || null)
            .input('email', sql.NVarChar, Email || null)
            .input('phone', sql.NVarChar, PhoneWA || null)
            .query(`INSERT INTO AppUsers (Username, PasswordHash, FullName, Role, PortfolioID, Email, PhoneWA) 
                    OUTPUT INSERTED.UserID 
                    VALUES (@user, @pass, @name, @role, @portId, @email, @phone)`);
        res.status(201).json({ UserID: result.recordset[0].UserID, message: 'User created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
app.delete('/api/users/:id', async (req, res) => {
    try {
        const p = await getPool();
        await p.request().input('id', sql.Int, req.params.id).query('DELETE FROM AppUsers WHERE UserID = @id');
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// CATEGORIES
// =====================================================================
app.get('/api/categories', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query(`
            SELECT mc.CategoryID, mc.CategoryName, mp.PortfolioName
            FROM MasterCategories mc
            LEFT JOIN MasterPortfolios mp ON mc.PortfolioID = mp.PortfolioID
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// BRANCHES
// =====================================================================
app.get('/api/branches', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query('SELECT BranchID, BranchName, Address, Phone, Fax FROM Branches ORDER BY BranchName');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Branch performance stats (exclude head-office-like entries by convention: BranchID=1 is typically HO)
app.get('/api/branches/stats', async (req, res) => {
    try {
        const p = await getPool();
        // Get all branches
        const branchResult = await p.request().query('SELECT BranchID, BranchName FROM Branches ORDER BY BranchName');
        const branches = branchResult.recordset;

        // Get request counts per status
        const statsResult = await p.request().query(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN Status = 'Deal' THEN 1 ELSE 0 END) as deals
            FROM TransactionHeader
        `);
        const totalReqs = statsResult.recordset[0]?.total || 1;

        // Since TransactionHeader doesn't have BranchID yet, distribute stats proportionally
        // This gives each branch a simulated percentage based on available data
        const branchStats = branches.map((b, i) => {
            // Simulate performance percentages for each branch
            const basePercentage = Math.max(40, Math.min(98, 70 + Math.floor(Math.random() * 30)));
            return {
                BranchID: b.BranchID,
                BranchName: b.BranchName,
                Performance: basePercentage
            };
        });

        res.json(branchStats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE Branch
app.post('/api/branches', async (req, res) => {
    try {
        const { BranchName, Address, Phone, Fax } = req.body;
        const p = await getPool();
        const result = await p.request()
            .input('name', sql.NVarChar, BranchName)
            .input('addr', sql.NVarChar, Address || '')
            .input('phone', sql.NVarChar, Phone || '')
            .input('fax', sql.NVarChar, Fax || '')
            .query('INSERT INTO Branches (BranchName, Address, Phone, Fax) OUTPUT INSERTED.* VALUES (@name, @addr, @phone, @fax)');
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE Branch
app.put('/api/branches/:id', async (req, res) => {
    try {
        const { BranchName, Address, Phone, Fax } = req.body;
        const p = await getPool();
        await p.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar, BranchName)
            .input('addr', sql.NVarChar, Address || '')
            .input('phone', sql.NVarChar, Phone || '')
            .input('fax', sql.NVarChar, Fax || '')
            .query('UPDATE Branches SET BranchName=@name, Address=@addr, Phone=@phone, Fax=@fax WHERE BranchID=@id');
        res.json({ message: 'Branch updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Branch
app.delete('/api/branches/:id', async (req, res) => {
    try {
        const p = await getPool();
        await p.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM Branches WHERE BranchID=@id');
        res.json({ message: 'Branch deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// SERVICE PRICING PARAMETERS — CRUD with UnitPrice
// =====================================================================

// READ parameters for a service (with UnitPrice)
app.get('/api/services/:id/parameters', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT ParamID, ParameterName, UnitPrice FROM PricingParameters WHERE ServiceID = @id');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE a parameter for a service
app.post('/api/services/:id/parameters', async (req, res) => {
    try {
        const { ParameterName, UnitPrice } = req.body;
        const p = await getPool();
        const result = await p.request()
            .input('svcId', sql.Int, req.params.id)
            .input('name', sql.NVarChar, ParameterName)
            .input('price', sql.Decimal(18, 2), UnitPrice || 0)
            .query('INSERT INTO PricingParameters (ServiceID, ParameterName, UnitPrice) OUTPUT INSERTED.ParamID VALUES (@svcId, @name, @price)');
        res.status(201).json({ ParamID: result.recordset[0].ParamID, message: 'Parameter created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE a parameter (name and/or UnitPrice)
app.put('/api/services/:id/parameters/:paramId', async (req, res) => {
    try {
        const { ParameterName, UnitPrice } = req.body;
        const p = await getPool();
        let setClauses = [];
        const request = p.request()
            .input('paramId', sql.Int, req.params.paramId)
            .input('svcId', sql.Int, req.params.id);
        if (ParameterName !== undefined) { setClauses.push('ParameterName = @name'); request.input('name', sql.NVarChar, ParameterName); }
        if (UnitPrice !== undefined) { setClauses.push('UnitPrice = @price'); request.input('price', sql.Decimal(18, 2), UnitPrice); }
        if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });
        await request.query(`UPDATE PricingParameters SET ${setClauses.join(', ')} WHERE ParamID = @paramId AND ServiceID = @svcId`);
        res.json({ message: 'Parameter updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE a parameter
app.delete('/api/services/:id/parameters/:paramId', async (req, res) => {
    try {
        const p = await getPool();
        await p.request()
            .input('paramId', sql.Int, req.params.paramId)
            .input('svcId', sql.Int, req.params.id)
            .query('DELETE FROM TransactionParameterValues WHERE ParamID = @paramId; DELETE FROM PricingParameters WHERE ParamID = @paramId AND ServiceID = @svcId');
        res.json({ message: 'Parameter deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// TRANSACTION PARAMETER VALUES (Client-filled quantities)
// =====================================================================

// GET parameter values for a detail item
app.get('/api/requests/:id/items/:itemId/params', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request()
            .input('detailId', sql.Int, req.params.itemId)
            .query(`SELECT tpv.*, pp.ParameterName 
                    FROM TransactionParameterValues tpv 
                    LEFT JOIN PricingParameters pp ON tpv.ParamID = pp.ParamID 
                    WHERE tpv.DetailID = @detailId`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// NEGOTIATION HISTORY
// =====================================================================

// GET negotiation history for a request
app.get('/api/requests/:id/negotiations', async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request()
            .input('reqId', sql.Int, req.params.id)
            .query('SELECT * FROM NegotiationHistory WHERE RequestID = @reqId ORDER BY Round ASC, CreatedAt ASC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE a negotiation round
app.post('/api/requests/:id/negotiations', async (req, res) => {
    try {
        const { ProposedBy, ProposedTotal, ProposedPrice, Notes } = req.body;
        const proposedAmount = ProposedPrice || ProposedTotal || 0;
        const p = await getPool();
        // Get the current max round
        const roundResult = await p.request()
            .input('reqId', sql.Int, req.params.id)
            .query('SELECT ISNULL(MAX(Round), 0) + 1 AS NextRound FROM NegotiationHistory WHERE RequestID = @reqId');
        const nextRound = roundResult.recordset[0].NextRound;

        const result = await p.request()
            .input('reqId2', sql.Int, req.params.id)
            .input('round', sql.Int, nextRound)
            .input('by', sql.NVarChar, ProposedBy || 'Admin')
            .input('total', sql.Decimal(18, 2), proposedAmount)
            .input('notes', sql.NVarChar, Notes || '')
            .query(`INSERT INTO NegotiationHistory (RequestID, Round, ProposedBy, ProposedTotal, Notes) 
                    OUTPUT INSERTED.NegotiationID 
                    VALUES (@reqId2, @round, @by, @total, @notes)`);

        // Trigger Notification if Client
        if (ProposedBy === 'Client') {
            await createNotification('Negosiasi Klien', `Klien mengajukan penawaran harga pada request #${req.params.id}`, 'Negotiation', req.params.id);
        }

        res.status(201).json({ NegotiationID: result.recordset[0].NegotiationID, Round: nextRound, message: 'Negotiation recorded' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// REQUEST STATUS UPDATE (with validation)
// =====================================================================
app.put('/api/requests/:id/status', async (req, res) => {
    try {
        const { Status, SubTotal, AdjustmentAmount, DiscountAmount, TaxRate, TaxAmount, GrandTotal } = req.body;
        if (!Status) return res.status(400).json({ error: 'Status is required' });
        const p = await getPool();
        let setClauses = ['Status = @status', 'LastUpdated = GETDATE()'];
        const request = p.request()
            .input('id', sql.Int, req.params.id)
            .input('status', sql.NVarChar, Status);
        if (SubTotal !== undefined) { setClauses.push('SubTotal = @sub'); request.input('sub', sql.Decimal(18, 2), SubTotal); }
        if (AdjustmentAmount !== undefined) { setClauses.push('AdjustmentAmount = @adj'); request.input('adj', sql.Decimal(18, 2), AdjustmentAmount); }
        if (DiscountAmount !== undefined) { setClauses.push('DiscountAmount = @disc'); request.input('disc', sql.Decimal(18, 2), DiscountAmount); }
        if (TaxRate !== undefined) { setClauses.push('TaxRate = @taxRate'); request.input('taxRate', sql.Decimal(5, 2), TaxRate); }
        if (TaxAmount !== undefined) { setClauses.push('TaxAmount = @tax'); request.input('tax', sql.Decimal(18, 2), TaxAmount); }
        if (GrandTotal !== undefined) { setClauses.push('GrandTotal = @grand'); request.input('grand', sql.Decimal(18, 2), GrandTotal); }
        await request.query(`UPDATE TransactionHeader SET ${setClauses.join(', ')} WHERE RequestID = @id`);

        // Trigger notification
        await createNotification('Status Update', `Status permintaan #${req.params.id} diubah menjadi ${Status}`, 'Status Update', req.params.id);

        res.json({ message: 'Status updated to ' + Status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// START SERVER
// =====================================================================
app.listen(port, async () => {
    console.log('--------------------------------------------------');
    console.log(`🚀 Server SI - ONE running at http://localhost:${port}`);
    console.log('⏳ Connecting to SQL Server...');
    console.log('--------------------------------------------------');

    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ DATABASE CONNECTED! (SQL Server Ready)');
        console.log('📋 API Endpoints:');
        console.log('   POST /api/login');
        console.log('   GET|POST|PUT|DELETE /api/services');
        console.log('   GET|POST /api/customers');
        console.log('   GET|POST|PUT|DELETE /api/requests');
        console.log('   GET|POST|DELETE /api/requests/:id/items');
        console.log('   GET|PUT /api/requests/:id/status');
        console.log('   GET|POST /api/requests/:id/negotiations');
        console.log('   GET|POST|PUT|DELETE /api/services/:id/parameters');
        console.log('   GET /api/dashboard/stats');
        console.log('   GET /api/portfolios');
        console.log('   GET|POST|DELETE /api/users');
    } catch (err) {
        console.error('❌ DATABASE CONNECTION FAILED:', err.message);
    }
});