require('dotenv').config();

const mongoose = require('mongoose');
const reportService = require('../../src/modules/statistics/esg-report.service');

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function main() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI NOT FOUND');
        }

        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000
        });

        console.log('MongoDB: CONNECTED');

        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 29);

        const report = await reportService.getAdminReport({
            from: formatDate(from),
            to: formatDate(to)
        });

        console.log('\n===== UC014 ESG REPORT =====');
        console.log(JSON.stringify({
            period: report.period,
            hasData: report.hasData,
            summary: report.summary,
            dailyScans: report.dailyScans,
            metricsAvailability: report.metricsAvailability
        }, null, 2));

        console.log('\nUC014 SERVICE: TEST COMPLETED');
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
}

main().catch(error => {
    console.error('\nUC014 SERVICE: TEST FAILED');
    console.error(error.name);
    console.error(error.message);
    process.exitCode = 1;
});