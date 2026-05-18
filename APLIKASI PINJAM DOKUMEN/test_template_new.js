const http = require('http');
const fs = require('fs');
const ExcelJS = require('exceljs');

const file = fs.createWriteStream("test_template_new.xlsx");
http.get("http://localhost:3000/api/dokumen/template", function(response) {
  response.pipe(file);
  file.on("finish", async () => {
      file.close();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile('test_template_new.xlsx');
      const worksheet = workbook.getWorksheet(1);
      const row1 = worksheet.getRow(1).values;
      console.log("Headers:", row1);
  });
});
