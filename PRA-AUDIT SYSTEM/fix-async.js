const fs = require('fs');

let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// Fix async in delete audits
code = code.replace(
  /onClick=\{\(\) => \{\n\s*if \(deleteTarget\) \{\n\s*await axios\.delete/g,
  'onClick={async () => {\n                    if (deleteTarget) {\n                      await axios.delete'
);

fs.writeFileSync('frontend/src/App.jsx', code, 'utf8');
console.log('Async fixed!');
