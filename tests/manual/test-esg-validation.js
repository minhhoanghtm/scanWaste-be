const assert = require('node:assert/strict');

const controller = require('../../src/modules/statistics/esg-report.controller');

async function callController(method, query) {
    const response = {
        statusCode: null,
        body: null,

        status(code) {
            this.statusCode = code;
            return this;
        },

        json(data) {
            this.body = data;
            return this;
        }
    };

    let nextError = null;

    await controller[method](
        { query },
        response,
        error => {
            nextError = error;
        }
    );

    if (nextError) throw nextError;

    return response;
}

async function testCase(name, method, query, expectedCode) {
    const response = await callController(method, query);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, expectedCode);

    console.log(`[PASS] ${name}`);
}

async function main() {
    console.log('===== UC014 VALIDATION TEST =====\n');

    await testCase(
        'Missing date parameters',
        'getAdminReport',
        {},
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Missing end date',
        'getAdminReport',
        { from: '2026-10-01' },
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Wrong date format',
        'getAdminReport',
        { from: '01-10-2026', to: '2026-10-31' },
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Invalid calendar date',
        'getAdminReport',
        { from: '2026-02-30', to: '2026-03-01' },
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Start date later than end date',
        'getAdminReport',
        { from: '2026-11-02', to: '2026-10-01' },
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Export with missing dates',
        'exportAdminReport',
        { from: '2026-10-01' },
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Export with invalid calendar date',
        'exportAdminReport',
        { from: '2026-02-30', to: '2026-03-01' },
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Export with reversed date range',
        'exportAdminReport',
        { from: '2026-11-02', to: '2026-10-01' },
        'INVALID_DATE_RANGE'
    );

    await testCase(
        'Unsupported export format',
        'exportAdminReport',
        {
            from: '2026-10-01',
            to: '2026-10-31',
            format: 'pdf'
        },
        'UNSUPPORTED_EXPORT_FORMAT'
    );

    console.log('\nAll 9 validation tests passed.');
}

main().catch(error => {
    console.error('\nVALIDATION TEST FAILED');
    console.error(error);
    process.exitCode = 1;
});