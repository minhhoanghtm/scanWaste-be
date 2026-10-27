const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { connectDB } = require('../../src/config/database');

// Colors for test output
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

let server;
let baseUrl;
let passedCount = 0;
let failedCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`  ${green('✔')} ${message}`);
    passedCount++;
  } else {
    console.error(`  ${red('✖')} ${message}`);
    failedCount++;
  }
};

const runTests = async () => {
  console.log(cyan('\n============================================='));
  console.log(cyan('🧪 RUNNING SCANWASTE BACKEND INTEGRATION TESTS'));
  console.log(cyan('=============================================\n'));

  // Connect database and start test server on dynamic or configured port
  await connectDB();
  const testPort = 5001;
  server = app.listen(testPort);
  baseUrl = `http://127.0.0.1:${testPort}`;

  const uniqueId = Date.now();
  const testEmail = `tester_${uniqueId}@example.com`;
  const testPhone = `091${String(uniqueId).slice(-7)}`;
  const testPassword = 'Password123!';
  let authToken = '';
  let classificationId = '';

  try {
    // ----------------------------------------------------
    // 1. Health API Test
    // ----------------------------------------------------
    console.log(yellow('\n[1] Testing GET /api/health'));
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, `Health status code is 200 (got ${healthRes.status})`);
    assert(healthData.success === true, 'Health response success is true');
    assert(healthData.data.database === 'connected', 'Database status is connected');

    // ----------------------------------------------------
    // 2. Auth Register Test
    // ----------------------------------------------------
    console.log(yellow('\n[2] Testing POST /api/auth/register'));
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Nguyen Van Test',
        email: testEmail,
        phone: testPhone,
        password: testPassword,
      }),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201, `Register status code is 201 (got ${regRes.status})`);
    assert(regData.success === true, 'Register success is true');
    assert(!!regData.data.token, 'JWT Token is generated');
    assert(regData.data.user.email === testEmail, 'User email matches registered email');
    assert(regData.data.user.phone === `+84${testPhone.slice(1)}`, 'User phone is normalized to +84');
    assert(regData.data.user.password === undefined, 'Password is NOT exposed in response');

    // ----------------------------------------------------
    // 3. Auth Register Duplicate Email Test
    // ----------------------------------------------------
    console.log(yellow('\n[3] Testing POST /api/auth/register (Duplicate Email -> 409)'));
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate User',
        email: testEmail,
        phone: `098${String(uniqueId).slice(-7)}`,
        password: testPassword,
      }),
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 409, `Duplicate register status code is 409 (got ${dupRes.status})`);
    assert(dupData.success === false, 'Duplicate register success is false');

    // ----------------------------------------------------
    // 4. Auth Login Test
    // ----------------------------------------------------
    console.log(yellow('\n[4] Testing POST /api/auth/login'));
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testEmail,
        password: testPassword,
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, `Login status code is 200 (got ${loginRes.status})`);
    assert(loginData.success === true, 'Login success is true');
    assert(!!loginData.data.token, 'Login returned valid JWT token');
    authToken = loginData.data.token;

    // ----------------------------------------------------
    // 5. Auth Login With Phone Test
    // ----------------------------------------------------
    console.log(yellow('\n[5] Testing POST /api/auth/login (Phone Number)'));
    const phoneLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testPhone,
        password: testPassword,
      }),
    });
    const phoneLoginData = await phoneLoginRes.json();
    assert(phoneLoginRes.status === 200, `Phone login status code is 200 (got ${phoneLoginRes.status})`);
    assert(phoneLoginData.success === true, 'Phone login success is true');

    // ----------------------------------------------------
    // 6. Auth Login Invalid Password Test
    // ----------------------------------------------------
    console.log(yellow('\n[6] Testing POST /api/auth/login (Invalid Password -> 401)'));
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testEmail,
        password: 'wrong_password',
      }),
    });
    assert(badLoginRes.status === 401, `Invalid login status code is 401 (got ${badLoginRes.status})`);

    // ----------------------------------------------------
    // 6. User Profile Test (Authorized)
    // ----------------------------------------------------
    console.log(yellow('\n[6] Testing GET /api/users/me (With Bearer Token)'));
    const profileRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const profileData = await profileRes.json();
    assert(profileRes.status === 200, `Profile status code is 200 (got ${profileRes.status})`);
    assert(profileData.data.email === testEmail, 'Profile contains correct user email');
    assert(profileData.data.password === undefined, 'Profile does NOT expose password');

    // ----------------------------------------------------
    // 7. User Profile Test (Unauthorized)
    // ----------------------------------------------------
    console.log(yellow('\n[7] Testing GET /api/users/me (Without Token -> 401)'));
    const unauthProfileRes = await fetch(`${baseUrl}/api/users/me`);
    assert(unauthProfileRes.status === 401, `Unauthenticated profile status is 401 (got ${unauthProfileRes.status})`);

    // ----------------------------------------------------
    // 8. Classification Upload & Prediction Test
    // ----------------------------------------------------
    console.log(yellow('\n[8] Testing POST /api/classifications (Upload & Classify)'));
    // Create a 1x1 dummy JPEG image buffer
    const dummyJpgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
      0x00, 0xbf, 0x80, 0xff, 0xd9,
    ]);

    const formData = new FormData();
    const blob = new Blob([dummyJpgBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'plastic_bottle.jpg');

    const classifyRes = await fetch(`${baseUrl}/api/classifications`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: formData,
    });
    const classifyData = await classifyRes.json();
    assert(classifyRes.status === 201, `Classification status code is 201 (got ${classifyRes.status})`);
    assert(classifyData.success === true, 'Classification success is true');
    assert(classifyData.data.predictedClass === 'plastic', `Predicted class is plastic (got ${classifyData.data.predictedClass})`);
    assert(typeof classifyData.data.confidence === 'number', 'Confidence is a valid number');
    assert(!!classifyData.data.imageUrl, 'Image URL path is returned');
    assert(!!classifyData.data.id, 'Classification record ID is generated');
    classificationId = classifyData.data.id;

    // ----------------------------------------------------
    // 9. History List Test (Pagination)
    // ----------------------------------------------------
    console.log(yellow('\n[9] Testing GET /api/history?page=1&limit=10'));
    const historyRes = await fetch(`${baseUrl}/api/history?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const historyData = await historyRes.json();
    assert(historyRes.status === 200, `History status code is 200 (got ${historyRes.status})`);
    assert(Array.isArray(historyData.data.items), 'History items is an array');
    assert(historyData.data.items.length >= 1, 'History contains at least 1 item');
    assert(historyData.data.pagination.page === 1, 'Pagination page is 1');
    assert(historyData.data.pagination.totalCount >= 1, 'Pagination totalCount >= 1');

    // ----------------------------------------------------
    // 10. History Detail Test
    // ----------------------------------------------------
    console.log(yellow('\n[10] Testing GET /api/history/:id'));
    const detailRes = await fetch(`${baseUrl}/api/history/${classificationId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const detailData = await detailRes.json();
    assert(detailRes.status === 200, `History detail status is 200 (got ${detailRes.status})`);
    assert(detailData.data.id === classificationId, 'History detail matches ID');
    assert(detailData.data.predictedClass === 'plastic', 'Detail predicted class matches');

    // ----------------------------------------------------
    // 11. Statistics Test
    // ----------------------------------------------------
    console.log(yellow('\n[11] Testing GET /api/statistics'));
    const statsRes = await fetch(`${baseUrl}/api/statistics`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const statsData = await statsRes.json();
    assert(statsRes.status === 200, `Statistics status is 200 (got ${statsRes.status})`);
    assert(statsData.data.total >= 1, 'Statistics total count >= 1');
    assert(statsData.data.plastic >= 1, 'Statistics plastic count >= 1');
    assert(statsData.data.paper === 0, 'Statistics paper count is 0');
    assert(statsData.data.glass === 0, 'Statistics glass count is 0');
    assert(statsData.data.metal === 0, 'Statistics metal count is 0');
    assert(statsData.data.organic === 0, 'Statistics organic count is 0');
    assert(statsData.data.cardboard === 0, 'Statistics cardboard count is 0');
    assert(statsData.data.other === 0, 'Statistics other count is 0');

    // ----------------------------------------------------
    // 12. Invalid File Format Test (.txt -> 400)
    // ----------------------------------------------------
    console.log(yellow('\n[12] Testing Invalid File Format (.txt -> 400)'));
    const invalidFormData = new FormData();
    const txtBlob = new Blob(['sample text document'], { type: 'text/plain' });
    invalidFormData.append('image', txtBlob, 'document.txt');

    const invalidFileRes = await fetch(`${baseUrl}/api/classifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: invalidFormData,
    });
    assert(invalidFileRes.status === 400, `Invalid file format status is 400 (got ${invalidFileRes.status})`);

    // ----------------------------------------------------
    // 13. File Too Large Test (> 5MB -> 413)
    // ----------------------------------------------------
    console.log(yellow('\n[13] Testing File Size Exceeded (> 5MB -> 413)'));
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024); // 5.5MB
    const largeFormData = new FormData();
    const largeBlob = new Blob([largeBuffer], { type: 'image/jpeg' });
    largeFormData.append('image', largeBlob, 'large_image.jpg');

    const largeFileRes = await fetch(`${baseUrl}/api/classifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: largeFormData,
    });
    assert(largeFileRes.status === 413, `File too large status is 413 (got ${largeFileRes.status})`);

    // ----------------------------------------------------
    // 14. Route Not Found Test (404)
    // ----------------------------------------------------
    console.log(yellow('\n[14] Testing Route Not Found (404)'));
    const notFoundRes = await fetch(`${baseUrl}/api/non_existing_route`);
    assert(notFoundRes.status === 404, `Not found route status is 404 (got ${notFoundRes.status})`);

  } catch (err) {
    console.error(red('\n❌ Test execution exception:'), err);
    failedCount++;
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();

    console.log(cyan('\n---------------------------------------------'));
    console.log(cyan(`📊 Test Summary: ${green(passedCount + ' Passed')}, ${failedCount > 0 ? red(failedCount + ' Failed') : '0 Failed'}`));
    console.log(cyan('---------------------------------------------\n'));

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
};

runTests();
