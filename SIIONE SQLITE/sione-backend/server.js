const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

let emailTransporter = null;
nodemailer.createTestAccount().then(account => {
    emailTransporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass }
    });
    console.log(`📧 Ethereal Email Ready: ${account.user}`);
}).catch(console.error);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

let dbPromise = null;
async function getPool() {
    if (!dbPromise) {
        dbPromise = open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        }).then(async db => {
            await db.exec('PRAGMA foreign_keys = ON;');
            return db;
        });
    }
    return dbPromise;
}

async function createNotification(title, message, type, relatedId) {
    try {
        const db = await getPool();
        await db.run(
            `INSERT INTO Notifications (Title, Message, Type, RelatedID) VALUES (?, ?, ?, ?)`,
            [title, message, type, relatedId || null]
        );

        const admins = await db.all("SELECT Email, PhoneWA FROM AppUsers WHERE Email IS NOT NULL OR PhoneWA IS NOT NULL");
        for (let admin of admins) {
            if (admin.PhoneWA) console.log(`\n💬 [WHATSAPP OUTBOUND] => ${admin.PhoneWA}\nTitle: ${title}\nMsg: ${message}\n`);
            if (admin.Email && emailTransporter) {
                emailTransporter.sendMail({
                    from: '"SI-ONE Notifications" <system@sione-ptsi.com>',
                    to: admin.Email,
                    subject: `[SI-ONE] ${title}`,
                    text: `${message}\n\nLihat detail di: http://localhost:3000/app`
                }).then(info => {
                    console.log(`📧 [EMAIL OUTBOUND] => ${admin.Email}\nPreview URL: ${nodemailer.getTestMessageUrl(info)}\n`);
                }).catch(mailErr => console.error('Email send failed:', mailErr));
            }
        }
    } catch (err) { console.error('Failed to create notification:', err); }
}

