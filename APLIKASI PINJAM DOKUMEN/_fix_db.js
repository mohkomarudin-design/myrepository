const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');
const replacement = fs.readFileSync('_replacement.txt', 'utf8');

// Find renderDatabase function start
const startMarker = 'function renderDatabase() {';
const startIdx = c.indexOf(startMarker);
if (startIdx === -1) { console.log('ERROR: renderDatabase not found'); process.exit(1); }

// Find downloadDokumen function and its end
const downloadFunc = 'function downloadDokumen(noDoc)';
const downloadIdx = c.indexOf(downloadFunc, startIdx);
if (downloadIdx === -1) { console.log('ERROR: downloadDokumen not found'); process.exit(1); }

// Find end of downloadDokumen function (matching braces)
let braceCount = 0, foundStart = false, endPos = downloadIdx;
for (let i = downloadIdx; i < c.length; i++) {
    if (c[i] === '{') { braceCount++; foundStart = true; }
    if (c[i] === '}') { braceCount--; }
    if (foundStart && braceCount === 0) { endPos = i + 1; break; }
}

// Check if uploadDokumen follows
const remaining = c.substring(endPos, endPos + 300);
const uploadMatch = remaining.match(/\s*(async\s+)?function\s+uploadDokumen/);
if (uploadMatch) {
    const uploadStart = c.indexOf('function uploadDokumen', endPos);
    if (uploadStart === -1) {
        const asyncUploadStart = c.indexOf('async function uploadDokumen', endPos);
        if (asyncUploadStart !== -1 && asyncUploadStart < endPos + 300) {
            braceCount = 0; foundStart = false;
            for (let i = asyncUploadStart; i < c.length; i++) {
                if (c[i] === '{') { braceCount++; foundStart = true; }
                if (c[i] === '}') { braceCount--; }
                if (foundStart && braceCount === 0) { endPos = i + 1; break; }
            }
        }
    } else if (uploadStart < endPos + 300) {
        braceCount = 0; foundStart = false;
        for (let i = uploadStart; i < c.length; i++) {
            if (c[i] === '{') { braceCount++; foundStart = true; }
            if (c[i] === '}') { braceCount--; }
            if (foundStart && braceCount === 0) { endPos = i + 1; break; }
        }
    }
}

console.log('Replacing chars', startIdx, '-', endPos, '(', endPos - startIdx, 'chars)');
c = c.substring(0, startIdx) + replacement + c.substring(endPos);
fs.writeFileSync('index.html', c);
console.log('SUCCESS!');
