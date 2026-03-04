fetch('http://localhost:3001/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        nama_proyek: "Verification Proyek",
        checklist: [
            {
                sectionTitle: 'TEMPAT KERJA KANTOR PROYEK',
                itemTitle: 'Adanya Rambu-rambu K3',
                status: 'ada',
                catatan: 'Catatan ujian sangat panjang sekali agar text row height computation teruji pada library pdfkit.',
                photos: []
            }
        ]
    })
}).then(res => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    console.log("SUCCESS");
    process.exit(0);
}).catch(err => {
    console.error("FAIL", err);
    process.exit(1);
});