app.get('/api/notifications', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT * FROM Notifications ORDER BY Timestamp DESC'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('UPDATE Notifications SET IsRead = 1 WHERE IsRead = 0');
        res.json({ message: 'All notifications marked as read' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('UPDATE Notifications SET IsRead = 1 WHERE NotificationID = ?', [req.params.id]);
        res.json({ message: 'Notification marked as read' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const GROQ_API_KEY = '';
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array is required' });

        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: messages, max_tokens: 1000 })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Groq API Error:', response.status, JSON.stringify(data));
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (err) {
        console.error('Chat proxy error:', err.message);
        res.status(500).json({ error: 'AI service unavailable: ' + err.message });
    }
});

app.get('/', (req, res) => res.send('<h1>✅ Server SI-ONE Berjalan!</h1><p>API Base: <a href="/api/services">/api/services</a></p>'));

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = await getPool();
        const result = await db.all('SELECT UserID, Username, FullName, Role, PortfolioID FROM AppUsers WHERE Username = ? AND PasswordHash = ?', [username, password]);
        if (result.length === 0) return res.status(401).json({ error: 'Username atau password salah' });
        res.json(result[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/services', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.all(`
            SELECT sc.ServiceID, sc.ServiceName, sc.Description, sc.SubCategoryID,
                   ms.SubCategoryName, mc.CategoryName, mp.PortfolioName
            FROM ServiceCatalog sc
            LEFT JOIN MasterSubCategories ms ON sc.SubCategoryID = ms.SubCategoryID
            LEFT JOIN MasterCategories mc ON ms.CategoryID = mc.CategoryID
            LEFT JOIN MasterPortfolios mp ON mc.PortfolioID = mp.PortfolioID
        `);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/services/:id', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.all(`
            SELECT sc.*, ms.SubCategoryName, mc.CategoryName, mp.PortfolioName
            FROM ServiceCatalog sc
            LEFT JOIN MasterSubCategories ms ON sc.SubCategoryID = ms.SubCategoryID
            LEFT JOIN MasterCategories mc ON ms.CategoryID = mc.CategoryID
            LEFT JOIN MasterPortfolios mp ON mc.PortfolioID = mp.PortfolioID
            WHERE sc.ServiceID = ?
        `, [req.params.id]);

        if (result.length === 0) return res.status(404).json({ error: 'Service not found' });
        const activities = await db.all('SELECT * FROM ServiceActivities WHERE ServiceID = ? ORDER BY StepOrder', [req.params.id]);
        const params = await db.all('SELECT * FROM PricingParameters WHERE ServiceID = ?', [req.params.id]);

        res.json({ ...result[0], activities: activities, pricingParameters: params });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/services', async (req, res) => {
    try {
        const { ServiceName, Description, SubCategoryID, CategoryName } = req.body;
        const db = await getPool();
        let finalSubCatId = SubCategoryID || 1;
        if (CategoryName && !SubCategoryID) {
            const catRes = await db.all('SELECT CategoryID FROM MasterCategories WHERE CategoryName = ?', [CategoryName]);
            if (catRes.length > 0) {
                const catId = catRes[0].CategoryID;
                const subCatRes = await db.all('SELECT SubCategoryID FROM MasterSubCategories WHERE CategoryID = ? LIMIT 1', [catId]);
                if (subCatRes.length > 0) finalSubCatId = subCatRes[0].SubCategoryID;
                else {
                    const insSub = await db.run("INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (?, 'General')", [catId]);
                    finalSubCatId = insSub.lastID;
                }
            }
        }
        const runResult = await db.run('INSERT INTO ServiceCatalog (SubCategoryID, ServiceName, Description) VALUES (?, ?, ?)', [finalSubCatId, ServiceName, Description || '']);
        res.status(201).json({ ServiceID: runResult.lastID, message: 'Service created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/services/:id', async (req, res) => {
    try {
        const { ServiceName, Description, SubCategoryID, CategoryName } = req.body;
        const db = await getPool();

        let finalSubCatId = SubCategoryID || 1;
        if (CategoryName && !SubCategoryID) {
            const catRes = await db.all('SELECT CategoryID FROM MasterCategories WHERE CategoryName = ?', [CategoryName]);
            if (catRes.length > 0) {
                const catId = catRes[0].CategoryID;
                const subCatRes = await db.all('SELECT SubCategoryID FROM MasterSubCategories WHERE CategoryID = ? LIMIT 1', [catId]);
                if (subCatRes.length > 0) finalSubCatId = subCatRes[0].SubCategoryID;
                else {
                    const insSub = await db.run("INSERT INTO MasterSubCategories (CategoryID, SubCategoryName) VALUES (?, 'General')", [catId]);
                    finalSubCatId = insSub.lastID;
                }
            }
        }

        await db.run('UPDATE ServiceCatalog SET ServiceName = ?, Description = ?, SubCategoryID = ? WHERE ServiceID = ?',
            [ServiceName, Description || '', finalSubCatId, req.params.id]);
        res.json({ message: 'Service updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('BEGIN TRANSACTION');
        try {
            const svcId = req.params.id;
            await db.run(`DELETE FROM Notifications WHERE RelatedID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = ?)`, [svcId]);
            await db.run(`DELETE FROM Messages WHERE RequestID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = ?)`, [svcId]);
            await db.run(`DELETE FROM NegotiationHistory WHERE RequestID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = ?)`, [svcId]);
            await db.run(`DELETE FROM TransactionDetail WHERE RequestID IN (SELECT RequestID FROM TransactionHeader WHERE ServiceID = ?)`, [svcId]);
            await db.run(`DELETE FROM TransactionHeader WHERE ServiceID = ?`, [svcId]);
            await db.run('DELETE FROM ServiceActivities WHERE ServiceID = ?', [svcId]);
            await db.run('DELETE FROM PricingParameters WHERE ServiceID = ?', [svcId]);
            await db.run('DELETE FROM ServiceCatalog WHERE ServiceID = ?', [svcId]);

            await db.run('COMMIT');
            res.json({ message: 'Service and all related requests deleted successfully' });
        } catch (innerErr) {
            await db.run('ROLLBACK');
            throw innerErr;
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT * FROM Customers ORDER BY CustomerID DESC'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', async (req, res) => {
    try {
        const { CompanyName, PICName, PICPhone, PICEmail } = req.body;
        const db = await getPool();
        const result = await db.run('INSERT INTO Customers (CompanyName, PICName, PICPhone, PICEmail) VALUES (?, ?, ?, ?)',
            [CompanyName, PICName || '', PICPhone || '', PICEmail || '']);
        res.status(201).json({ CustomerID: result.lastID, message: 'Customer created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests', async (req, res) => {
    try {
        const db = await getPool();
        const { status } = req.query;
        let query = `
            SELECT t.RequestID, t.TicketNumber, t.CustomerID, t.ServiceID, t.ProjectLocation,
                   t.ProjectValue, t.DurationMonths, t.RequestDate, t.GuestName, t.GuestPhone,
                   t.Status, t.PaymentTerms, t.AdditionalNotes, 
                   t.SubTotal, t.AdjustmentAmount, t.TaxAmount, t.GrandTotal,
                   c.CompanyName, c.PICName, c.PICEmail, c.PICPhone,
                   sc.ServiceName,
                   (SELECT ProposedBy FROM NegotiationHistory WHERE RequestID = t.RequestID ORDER BY Round DESC, CreatedAt DESC LIMIT 1) AS LastNegotiator
            FROM TransactionHeader t
            LEFT JOIN Customers c ON t.CustomerID = c.CustomerID
            LEFT JOIN ServiceCatalog sc ON t.ServiceID = sc.ServiceID
        `;

        const params = [];
        if (status && status !== 'All') {
            query += ' WHERE t.Status = ?';
            params.push(status);
        }
        query += ' ORDER BY t.RequestDate DESC';

        res.json(await db.all(query, params));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/:id', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.all(`
            SELECT t.*, c.CompanyName, c.PICName, c.PICEmail, c.PICPhone, sc.ServiceName
            FROM TransactionHeader t
            LEFT JOIN Customers c ON t.CustomerID = c.CustomerID
            LEFT JOIN ServiceCatalog sc ON t.ServiceID = sc.ServiceID
            WHERE t.RequestID = ?
        `, [req.params.id]);
        if (result.length === 0) return res.status(404).json({ error: 'Request not found' });

        const items = await db.all('SELECT * FROM TransactionDetail WHERE RequestID = ?', [req.params.id]);
        const negotiations = await db.all('SELECT * FROM NegotiationHistory WHERE RequestID = ? ORDER BY Round ASC', [req.params.id]);
        const paramValues = await db.all(`
            SELECT tpv.*, pp.ParameterName, pp.UnitPrice
            FROM TransactionParameterValues tpv
            LEFT JOIN PricingParameters pp ON tpv.ParamID = pp.ParamID
            INNER JOIN TransactionDetail td ON tpv.DetailID = td.DetailID
            WHERE td.RequestID = ?
        `, [req.params.id]);

        res.json({ ...result[0], items: items, negotiations: negotiations, parameterValues: paramValues });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/:id/messages', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT * FROM Messages WHERE RequestID = ? ORDER BY Timestamp ASC', [req.params.id]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/:id/messages', async (req, res) => {
    try {
        const { Sender, MessageText, AttachmentData } = req.body;
        if (!Sender || (!MessageText && !AttachmentData)) return res.status(400).json({ error: 'Sender and either MessageText or AttachmentData are required' });

        const db = await getPool();
        const runRes = await db.run(`INSERT INTO Messages (RequestID, Sender, MessageText, AttachmentData) VALUES (?, ?, ?, ?)`,
            [req.params.id, Sender, MessageText || '', AttachmentData || null]);

        const newMsg = await db.get(`SELECT * FROM Messages WHERE MessageID = ?`, [runRes.lastID]);
        if (Sender === 'Client') await createNotification('Pesan Baru', `Klien mengirim pesan pada permintaan #${req.params.id}`, 'Message', req.params.id);

        res.status(201).json(newMsg);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/messages/:id', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('DELETE FROM Messages WHERE MessageID = ?', [req.params.id]);
        res.json({ message: 'Message deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests', async (req, res) => {
    try {
        const { CompanyName, PICName, PICPhone, PICEmail, ServiceID, ProjectLocation, ProjectValue, DurationMonths, GuestName, GuestPhone, PaymentTerms, AdditionalNotes, Specification, WorkMethod, items } = req.body;
        const db = await getPool();
        await db.run('BEGIN TRANSACTION');

        try {
            let customerID = null;
            if (CompanyName) {
                const custResult = await db.run('INSERT INTO Customers (CompanyName, PICName, PICPhone, PICEmail) VALUES (?, ?, ?, ?)',
                    [CompanyName, PICName || GuestName || '', PICPhone || GuestPhone || '', PICEmail || '']);
                customerID = custResult.lastID;
            }

            const headerResult = await db.run(`
                    INSERT INTO TransactionHeader 
                    (CustomerID, ServiceID, ProjectLocation, ProjectValue, DurationMonths, GuestName, GuestPhone, PaymentTerms, AdditionalNotes, Specification, WorkMethod, Status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New Request')
                `,
                [customerID, ServiceID || null, ProjectLocation || '', ProjectValue || 0, DurationMonths || 0, GuestName || PICName || '', GuestPhone || PICPhone || '', PaymentTerms || 1, AdditionalNotes || '', Specification || '', WorkMethod || '']
            );

            const requestID = headerResult.lastID;
            const fullHeaderRow = await db.get('SELECT TicketNumber FROM TransactionHeader WHERE RequestID = ?', [requestID]);

            if (items && Array.isArray(items)) {
                for (const item of items) {
                    await db.run(`
                            INSERT INTO TransactionDetail (RequestID, ServiceType, Location, Specification, WorkMethod, CustomDescription, EstimatedPrice)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `,
                        [requestID, item.ServiceType || '', item.Location || '', item.Specification || '', item.WorkMethod || '', item.CustomDescription || '', item.EstimatedPrice || 0]
                    );
                }
            }

            await db.run('COMMIT');
            await createNotification('Permintaan Baru', `Request baru dibuat oleh ${CompanyName || GuestName}`, 'New Request', requestID);
            res.status(201).json({ RequestID: requestID, TicketNumber: fullHeaderRow?.TicketNumber, message: 'Permintaan berhasil dikirim!' });
        } catch (innerErr) {
            await db.run('ROLLBACK');
            throw innerErr;
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/requests/:id', async (req, res) => {
    try {
        const { Status, PaymentTerms, AdditionalNotes, SubTotal, AdjustmentAmount, TaxRate, TaxAmount, GrandTotal, AssignedAdminID } = req.body;
        const db = await getPool();

        let setClauses = [];
        let params = [];

        if (Status !== undefined) { setClauses.push('Status = ?'); params.push(Status); }
        if (PaymentTerms !== undefined) { setClauses.push('PaymentTerms = ?'); params.push(PaymentTerms); }
        if (AdditionalNotes !== undefined) { setClauses.push('AdditionalNotes = ?'); params.push(AdditionalNotes); }
        if (SubTotal !== undefined) { setClauses.push('SubTotal = ?'); params.push(SubTotal); }
        if (AdjustmentAmount !== undefined) { setClauses.push('AdjustmentAmount = ?'); params.push(AdjustmentAmount); }
        if (TaxRate !== undefined) { setClauses.push('TaxRate = ?'); params.push(TaxRate); }
        if (TaxAmount !== undefined) { setClauses.push('TaxAmount = ?'); params.push(TaxAmount); }
        if (GrandTotal !== undefined) { setClauses.push('GrandTotal = ?'); params.push(GrandTotal); }
        if (AssignedAdminID !== undefined) { setClauses.push('AssignedAdminID = ?'); params.push(AssignedAdminID); }

        setClauses.push("LastUpdated = CURRENT_TIMESTAMP");
        if (setClauses.length <= 1) return res.status(400).json({ error: 'No fields to update' });

        params.push(req.params.id);
        await db.run(`UPDATE TransactionHeader SET ${setClauses.join(', ')} WHERE RequestID = ?`, params);

        if (Status !== undefined) await createNotification('Status Diperbarui', `Status request #${req.params.id} berubah menjadi ${Status}`, 'Status Update', req.params.id);

        res.json({ message: 'Request updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/requests/:id', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('DELETE FROM TransactionDetail WHERE RequestID = ?', [req.params.id]);
        await db.run('DELETE FROM TransactionHeader WHERE RequestID = ?', [req.params.id]);
        res.json({ message: 'Request deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/:id/items', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT * FROM TransactionDetail WHERE RequestID = ?', [req.params.id]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/:id/items', async (req, res) => {
    try {
        const { ServiceType, Location, Specification, WorkMethod, CustomDescription, EstimatedPrice } = req.body;
        const db = await getPool();
        const result = await db.run(`INSERT INTO TransactionDetail (RequestID, ServiceType, Location, Specification, WorkMethod, CustomDescription, EstimatedPrice) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.params.id, ServiceType || '', Location || '', Specification || '', WorkMethod || '', CustomDescription || '', EstimatedPrice || 0]);
        res.status(201).json({ DetailID: result.lastID, message: 'Item added' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/requests/:id/items/:itemId', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('DELETE FROM TransactionDetail WHERE DetailID = ? AND RequestID = ?', [req.params.itemId, req.params.id]);
        res.json({ message: 'Item deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const db = await getPool();
        const total = await db.get('SELECT COUNT(*) AS cnt FROM TransactionHeader');
        const process = await db.get("SELECT COUNT(*) AS cnt FROM TransactionHeader WHERE Status IN ('New Request','Reviewing','Negotiation')");
        const deal = await db.get("SELECT COUNT(*) AS cnt FROM TransactionHeader WHERE Status = 'Deal'");
        const rejected = await db.get("SELECT COUNT(*) AS cnt FROM TransactionHeader WHERE Status = 'Rejected'");

        res.json({ totalRequests: total.cnt, inProcess: process.cnt, deal: deal.cnt, rejected: rejected.cnt });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/portfolios', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT * FROM MasterPortfolios'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/portfolios', async (req, res) => {
    try {
        const { PortfolioName } = req.body;
        if (!PortfolioName) return res.status(400).json({ error: 'PortfolioName is required' });
        const db = await getPool();
        const result = await db.run('INSERT INTO MasterPortfolios (PortfolioName) VALUES (?)', [PortfolioName]);
        res.status(201).json({ PortfolioID: result.lastID, PortfolioName });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/portfolios/:id', async (req, res) => {
    try {
        const { PortfolioName } = req.body;
        if (!PortfolioName) return res.status(400).json({ error: 'PortfolioName is required' });
        const db = await getPool();
        await db.run('UPDATE MasterPortfolios SET PortfolioName = ? WHERE PortfolioID = ?', [PortfolioName, req.params.id]);
        res.json({ PortfolioID: parseInt(req.params.id), PortfolioName });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/portfolios/:id', async (req, res) => {
    try {
        const db = await getPool();
        const id = req.params.id;
        // Cascade delete related data
        const cats = await db.all('SELECT CategoryID FROM MasterCategories WHERE PortfolioID = ?', [id]);
        for (const cat of cats) {
            const subs = await db.all('SELECT SubCategoryID FROM MasterSubCategories WHERE CategoryID = ?', [cat.CategoryID]);
            for (const sub of subs) {
                await db.run('DELETE FROM PricingParameters WHERE ServiceID IN (SELECT ServiceID FROM ServiceCatalog WHERE SubCategoryID = ?)', [sub.SubCategoryID]);
                await db.run('DELETE FROM ServiceActivities WHERE ServiceID IN (SELECT ServiceID FROM ServiceCatalog WHERE SubCategoryID = ?)', [sub.SubCategoryID]);
                await db.run('DELETE FROM ServiceCatalog WHERE SubCategoryID = ?', [sub.SubCategoryID]);
            }
            await db.run('DELETE FROM MasterSubCategories WHERE CategoryID = ?', [cat.CategoryID]);
        }
        await db.run('DELETE FROM MasterCategories WHERE PortfolioID = ?', [id]);
        await db.run('UPDATE AppUsers SET PortfolioID = NULL WHERE PortfolioID = ?', [id]);
        await db.run('DELETE FROM MasterPortfolios WHERE PortfolioID = ?', [id]);
        res.json({ message: 'Portfolio and related data deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all(`
            SELECT u.UserID, u.Username, u.Email, u.PhoneWA, u.FullName, u.Role, u.PortfolioID, u.CustomerID, mp.PortfolioName
            FROM AppUsers u LEFT JOIN MasterPortfolios mp ON u.PortfolioID = mp.PortfolioID ORDER BY u.UserID
        `));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const { Username, PasswordHash, FullName, Role, PortfolioID, Email, PhoneWA } = req.body;
        const db = await getPool();
        const result = await db.run(`INSERT INTO AppUsers (Username, PasswordHash, FullName, Role, PortfolioID, Email, PhoneWA) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [Username, PasswordHash, FullName, Role || 'AdminDBS', PortfolioID || null, Email || null, PhoneWA || null]);
        res.status(201).json({ UserID: result.lastID, message: 'User created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('DELETE FROM AppUsers WHERE UserID = ?', [req.params.id]);
        res.json({ message: 'User deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/categories', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all(`
            SELECT mc.CategoryID, mc.CategoryName, mp.PortfolioName
            FROM MasterCategories mc LEFT JOIN MasterPortfolios mp ON mc.PortfolioID = mp.PortfolioID
        `));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/branches', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT BranchID, BranchName, Address, Phone, Fax FROM Branches ORDER BY BranchName'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/branches/stats', async (req, res) => {
    try {
        const db = await getPool();
        const branches = await db.all('SELECT BranchID, BranchName FROM Branches ORDER BY BranchName');
        res.json(branches.map(b => ({ BranchID: b.BranchID, BranchName: b.BranchName, Performance: Math.max(40, Math.min(98, 70 + Math.floor(Math.random() * 30))) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/branches', async (req, res) => {
    try {
        const { BranchName, Address, Phone, Fax } = req.body;
        const db = await getPool();
        const result = await db.run('INSERT INTO Branches (BranchName, Address, Phone, Fax) VALUES (?, ?, ?, ?)', [BranchName, Address || '', Phone || '', Fax || '']);
        res.json(await db.get('SELECT * FROM Branches WHERE BranchID = ?', [result.lastID]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/branches/:id', async (req, res) => {
    try {
        const { BranchName, Address, Phone, Fax } = req.body;
        const db = await getPool();
        await db.run('UPDATE Branches SET BranchName=?, Address=?, Phone=?, Fax=? WHERE BranchID=?', [BranchName, Address || '', Phone || '', Fax || '', req.params.id]);
        res.json({ message: 'Branch updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/branches/:id', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('DELETE FROM Branches WHERE BranchID=?', [req.params.id]);
        res.json({ message: 'Branch deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/services/:id/parameters', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT ParamID, ParameterName, UnitPrice FROM PricingParameters WHERE ServiceID = ?', [req.params.id]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/services/:id/parameters', async (req, res) => {
    try {
        const { ParameterName, UnitPrice } = req.body;
        const db = await getPool();
        const result = await db.run('INSERT INTO PricingParameters (ServiceID, ParameterName, UnitPrice) VALUES (?, ?, ?)', [req.params.id, ParameterName, UnitPrice || 0]);
        res.status(201).json({ ParamID: result.lastID, message: 'Parameter created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/services/:id/parameters/:paramId', async (req, res) => {
    try {
        const { ParameterName, UnitPrice } = req.body;
        const db = await getPool();
        let setClauses = [];
        let params = [];
        if (ParameterName !== undefined) { setClauses.push('ParameterName = ?'); params.push(ParameterName); }
        if (UnitPrice !== undefined) { setClauses.push('UnitPrice = ?'); params.push(UnitPrice); }
        if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });
        params.push(req.params.paramId, req.params.id);
        await db.run(`UPDATE PricingParameters SET ${setClauses.join(', ')} WHERE ParamID = ? AND ServiceID = ?`, params);
        res.json({ message: 'Parameter updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/services/:id/parameters/:paramId', async (req, res) => {
    try {
        const db = await getPool();
        await db.run('DELETE FROM TransactionParameterValues WHERE ParamID = ?', [req.params.paramId]);
        await db.run('DELETE FROM PricingParameters WHERE ParamID = ? AND ServiceID = ?', [req.params.paramId, req.params.id]);
        res.json({ message: 'Parameter deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/:id/items/:itemId/params', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all(`SELECT tpv.*, pp.ParameterName FROM TransactionParameterValues tpv LEFT JOIN PricingParameters pp ON tpv.ParamID = pp.ParamID WHERE tpv.DetailID = ?`, [req.params.itemId]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/:id/negotiations', async (req, res) => {
    try {
        const db = await getPool();
        res.json(await db.all('SELECT * FROM NegotiationHistory WHERE RequestID = ? ORDER BY Round ASC, CreatedAt ASC', [req.params.id]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/:id/negotiations', async (req, res) => {
    try {
        const { ProposedBy, ProposedTotal, ProposedPrice, Notes } = req.body;
        const proposedAmount = ProposedPrice || ProposedTotal || 0;
        const db = await getPool();

        const roundResult = await db.get('SELECT IFNULL(MAX(Round), 0) + 1 AS NextRound FROM NegotiationHistory WHERE RequestID = ?', [req.params.id]);
        const nextRound = roundResult.NextRound;

        const result = await db.run(`INSERT INTO NegotiationHistory (RequestID, Round, ProposedBy, ProposedTotal, Notes) VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, nextRound, ProposedBy || 'Admin', proposedAmount, Notes || '']);

        if (ProposedBy === 'Client') await createNotification('Negosiasi Klien', `Klien mengajukan penawaran harga pada request #${req.params.id}`, 'Negotiation', req.params.id);

        res.status(201).json({ NegotiationID: result.lastID, Round: nextRound, message: 'Negotiation recorded' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/requests/:id/status', async (req, res) => {
    try {
        const { Status, SubTotal, AdjustmentAmount, DiscountAmount, TaxRate, TaxAmount, GrandTotal } = req.body;
        if (!Status) return res.status(400).json({ error: 'Status is required' });
        const db = await getPool();

        let setClauses = ['Status = ?'];
        let params = [Status];
        if (SubTotal !== undefined) { setClauses.push('SubTotal = ?'); params.push(SubTotal); }
        if (AdjustmentAmount !== undefined) { setClauses.push('AdjustmentAmount = ?'); params.push(AdjustmentAmount); }
        if (DiscountAmount !== undefined) { setClauses.push('DiscountAmount = ?'); params.push(DiscountAmount); }
        if (TaxRate !== undefined) { setClauses.push('TaxRate = ?'); params.push(TaxRate); }
        if (TaxAmount !== undefined) { setClauses.push('TaxAmount = ?'); params.push(TaxAmount); }
        if (GrandTotal !== undefined) { setClauses.push('GrandTotal = ?'); params.push(GrandTotal); }
        setClauses.push("LastUpdated = CURRENT_TIMESTAMP");
        params.push(req.params.id);

        await db.run(`UPDATE TransactionHeader SET ${setClauses.join(', ')} WHERE RequestID = ?`, params);
        await createNotification('Status Update', `Status permintaan #${req.params.id} diubah menjadi ${Status}`, 'Status Update', req.params.id);

        res.json({ message: 'Status updated to ' + Status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, async () => {
    console.log('--------------------------------------------------');
    console.log(`🚀 Server SI - ONE running at http://localhost:${port}`);
    console.log('⏳ Connecting to SQLite Database...');
    console.log('--------------------------------------------------');
    try {
        await getPool();
        console.log('✅ DATABASE CONNECTED! (SQLite Ready)');
        console.log('📋 API Endpoints ready for requests. Server migrated to SQLite!');
    } catch (err) { console.error('❌ DATABASE CONNECTION FAILED:', err.message); }
});