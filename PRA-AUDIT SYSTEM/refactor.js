const fs = require('fs');

let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// Normalize line endings to \n for consistent replacement
code = code.replace(/\r\n/g, '\n');

// 1. Add axios import
if (!code.includes("import axios")) {
  code = code.replace("import React,", "import axios from 'axios';\nimport React,");
}

// 2. Replace useState initializations
code = code.replace("const [audits, setAudits] = useState(MOCK_AUDITS);", `const [audits, setAudits] = useState([]);`);
code = code.replace("const [locations, setLocations] = useState(MOCK_LOCATIONS);", `const [locations, setLocations] = useState([]);`);
code = code.replace("const [docs, setDocs] = useState(MOCK_DOCS);", `const [docs, setDocs] = useState([]);`);
code = code.replace("const [records, setRecords] = useState(generateInitialRecords());", `const [records, setRecords] = useState([]);`);
code = code.replace("const [users, setUsers] = useState(MOCK_USERS);", `const [users, setUsers] = useState([]);`);

// 3. Add useEffect hooks for data fetching
const hookInjection = `
  const API_URL = 'http://localhost:5000/api';

  useEffect(() => {
    axios.get(\`\${API_URL}/init-data\`).then(res => {
      setAudits(res.data.audits);
      setLocations(res.data.locations);
      setDocs(res.data.docs);
      setUsers(res.data.users);
    });
  }, []);

  useEffect(() => {
    axios.get(\`\${API_URL}/records?year=\${selectedYear}\`).then(res => {
      setRecords(res.data.records);
    });
  }, [selectedYear]);
`;
code = code.replace("const [users, setUsers] = useState([]);", `const [users, setUsers] = useState([]);\n${hookInjection}`);

// 4. Fix LoginScreen handleLogin to use API
code = code.replace(
  `  const handleLogin = (e) => {\n    e.preventDefault();\n    const user = users.find(u => u.username === username && u.password === password);\n    if (user) {\n      onLogin(user);\n    } else {\n      setError('Username atau password salah!');\n    }\n  };`,
  `  const handleLogin = async (e) => {\n    e.preventDefault();\n    try {\n      const res = await axios.post('http://localhost:5000/api/login', { username, password });\n      if (res.data.success) {\n        onLogin(res.data.user);\n      } else {\n        setError(res.data.message || 'Username atau password salah!');\n      }\n    } catch (err) {\n      setError('Terjadi kesalahan koneksi ke server.');\n    }\n  };`
);

// 5. Make handleSaveModalData async
code = code.replace(`const handleSaveModalData = () => {`, `const handleSaveModalData = async () => {`);

// 6. Add API calls to handleSaveModalData operations
code = code.replace(
  `setLocations(prev => prev.map(loc => loc.id === formData.id ? { ...loc, name: formData.name, pic: formData.pic } : loc));`,
  `await axios.put(\`http://localhost:5000/api/locations/\${formData.id}\`, { name: formData.name, pic: formData.pic });\n      setLocations(prev => prev.map(loc => loc.id === formData.id ? { ...loc, name: formData.name, pic: formData.pic } : loc));`
);

code = code.replace(
  `setDocs(prev => prev.map(d => d.id === formData.id ? { ...d, name: formData.name } : d));`,
  `await axios.put(\`http://localhost:5000/api/documents/\${formData.id}\`, { name: formData.name });\n      setDocs(prev => prev.map(d => d.id === formData.id ? { ...d, name: formData.name } : d));`
);

code = code.replace(
  `const newUser = {`,
  `const res = await axios.post('http://localhost:5000/api/users', { name: formData.name, username: formData.username, password: formData.password, role: formData.role, location_id: assignedLocId });\n      const newUser = { id: res.data.id,`
);

code = code.replace(
  `const newAudit = { id: \`A\${audits.length + 1}\`, name: formData.name };`,
  `const newAudit = { id: \`A\${audits.length + 1}\`, name: formData.name };\n      await axios.post('http://localhost:5000/api/audits', { id: newAudit.id, name: formData.name });`
);

code = code.replace(
  `const newLoc = { id: locations.length + 1, name: formData.name, pic: formData.pic || 'Belum Ditentukan' };`,
  `const res = await axios.post('http://localhost:5000/api/locations', { name: formData.name, pic: formData.pic });\n      const newLoc = { id: res.data.id, name: formData.name, pic: formData.pic || 'Belum Ditentukan' };`
);

code = code.replace(
  `const newDoc = { id: \`D\${String(docs.length + 1).padStart(2, '0')}\`, name: formData.name };`,
  `const newDoc = { id: \`D\${String(docs.length + 1).padStart(2, '0')}\`, name: formData.name };\n      await axios.post('http://localhost:5000/api/documents', { id: newDoc.id, name: formData.name });`
);

// 7. Update handleUpdateRecord
code = code.replace(
  `const handleUpdateRecord = (updatedRecord) => {`,
  `const handleUpdateRecord = async (updatedRecord) => {\n    try {\n      await axios.post('http://localhost:5000/api/records', updatedRecord);\n    } catch (err) {\n      showToast("Gagal menyimpan ke server", "warning");\n    }`
);

// 8. Fix delete modals with async
code = code.replace(
  `onClick={() => {\n                    if (deleteTarget) {\n                      setAudits(prev => prev.filter(a => a.id !== deleteTarget.id));`,
  `onClick={async () => {\n                    if (deleteTarget) {\n                      await axios.delete(\`http://localhost:5000/api/audits/\${deleteTarget.id}\`);\n                      setAudits(prev => prev.filter(a => a.id !== deleteTarget.id));`
);

code = code.replace(
  `onClick={() => {\n                    if (deleteTarget) {\n                      setLocations(prev => prev.filter(l => l.id !== deleteTarget.id));`,
  `onClick={async () => {\n                    if (deleteTarget) {\n                      await axios.delete(\`http://localhost:5000/api/locations/\${deleteTarget.id}\`);\n                      setLocations(prev => prev.filter(l => l.id !== deleteTarget.id));`
);

code = code.replace(
  `onClick={() => {\n                    if (deleteTarget) {\n                      setDocs(prev => prev.filter(d => d.id !== deleteTarget.id));`,
  `onClick={async () => {\n                    if (deleteTarget) {\n                      await axios.delete(\`http://localhost:5000/api/documents/\${deleteTarget.id}\`);\n                      setDocs(prev => prev.filter(d => d.id !== deleteTarget.id));`
);

fs.writeFileSync('frontend/src/App.jsx', code, 'utf8');
console.log('Refactoring complete!');

// Verify login was replaced
const verify = fs.readFileSync('frontend/src/App.jsx', 'utf8');
if (verify.includes("axios.post('http://localhost:5000/api/login'")) {
  console.log('LOGIN FIX VERIFIED: handleLogin now uses API!');
} else {
  console.log('WARNING: handleLogin replacement may not have worked!');
}
