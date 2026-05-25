const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// API: Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (rows.length > 0) {
      res.json({ success: true, user: rows[0] });
    } else {
      res.json({ success: false, message: 'Username atau password salah!' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get Init Data (Audits, Locations, Docs, Users)
app.get('/api/init-data', async (req, res) => {
  try {
    const [audits] = await db.query('SELECT * FROM audit_programs');
    const [locations] = await db.query('SELECT * FROM locations');
    const [docs] = await db.query('SELECT * FROM documents_master');
    const [users] = await db.query('SELECT id, username, role, location_id, name FROM users');
    res.json({ audits, locations, docs, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get Records
app.get('/api/records', async (req, res) => {
  const { year } = req.query;
  try {
    const [records] = await db.query('SELECT * FROM audit_records WHERE year = ?', [year || 2026]);
    const [files] = await db.query('SELECT * FROM files');
    
    // Attach files to records
    const recordsWithFiles = records.map(r => {
      r.files = files.filter(f => f.record_id === r.id);
      return r;
    });
    
    res.json({ records: recordsWithFiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update Record
app.post('/api/records', async (req, res) => {
  const { id, audit_id, location_id, document_id, year, status, notes, files } = req.body;
  try {
    // Check if record exists
    const [existing] = await db.query('SELECT id FROM audit_records WHERE id = ?', [id]);
    const updatedAt = new Date();
    
    if (existing.length > 0) {
      await db.query('UPDATE audit_records SET status = ?, notes = ?, updated_at = ? WHERE id = ?', [status, notes, updatedAt, id]);
    } else {
      await db.query('INSERT INTO audit_records (id, audit_id, location_id, document_id, year, status, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [id, audit_id, location_id, document_id, year, status, notes, updatedAt]);
    }
    
    // Update files (simplified: delete all and re-insert)
    await db.query('DELETE FROM files WHERE record_id = ?', [id]);
    if (files && files.length > 0) {
      const fileValues = files.map(f => [f.id, id, f.name, f.isRevised ? 1 : 0]);
      await db.query('INSERT INTO files (id, record_id, name, isRevised) VALUES ?', [fileValues]);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add Location
app.post('/api/locations', async (req, res) => {
  const { name, pic } = req.body;
  try {
    const [result] = await db.query('INSERT INTO locations (name, pic) VALUES (?, ?)', [name, pic || 'Belum Ditentukan']);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Edit Location
app.put('/api/locations/:id', async (req, res) => {
  const { name, pic } = req.body;
  try {
    await db.query('UPDATE locations SET name = ?, pic = ? WHERE id = ?', [name, pic, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete Location
app.delete('/api/locations/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM locations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add Document
app.post('/api/documents', async (req, res) => {
  const { id, name } = req.body;
  try {
    await db.query('INSERT INTO documents_master (id, name) VALUES (?, ?)', [id, name]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Edit Document
app.put('/api/documents/:id', async (req, res) => {
  const { name } = req.body;
  try {
    await db.query('UPDATE documents_master SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete Document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM documents_master WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add Audit Program
app.post('/api/audits', async (req, res) => {
  const { id, name } = req.body;
  try {
    await db.query('INSERT INTO audit_programs (id, name) VALUES (?, ?)', [id, name]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete Audit Program
app.delete('/api/audits/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM audit_programs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add User
app.post('/api/users', async (req, res) => {
  const { username, password, role, location_id, name } = req.body;
  try {
    const [result] = await db.query('INSERT INTO users (username, password, role, location_id, name) VALUES (?, ?, ?, ?, ?)', 
      [username, password, role, location_id || null, name]);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
