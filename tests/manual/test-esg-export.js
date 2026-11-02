require('dotenv').config();

const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const fs = require('fs');
const os = require('os');
const path = require('path');

const controller = require('../../src/modules/statistics/esg-report.controller');

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000
        });

        console.log('MongoDB: CONNECTED');

        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 29);

        const fromDate = formatDate(from);
        const toDate = formatDate(to);

        const response = {
            statusCode: 200,
            headers: {},
            body: null,

            status(code) {
                this.statusCode = code;
                return this;
            },

            setHeader(name, value) {
                this.headers[name] = value;
            },

            send(data) {
                this.body = data;
                return this;
            },

            json(data) {
                this.body = data;
                return this;
            }
        };

        let nextError = null;

        await controller.exportAdminReport(
            {
                query: {
                    from: fromDate,
                    to: toDate,
                    format: 'xlsx'
                }
            },
            response,
            error => {
                nextError = error;
            }
        );

        if (nextError) throw nextError;

        if (response.statusCode !== 200) {
            console.log('HTTP STATUS:', response.statusCode);
            console.log('Response:', response.body);
            throw new Error('Excel export failed');
        }

        if (!Buffer.isBuffer(response.body)) {
            throw new Error('Response is not an Excel buffer');
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(response.body);

        console.log('\n===== EXCEL EXPORT RESULT =====');
        console.log('Status:', response.statusCode);
        console.log('File size:', response.body.length, 'bytes');
        console.log('Sheets:', workbook.worksheets.map(sheet => sheet.name));

        const filename =
            `ecosort-esg-report-${fromDate}-to-${toDate}.xlsx`;

        const outputPath = path.join(os.tmpdir(), filename);

        fs.writeFileSync(outputPath, response.body);

        console.log('\nEXCEL EXPORT: SUCCESS');
        console.log('File saved:', outputPath);
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
}

main().catch(error => {
    console.error('\nEXCEL EXPORT: FAILED');
    console.error(error.name);
    console.error(error.message);
    process.exitCode = 1;
});