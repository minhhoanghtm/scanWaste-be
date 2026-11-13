process.env.SMTP_HOST = ''; // Tests never send email through the user's configured provider.
process.env.REDIS_PREFIX = `test:api:${process.pid}:`;
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const app = require('../../src/app');
const { verifiedRegistrationFetch, verifiedLoginFetch } = require('../helpers/verified-registration');
const env = require('../../src/config/env');
const { connectDB } = require('../../src/config/database');
const { SUPPORTED_WASTE_CLASSES } = require('../../src/modules/ai/ai.config');
const User = require('../../src/modules/users/user.model');

// Colors for test output
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

let server;
let baseUrl;
let aiMicroserviceProcess = null;
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

  const getPythonBinary = () => {
    if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
    if (process.platform === 'win32') return 'python';
    const { execSync } = require('child_process');
    try {
      execSync('python3 --version', { stdio: 'ignore' });
      return 'python3';
    } catch (_) {
      return 'python';
    }
  };

  // Ensure AI inference microservice is available
  let aiReady = false;
  try {
    const aiCheck = await fetch(`${env.AI_SERVICE_URL}/health`);
    if (aiCheck.ok) {
      aiReady = true;
      console.log(green('✔ AI Inference Microservice is already running and healthy.'));
    }
  } catch (_) { }

  if (!aiReady) {
    const pythonBin = getPythonBinary();
    console.log(yellow(`Starting AI Inference Microservice via '${pythonBin}' for integration test suite...`));

    let aiStderr = '';
    let aiStdout = '';
    aiMicroserviceProcess = spawn(pythonBin, ['-m', 'uvicorn', 'main:app', '--app-dir', 'ai_service', '--port', '5005'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    aiMicroserviceProcess.stdout.on('data', (d) => {
      aiStdout += d.toString();
    });
    aiMicroserviceProcess.stderr.on('data', (d) => {
      aiStderr += d.toString();
    });
    aiMicroserviceProcess.on('error', (err) => {
      console.error(red(`[AI Service Process Error] Failed to spawn '${pythonBin}': ${err.message}`));
    });

    // Poll health endpoint for up to 15 seconds (30 x 500ms)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const checkRes = await fetch(`${env.AI_SERVICE_URL}/health`);
        if (checkRes.ok) {
          aiReady = true;
          console.log(green(`✔ AI Inference Microservice ready after ${(i + 1) * 500}ms.`));
          break;
        }
      } catch (_) { }
    }

    if (!aiReady) {
      console.error(red(`[AI Service Timeout] AI Microservice failed to respond at ${env.AI_SERVICE_URL}/health within 15 seconds.`));
      if (aiStderr) console.error(red(`[AI Service Stderr]:\n${aiStderr.trim()}`));
      if (aiStdout) console.log(yellow(`[AI Service Stdout]:\n${aiStdout.trim()}`));
    }
  }

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
  let predictedClassName = '';

  // Secondary user for authorization & isolation testing
  const userBEmail = `tester_b_${uniqueId}@example.com`;
  const userBPhone = `092${String(uniqueId).slice(-7)}`;
  let userBAuthToken = '';

  // Admin user for Phase 3 review & dataset testing
  const adminEmail = `admin_${uniqueId}@scanwaste.vn`;
  let adminAuthToken = '';
  let feedbackId = '';
  let datasetItemId = '';

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
    // 1b. AI Health Check Test
    // ----------------------------------------------------
    console.log(yellow('\n[1b] Testing GET /api/ai/health'));
    const aiHealthRes = await fetch(`${baseUrl}/api/ai/health`);
    const aiHealthData = await aiHealthRes.json();
    assert(aiHealthRes.status === 200, `AI Health status code is 200 (got ${aiHealthRes.status})`);
    assert(aiHealthData.success === true, 'AI Health response success is true');
    assert(aiHealthData.data.status === 'healthy' || aiHealthData.data.ready === true, 'AI inference service is healthy & ready');

    // ----------------------------------------------------
    // 1c. API Documentation & Security Headers Test
    // ----------------------------------------------------
    console.log(yellow('\n[1c] Testing API Documentation & Security Headers'));
    const docsUiRes = await fetch(`${baseUrl}/api/docs`);
    assert(docsUiRes.status === 200, `Swagger UI status code is 200 (got ${docsUiRes.status})`);
    assert(docsUiRes.headers.get('content-type').includes('text/html'), 'Swagger UI returns HTML page');
    assert(docsUiRes.headers.get('x-content-type-options') === 'nosniff', 'Helmet nosniff security header present');

    const openApiRes = await fetch(`${baseUrl}/api/docs/openapi.json`);
    const openApiData = await openApiRes.json();
    assert(openApiRes.status === 200, `OpenAPI JSON status code is 200 (got ${openApiRes.status})`);
    assert(openApiData.openapi === '3.0.3', 'OpenAPI version is 3.0.3');
    assert(!!openApiData.paths['/api/ai/classify'], 'OpenAPI spec contains /api/ai/classify');

    // ----------------------------------------------------
    // 2. Auth Register Test (User A)
    // ----------------------------------------------------
    console.log(yellow('\n[2] Testing POST /api/auth/register (User A)'));
    const regRes = await verifiedRegistrationFetch(`${baseUrl}/api/auth/register`, {
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
    assert(!!regData.data?.token, 'JWT Token is generated');
    assert(regData.data?.user?.email === testEmail, 'User email matches registered email');
    assert(regData.data?.user?.phone === `+84${testPhone.slice(1)}`, 'User phone is normalized to +84');
    assert(regData.data?.user?.password === undefined, 'Password is NOT exposed in response');

    // ----------------------------------------------------
    // 2b. Auth Register Test (User B for Isolation)
    // ----------------------------------------------------
    console.log(yellow('\n[2b] Testing POST /api/auth/register (User B for Isolation)'));
    const regBRes = await verifiedRegistrationFetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tran Thi Isolation',
        email: userBEmail,
        phone: userBPhone,
        password: testPassword,
      }),
    });
    const regBData = await regBRes.json();
    assert(regBRes.status === 201, `User B register status is 201 (got ${regBRes.status})`);
    userBAuthToken = regBData.data?.token;

    // ----------------------------------------------------
    // 2c. Auth Register & Setup (Admin User for Phase 3)
    // ----------------------------------------------------
    console.log(yellow('\n[2c] Setting up Admin User for Phase 3'));
    await verifiedRegistrationFetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Super Admin',
        email: adminEmail,
        phone: `093${String(uniqueId).slice(-7)}`,
        password: testPassword,
      }),
    });
    // Promote user to admin in DB
    await User.updateOne({ email: adminEmail }, { role: 'admin' });
    const adminLoginRes = await verifiedLoginFetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: adminEmail, password: testPassword }),
    });
    const adminLoginData = await adminLoginRes.json();
    adminAuthToken = adminLoginData.data?.token;
    assert(!!adminAuthToken, 'Admin JWT token generated successfully');

    // ----------------------------------------------------
    // 3. Auth Register Duplicate Email Test
    // ----------------------------------------------------
    console.log(yellow('\n[3] Testing POST /api/auth/register (Duplicate Email -> 409)'));
    const dupRes = await verifiedRegistrationFetch(`${baseUrl}/api/auth/register`, {
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
    const loginRes = await verifiedLoginFetch(`${baseUrl}/api/auth/login`, {
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
    assert(!!loginData.data?.token, 'Login returned valid JWT token');
    authToken = loginData.data?.token;

    // ----------------------------------------------------
    // 5. Auth Login With Phone Test
    // ----------------------------------------------------
    console.log(yellow('\n[5] Testing POST /api/auth/login (Phone Number)'));
    const phoneLoginRes = await verifiedLoginFetch(`${baseUrl}/api/auth/login`, {
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
    const badLoginRes = await verifiedLoginFetch(`${baseUrl}/api/auth/login`, {
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
    assert(profileData.data?.email === testEmail, 'Profile contains correct user email');
    assert(profileData.data?.password === undefined, 'Profile does NOT expose password');

    // ----------------------------------------------------
    // 7. User Profile Test (Unauthorized)
    // ----------------------------------------------------
    console.log(yellow('\n[7] Testing GET /api/users/me (Without Token -> 401)'));
    const unauthProfileRes = await fetch(`${baseUrl}/api/users/me`);
    assert(unauthProfileRes.status === 401, `Unauthenticated profile status is 401 (got ${unauthProfileRes.status})`);

    // Create a 1x1 dummy JPEG image buffer with valid magic bytes
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

    // ----------------------------------------------------
    // 8. New Dedicated AI Classification API: POST /api/ai/classify
    // ----------------------------------------------------
    console.log(yellow('\n[8] Testing POST /api/ai/classify (Dedicated Real TFLite Classification)'));
    const aiFormData = new FormData();
    const aiBlob = new Blob([dummyJpgBuffer], { type: 'image/jpeg' });
    aiFormData.append('image', aiBlob, 'camera_scan.jpg');

    const aiClassifyRes = await fetch(`${baseUrl}/api/ai/classify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: aiFormData,
    });
    const aiClassifyData = await aiClassifyRes.json();
    assert(aiClassifyRes.status === 201, `AI Classification status code is 201 (got ${aiClassifyRes.status})`);
    assert(aiClassifyData.success === true, 'AI Classification success is true');
    if (aiClassifyData && aiClassifyData.data) {
      assert(!!aiClassifyData.data.classificationId, 'classificationId is returned');
      assert(SUPPORTED_WASTE_CLASSES.includes(aiClassifyData.data.predictedClass), `predictedClass is supported category (${aiClassifyData.data.predictedClass})`);
      assert(typeof aiClassifyData.data.predictedClassVi === 'string' && aiClassifyData.data.predictedClassVi.length > 0, 'predictedClassVi has Vietnamese label');
      assert(typeof aiClassifyData.data.confidence === 'number' && aiClassifyData.data.confidence >= 0 && aiClassifyData.data.confidence <= 1, 'confidence is valid probability [0, 1]');
      assert(Array.isArray(aiClassifyData.data.topPredictions) && aiClassifyData.data.topPredictions.length === 7, 'topPredictions returns 7 classes');
      assert(aiClassifyData.data.modelVersion === 'v3', 'modelVersion is v3');
      assert(aiClassifyData.data.source === 'server', 'source is server');
      assert(typeof aiClassifyData.data.inferenceTimeMs === 'number', 'inferenceTimeMs is measured');
      classificationId = aiClassifyData.data.classificationId;
      predictedClassName = aiClassifyData.data.predictedClass;
    } else {
      assert(false, `classificationId is returned (response data missing: ${aiClassifyData?.message || 'unknown error'})`);
    }

    // ----------------------------------------------------
    // 8b. Backward Compatibility Test: POST /api/classifications
    // ----------------------------------------------------
    console.log(yellow('\n[8b] Testing POST /api/classifications (Backward Compatibility)'));
    const legacyFormData = new FormData();
    const legacyBlob = new Blob([dummyJpgBuffer], { type: 'image/jpeg' });
    legacyFormData.append('image', legacyBlob, 'legacy_item.jpg');

    const legacyRes = await fetch(`${baseUrl}/api/classifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: legacyFormData,
    });
    const legacyData = await legacyRes.json();
    assert(legacyRes.status === 201, `Legacy classification status code is 201 (got ${legacyRes.status})`);
    assert(legacyData.success === true, 'Legacy classification success is true');
    if (legacyData && legacyData.data) {
      assert(SUPPORTED_WASTE_CLASSES.includes(legacyData.data.predictedClass), 'Legacy returns valid predicted class');
    } else {
      assert(false, `Legacy returns valid predicted class (legacyData.data is undefined)`);
    }

    // ----------------------------------------------------
    // 9. Phase 2: POST /api/ai/sync - Single Offline Classification (No Image Required)
    // ----------------------------------------------------
    console.log(yellow('\n[9] Testing POST /api/ai/sync (Offline Single Item, No Image Required)'));
    const clientOfflineId1 = `mobile_sync_${Date.now()}_01`;
    const offlineSyncRes = await fetch(`${baseUrl}/api/ai/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        clientClassificationId: clientOfflineId1,
        predictedClass: 'plastic',
        confidence: 0.94,
        scores: { plastic: 0.94, paper: 0.03, other: 0.03 },
        modelVersion: 'v3',
        inferenceTimeMs: 28,
        classifiedAt: '2026-10-27T10:00:00.000Z',
        metadata: { device: 'Expo React Native Mobile', offlineMode: true },
      }),
    });
    const offlineSyncData = await offlineSyncRes.json();
    assert(offlineSyncRes.status === 201, `Offline sync status code is 201 (got ${offlineSyncRes.status})`);
    assert(offlineSyncData.success === true, 'Offline sync success is true');
    assert(offlineSyncData.data.clientClassificationId === clientOfflineId1, 'clientClassificationId matches');
    assert(offlineSyncData.data.classificationSource === 'offline', 'classificationSource is marked "offline"');
    assert(offlineSyncData.data.predictedClass === 'plastic', 'predictedClass is plastic');
    assert(offlineSyncData.data.predictedClassVi === 'Nhựa', 'predictedClassVi is "Nhựa"');
    assert(offlineSyncData.data.imageUrl === null, 'imageUrl is null without mandatory image upload');
    assert(offlineSyncData.data.isDuplicate === false, 'isDuplicate is false for new record');

    // ----------------------------------------------------
    // 9b. Phase 2: POST /api/ai/sync - Idempotency Check (Duplicate clientClassificationId)
    // ----------------------------------------------------
    console.log(yellow('\n[9b] Testing POST /api/ai/sync (Idempotency with same clientClassificationId)'));
    const duplicateSyncRes = await fetch(`${baseUrl}/api/ai/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        clientClassificationId: clientOfflineId1,
        predictedClass: 'plastic',
        confidence: 0.94,
      }),
    });
    const duplicateSyncData = await duplicateSyncRes.json();
    assert(duplicateSyncRes.status === 200, `Duplicate sync returns status 200 (got ${duplicateSyncRes.status})`);
    assert(duplicateSyncData.data.isDuplicate === true, 'duplicate flag isDuplicate is true');
    assert(duplicateSyncData.data.clientClassificationId === clientOfflineId1, 'clientClassificationId matches existing');
    assert(duplicateSyncData.data.id === offlineSyncData.data.id, 'Record ID matches existing record without creating duplicate');

    // ----------------------------------------------------
    // 9c. Phase 2: POST /api/ai/sync - Concurrency Idempotency Test
    // ----------------------------------------------------
    console.log(yellow('\n[9c] Testing POST /api/ai/sync (Concurrent requests with identical clientClassificationId)'));
    const concurrentClientId = `concurrent_sync_${Date.now()}`;
    const [cRes1, cRes2] = await Promise.all([
      fetch(`${baseUrl}/api/ai/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ clientClassificationId: concurrentClientId, predictedClass: 'glass', confidence: 0.85 }),
      }),
      fetch(`${baseUrl}/api/ai/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ clientClassificationId: concurrentClientId, predictedClass: 'glass', confidence: 0.85 }),
      }),
    ]);
    const [cData1, cData2] = await Promise.all([cRes1.json(), cRes2.json()]);
    assert([200, 201].includes(cRes1.status) && [200, 201].includes(cRes2.status), 'Both concurrent requests succeed with 200/201');
    assert(cData1.data.id === cData2.data.id, 'Both concurrent requests point to the exact same database record ID');

    // ----------------------------------------------------
    // 9d. Phase 2: POST /api/ai/sync - Batch Offline Synchronization
    // ----------------------------------------------------
    console.log(yellow('\n[9d] Testing POST /api/ai/sync (Batch Offline Sync Array)'));
    const batchRes = await fetch(`${baseUrl}/api/ai/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        items: [
          {
            clientClassificationId: `batch_item_${Date.now()}_1`,
            predictedClass: 'metal',
            confidence: 0.77,
          },
          {
            clientClassificationId: `batch_item_${Date.now()}_2`,
            predictedClass: 'organic',
            confidence: 0.92,
          },
        ],
      }),
    });
    const batchData = await batchRes.json();
    assert(batchRes.status === 201, `Batch sync status is 201 (got ${batchRes.status})`);
    assert(batchData.data.syncedCount === 2, `syncedCount is 2 (got ${batchData.data.syncedCount})`);
    assert(Array.isArray(batchData.data.items) && batchData.data.items.length === 2, 'Batch returned 2 items');

    // ----------------------------------------------------
    // 10. History List Test (Pagination, Filters & Ownership)
    // ----------------------------------------------------
    console.log(yellow('\n[10] Testing GET /api/history & GET /api/ai/history (Pagination & Filter)'));
    const historyRes = await fetch(`${baseUrl}/api/history?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const historyData = await historyRes.json();
    assert(historyRes.status === 200, `History status code is 200 (got ${historyRes.status})`);
    assert(Array.isArray(historyData.data.items), 'History items is an array');
    assert(historyData.data.items.length >= 4, `History items count >= 4 (got ${historyData.data.items.length})`);
    assert(historyData.data.pagination.page === 1, 'Pagination page is 1');

    // Test filter by source=offline
    const offlineHistoryRes = await fetch(`${baseUrl}/api/history?source=offline`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const offlineHistoryData = await offlineHistoryRes.json();
    assert(offlineHistoryData.data.items.every((it) => it.classificationSource === 'offline'), 'Filter source=offline returns only offline items');

    // Test alias GET /api/ai/history
    const aiHistoryRes = await fetch(`${baseUrl}/api/ai/history?limit=5`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const aiHistoryData = await aiHistoryRes.json();
    assert(aiHistoryRes.status === 200, `GET /api/ai/history alias status code is 200`);
    assert(Array.isArray(aiHistoryData.data.items), 'GET /api/ai/history returns items array');

    // ----------------------------------------------------
    // 10b. User Isolation Test: User B cannot see User A's history
    // ----------------------------------------------------
    console.log(yellow('\n[10b] Testing User Isolation (User B cannot see or access User A history)'));
    const userBHistoryRes = await fetch(`${baseUrl}/api/history`, {
      headers: { Authorization: `Bearer ${userBAuthToken}` },
    });
    const userBHistoryData = await userBHistoryRes.json();
    assert(userBHistoryData.data.items.length === 0, 'User B has 0 items (cannot see User A data)');

    // User B tries to view User A classification detail -> 404
    if (!classificationId) {
      assert(false, 'Skipping User B isolation test: classificationId was not created in step [8]');
    } else {
      const userBDetailRes = await fetch(`${baseUrl}/api/history/${classificationId}`, {
        headers: { Authorization: `Bearer ${userBAuthToken}` },
      });
      assert(userBDetailRes.status === 404, `User B accessing User A item returns 404 (got ${userBDetailRes.status})`);

      // User B tries to delete User A classification -> 404
      const userBDeleteRes = await fetch(`${baseUrl}/api/history/${classificationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userBAuthToken}` },
      });
      assert(userBDeleteRes.status === 404, `User B deleting User A item returns 404 (got ${userBDeleteRes.status})`);
    }

    // ----------------------------------------------------
    // 10c. History Detail Test (Authorized Owner)
    // ----------------------------------------------------
    console.log(yellow('\n[10c] Testing GET /api/history/:id (Authorized Owner)'));
    if (!classificationId) {
      assert(false, 'Skipping History detail test: classificationId was not created in step [8]');
    } else {
      const detailRes = await fetch(`${baseUrl}/api/history/${classificationId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const detailData = await detailRes.json();
      assert(detailRes.status === 200, `History detail status is 200 (got ${detailRes.status})`);
      assert(detailData.data?.id === classificationId, 'History detail matches ID');
      assert(detailData.data?.predictedClass === predictedClassName, 'Detail predicted class matches');
    }

    // ----------------------------------------------------
    // 10d. DELETE /api/history/:id & /api/ai/history/:id Test
    // ----------------------------------------------------
    console.log(yellow('\n[10d] Testing DELETE /api/history/:id (Owner deletion)'));
    const tempSync = await fetch(`${baseUrl}/api/ai/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ clientClassificationId: `to_delete_${Date.now()}`, predictedClass: 'glass' }),
    });
    const tempSyncData = await tempSync.json();
    const toDeleteId = tempSyncData.data.id;

    const deleteRes = await fetch(`${baseUrl}/api/history/${toDeleteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const deleteData = await deleteRes.json();
    assert(deleteRes.status === 200, `DELETE status code is 200 (got ${deleteRes.status})`);
    assert(deleteData.data.deleted === true, 'deleted confirmation is true');

    const checkDeletedRes = await fetch(`${baseUrl}/api/history/${toDeleteId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(checkDeletedRes.status === 404, `GET deleted item returns 404 Not Found (got ${checkDeletedRes.status})`);

    // ----------------------------------------------------
    // 11. Statistics Test
    // ----------------------------------------------------
    console.log(yellow('\n[11] Testing GET /api/statistics'));
    const statsRes = await fetch(`${baseUrl}/api/statistics`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const statsData = await statsRes.json();
    assert(statsRes.status === 200, `Statistics status is 200 (got ${statsRes.status})`);
    assert(statsData.data.total >= 4, 'Statistics total count >= 4');
    assert(statsData.data.plastic >= 1, 'Statistics contains synced plastic item');

    // ====================================================
    // PHASE 3: AI FEEDBACK & DATASET MANAGEMENT TESTS
    // ====================================================

    // ----------------------------------------------------
    // 15. User AI Feedback Submission: POST /api/ai/feedback
    // ----------------------------------------------------
    console.log(yellow('\n[15] Testing POST /api/ai/feedback (Valid User Feedback)'));
    if (!classificationId) {
      assert(false, 'Skipping Feedback submission tests: classificationId was not created in step [8]');
    } else {
      const feedbackRes = await fetch(`${baseUrl}/api/ai/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          classificationId: classificationId,
          correctClass: 'glass',
          comment: 'Đây là chai thủy tinh trong suốt, không phải giấy/nhựa',
          userConsentForTraining: true,
        }),
      });
      const feedbackData = await feedbackRes.json();
      assert(feedbackRes.status === 201, `Feedback status code is 201 (got ${feedbackRes.status})`);
      assert(feedbackData.success === true, 'Feedback success is true');
      if (feedbackData && feedbackData.data) {
        assert(feedbackData.data.correctClass === 'glass', 'correctClass is glass');
        assert(feedbackData.data.status === 'pending', 'Initial status is pending');
        assert(feedbackData.data.userConsentForTraining === true, 'userConsentForTraining is true');
        feedbackId = feedbackData.data.id;
      }

      // ----------------------------------------------------
      // 15b. Duplicate Feedback Prevention -> 409 Conflict
      // ----------------------------------------------------
      console.log(yellow('\n[15b] Testing POST /api/ai/feedback (Duplicate Feedback -> 409)'));
      const dupFeedbackRes = await fetch(`${baseUrl}/api/ai/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          classificationId: classificationId,
          correctClass: 'glass',
        }),
      });
      assert(dupFeedbackRes.status === 409, `Duplicate feedback status code is 409 (got ${dupFeedbackRes.status})`);

      // ----------------------------------------------------
      // 15c. User B cannot submit feedback for User A classification -> 404
      // ----------------------------------------------------
      console.log(yellow('\n[15c] Testing POST /api/ai/feedback (Access Denied for other user item -> 404)'));
      const forbiddenFeedbackRes = await fetch(`${baseUrl}/api/ai/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userBAuthToken}`,
        },
        body: JSON.stringify({
          classificationId: classificationId,
          correctClass: 'glass',
        }),
      });
      assert(forbiddenFeedbackRes.status === 404, `User B feedback on User A classification returns 404 (got ${forbiddenFeedbackRes.status})`);

      // ----------------------------------------------------
      // 15d. Feedback with Invalid Waste Class -> 400
      // ----------------------------------------------------
      console.log(yellow('\n[15d] Testing POST /api/ai/feedback (Invalid Class -> 400)'));
      const invalidClassFeedback = await fetch(`${baseUrl}/api/ai/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          classificationId: classificationId,
          correctClass: 'radioactive_waste',
        }),
      });
      assert(invalidClassFeedback.status === 400, `Invalid correctClass returns 400 (got ${invalidClassFeedback.status})`);
    }

    // ----------------------------------------------------
    // 16. Admin Feedback Access Control (Regular user -> 403 Forbidden)
    // ----------------------------------------------------
    console.log(yellow('\n[16] Testing GET /api/admin/ai/feedback (Regular user -> 403 Forbidden)'));
    const unauthAdminFeedback = await fetch(`${baseUrl}/api/admin/ai/feedback`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(unauthAdminFeedback.status === 403, `Regular user accessing admin feedback returns 403 (got ${unauthAdminFeedback.status})`);

    // ----------------------------------------------------
    // 17. Admin Feedback List & Detail: GET /api/admin/ai/feedback
    // ----------------------------------------------------
    console.log(yellow('\n[17] Testing GET /api/admin/ai/feedback (Authorized Admin)'));
    const adminFeedbackRes = await fetch(`${baseUrl}/api/admin/ai/feedback`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const adminFeedbackData = await adminFeedbackRes.json();
    assert(adminFeedbackRes.status === 200, `Admin feedback list status is 200 (got ${adminFeedbackRes.status})`);
    assert(Array.isArray(adminFeedbackData.data.items), 'Feedback items is an array');
    assert(adminFeedbackData.data.items.length >= 1, 'Contains at least 1 feedback item');

    if (!feedbackId) {
      assert(false, 'Skipping Admin Feedback detail and review tests: feedbackId was not created in step [15]');
    } else {
      const adminFeedbackDetailRes = await fetch(`${baseUrl}/api/admin/ai/feedback/${feedbackId}`, {
        headers: { Authorization: `Bearer ${adminAuthToken}` },
      });
      const adminFeedbackDetailData = await adminFeedbackDetailRes.json();
      assert(adminFeedbackDetailRes.status === 200, `Admin feedback detail status is 200 (got ${adminFeedbackDetailRes.status})`);
      assert(adminFeedbackDetailData.data?.id === feedbackId, 'Feedback detail ID matches');
      assert(!!adminFeedbackDetailData.data?.userId?.email, 'Populates user information');

      // ----------------------------------------------------
      // 18. Admin Review & Approval: PATCH /api/admin/ai/feedback/:id/review
      // ----------------------------------------------------
      console.log(yellow('\n[18] Testing PATCH /api/admin/ai/feedback/:id/review (Approval & Dataset Integration)'));
      const reviewRes = await fetch(`${baseUrl}/api/admin/ai/feedback/${feedbackId}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminAuthToken}`,
        },
        body: JSON.stringify({
          status: 'approved',
          verifiedClass: 'glass',
          adminNotes: 'Đã xác minh chính xác là chai thủy tinh trong suốt, bổ sung vào tập huấn luyện',
          addToDataset: true,
          split: 'train',
          difficultyTag: 'transparent_pet_vs_glass',
        }),
      });
      const reviewData = await reviewRes.json();
      assert(reviewRes.status === 200, `Review status code is 200 (got ${reviewRes.status})`);
      assert(reviewData.data?.status === 'approved', 'Status updated to approved');
      assert(reviewData.data?.verifiedClass === 'glass', 'verifiedClass is glass');
      assert(reviewData.data?.addedToDataset === true, 'addedToDataset is true');
      assert(!!reviewData.data?.datasetItemId, 'datasetItemId is generated');
    }

    // ----------------------------------------------------
    // 19. Dataset Upload by Admin: POST /api/admin/ai/datasets
    // ----------------------------------------------------
    console.log(yellow('\n[19] Testing POST /api/admin/ai/datasets (Admin Upload Dataset Item)'));
    // Create an independent valid image buffer
    const baseJpgBytes = [
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09,
      0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09,
      0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09,
      0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09,
      0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0xff, 0xc0, 0x00,
      0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
      0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
      0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01,
      0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x80, 0xff, 0xd9,
    ];
    // Attach unique bytes so hash is distinct per test run
    const datasetImageBuffer = Buffer.concat([
      Buffer.from(baseJpgBytes),
      Buffer.from(`nonce_${uniqueId}_${Date.now()}`),
    ]);

    const datasetFormData = new FormData();
    const datasetBlob = new Blob([datasetImageBuffer], { type: 'image/jpeg' });
    datasetFormData.append('image', datasetBlob, 'dataset_plastic_sample.jpg');
    datasetFormData.append('label', 'plastic');
    datasetFormData.append('split', 'train');
    datasetFormData.append('difficultyTag', 'reflective_metal_vs_plastic');
    datasetFormData.append('notes', 'Chai nhựa bóng có bề mặt phản chiếu');

    const createDatasetRes = await fetch(`${baseUrl}/api/admin/ai/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAuthToken}` },
      body: datasetFormData,
    });
    const createDatasetData = await createDatasetRes.json();
    assert(createDatasetRes.status === 201, `Create dataset status is 201 (got ${createDatasetRes.status})`);
    assert(createDatasetData.success === true, 'Create dataset success is true');
    assert(createDatasetData.data.label === 'plastic', 'Dataset label is plastic');
    assert(!!createDatasetData.data.imageHash, 'SHA-256 imageHash generated');
    assert(createDatasetData.data.difficultyTag === 'reflective_metal_vs_plastic', 'difficultyTag is preserved');
    datasetItemId = createDatasetData.data.id;

    // ----------------------------------------------------
    // 20. Dataset Duplicate Detection via SHA-256 -> 409 Conflict
    // ----------------------------------------------------
    console.log(yellow('\n[20] Testing POST /api/admin/ai/datasets (Duplicate SHA-256 Image -> 409)'));
    const dupDatasetFormData = new FormData();
    const dupDatasetBlob = new Blob([datasetImageBuffer], { type: 'image/jpeg' });
    dupDatasetFormData.append('image', dupDatasetBlob, 'another_name_same_bytes.jpg');
    dupDatasetFormData.append('label', 'plastic');
    dupDatasetFormData.append('split', 'test');

    const dupDatasetRes = await fetch(`${baseUrl}/api/admin/ai/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAuthToken}` },
      body: dupDatasetFormData,
    });
    assert(dupDatasetRes.status === 409, `Duplicate dataset image rejected with 409 Conflict (got ${dupDatasetRes.status})`);

    // ----------------------------------------------------
    // 21. Dataset List, Distribution & Detail APIs
    // ----------------------------------------------------
    console.log(yellow('\n[21] Testing GET /api/admin/ai/datasets (List & Distribution Stats)'));
    const datasetListRes = await fetch(`${baseUrl}/api/admin/ai/datasets?label=plastic`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const datasetListData = await datasetListRes.json();
    assert(datasetListRes.status === 200, `Dataset list status is 200 (got ${datasetListRes.status})`);
    assert(Array.isArray(datasetListData.data.items), 'Dataset items is array');
    assert(datasetListData.data.items.length >= 1, 'Contains uploaded dataset item');
    assert(datasetListData.data.distribution !== undefined, 'Contains distribution statistics');

    const datasetDetailRes = await fetch(`${baseUrl}/api/admin/ai/datasets/${datasetItemId}`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const datasetDetailData = await datasetDetailRes.json();
    assert(datasetDetailRes.status === 200, `Dataset detail status is 200 (got ${datasetDetailRes.status})`);
    assert(datasetDetailData.data.id === datasetItemId, 'Dataset detail matches ID');

    // ----------------------------------------------------
    // 22. Dataset Item Update: PATCH /api/admin/ai/datasets/:id
    // ----------------------------------------------------
    console.log(yellow('\n[22] Testing PATCH /api/admin/ai/datasets/:id (Update Split & Label)'));
    const updateDatasetRes = await fetch(`${baseUrl}/api/admin/ai/datasets/${datasetItemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({
        split: 'val',
        notes: 'Chuyển sang tập validation để kiểm thử',
      }),
    });
    const updateDatasetData = await updateDatasetRes.json();
    assert(updateDatasetRes.status === 200, `Update dataset status is 200 (got ${updateDatasetRes.status})`);
    assert(updateDatasetData.data.split === 'val', 'Dataset split updated to val');

    // ----------------------------------------------------
    // 23. Dataset Export ZIP for Google Colab: POST /api/admin/ai/datasets/export
    // ----------------------------------------------------
    console.log(yellow('\n[23] Testing POST /api/admin/ai/datasets/export (Streaming ZIP for Colab)'));
    const exportRes = await fetch(`${baseUrl}/api/admin/ai/datasets/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({}),
    });
    assert(exportRes.status === 200, `Export status code is 200 (got ${exportRes.status})`);
    const contentType = exportRes.headers.get('content-type');
    assert(contentType && contentType.includes('application/zip'), `Content-Type is application/zip (got ${contentType})`);

    const zipBuffer = Buffer.from(await exportRes.arrayBuffer());
    assert(zipBuffer.length > 50, `ZIP file size is valid (${zipBuffer.length} bytes)`);
    // Verify standard PK ZIP header magic bytes: 0x50, 0x4B, 0x03, 0x04
    const isPkZip = zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b && zipBuffer[2] === 0x03 && zipBuffer[3] === 0x04;
    assert(isPkZip, 'ZIP file header begins with standard PK magic bytes (0x50, 0x4B, 0x03, 0x04)');

    // ----------------------------------------------------
    // 24. Dataset Export Access Control (Regular user -> 403 Forbidden)
    // ----------------------------------------------------
    console.log(yellow('\n[24] Testing POST /api/admin/ai/datasets/export (Regular user -> 403 Forbidden)'));
    const unauthExportRes = await fetch(`${baseUrl}/api/admin/ai/datasets/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(unauthExportRes.status === 403, `Regular user exporting dataset returns 403 (got ${unauthExportRes.status})`);

    // ====================================================
    // PHASE 4: MODEL REGISTRY & AI STATISTICS
    // ====================================================

    // Ensure clean state for Phase 4: reset any previous test models and ensure v3 is active
    const ModelRegistry = require('../../src/modules/ai/modelRegistry/modelRegistry.model');
    const aiServiceInstance = require('../../src/modules/ai/ai.service');
    await ModelRegistry.deleteMany({ version: { $regex: /^v4_test|^v3_1_mobile|^bad_/ } });
    await ModelRegistry.updateMany({}, { $set: { status: 'inactive' } });
    await ModelRegistry.updateOne(
      { version: 'v3' },
      { $set: { status: 'active', activatedAt: new Date(), previousActiveVersion: null } }
    );
    try {
      await aiServiceInstance.reloadModel('models/scanwaste_mobilenetv2_v3.tflite', 'v3');
    } catch (e) {
      // ignore
    }

    // ----------------------------------------------------
    // 25. Current Active Model: GET /api/ai/models/current
    // ----------------------------------------------------
    console.log(yellow('\n[25] Testing GET /api/ai/models/current (Public/Client Active Model)'));
    const currentModelRes = await fetch(`${baseUrl}/api/ai/models/current`);
    const currentModelData = await currentModelRes.json();
    assert(currentModelRes.status === 200, `Current model status is 200 (got ${currentModelRes.status})`);
    assert(currentModelData.success === true, 'Current model success is true');
    assert(currentModelData.data.version === 'v3', 'Current default model version is v3');
    assert(currentModelData.data.status === 'active', 'Current model status is active');
    assert(Array.isArray(currentModelData.data.labels) && currentModelData.data.labels.length === 7, 'Returns 7 waste classes');
    assert(currentModelData.data.testAccuracy === null, 'Test accuracy is null until real evaluation is recorded');

    // ----------------------------------------------------
    // 26. Admin Authorization on Model Registry (Regular User -> 403 Forbidden)
    // ----------------------------------------------------
    console.log(yellow('\n[26] Testing GET /api/admin/ai/models (Regular user -> 403 Forbidden)'));
    const unauthModelListRes = await fetch(`${baseUrl}/api/admin/ai/models`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(unauthModelListRes.status === 403, `Regular user accessing model registry returns 403 (got ${unauthModelListRes.status})`);

    // ----------------------------------------------------
    // 27. Model Registry List: GET /api/admin/ai/models (Authorized Admin)
    // ----------------------------------------------------
    console.log(yellow('\n[27] Testing GET /api/admin/ai/models (Authorized Admin)'));
    const adminModelListRes = await fetch(`${baseUrl}/api/admin/ai/models`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const adminModelListData = await adminModelListRes.json();
    assert(adminModelListRes.status === 200, `Admin model list status is 200 (got ${adminModelListRes.status})`);
    assert(Array.isArray(adminModelListData.data.models), 'models is an array');
    assert(adminModelListData.data.models.length >= 1, 'Contains at least default v3 model');
    assert(adminModelListData.data.activeModelsCount >= 1, 'Active models count is >= 1');

    // ----------------------------------------------------
    // 27b. Inspect Model Details: GET /api/admin/ai/models/:id
    // ----------------------------------------------------
    console.log(yellow('\n[27b] Testing GET /api/admin/ai/models/:id (Model Detail Inspection)'));
    const defaultModelId = adminModelListData.data.models[0].id;
    const modelDetailRes = await fetch(`${baseUrl}/api/admin/ai/models/${defaultModelId}`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const modelDetailData = await modelDetailRes.json();
    assert(modelDetailRes.status === 200, `Model detail status is 200 (got ${modelDetailRes.status})`);
    assert(modelDetailData.data.id === defaultModelId, 'Model detail ID matches queried ID');
    assert(modelDetailData.data.inputShape.length === 4, 'Model detail has 4D input tensor shape');
    assert(modelDetailData.data.labels.length === 7, 'Model detail has 7 labels');

    // ----------------------------------------------------
    // 28. Register Valid Model Version: POST /api/admin/ai/models (MobileNetV2 V4)
    // ----------------------------------------------------
    console.log(yellow('\n[28] Testing POST /api/admin/ai/models (Register MobileNetV2 V4)'));
    const v4ArtifactPath = 'models/scanwaste_mobilenetv2_v4_test.tflite';
    if (!fs.existsSync(path.resolve(v4ArtifactPath))) {
      fs.copyFileSync(path.resolve('models/scanwaste_mobilenetv2_v3.tflite'), path.resolve(v4ArtifactPath));
    }
    const v4Buffer = fs.readFileSync(path.resolve(v4ArtifactPath));
    const v4Checksum = crypto.createHash('sha256').update(v4Buffer).digest('hex');

    const uniqueV4Version = `v4_test_${Date.now()}`;
    const registerV4Res = await fetch(`${baseUrl}/api/admin/ai/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({
        modelName: 'ScanWaste MobileNetV2 V4 Experimental',
        version: uniqueV4Version,
        artifactPath: v4ArtifactPath,
        checksum: v4Checksum,
        inputShape: [1, 224, 224, 3],
        inputDtype: 'float32',
        outputShape: [1, 7],
        outputDtype: 'float32',
        labels: ['organic', 'cardboard', 'glass', 'metal', 'paper', 'plastic', 'other'],
        targetPlatform: 'server',
        trainingAccuracy: 0.942,
        validationAccuracy: 0.915,
        testAccuracy: null, // intentionally null as benchmark test suite is pending
        evaluationNotes: 'MobileNetV2 fine-tuned with reviewed feedback images',
      }),
    });
    const registerV4Data = await registerV4Res.json();
    assert(registerV4Res.status === 201, `Register model status is 201 (got ${registerV4Res.status})`);
    assert(registerV4Data.success === true, 'Register model success is true');
    assert(registerV4Data.data.version === uniqueV4Version, 'Registered version matches');
    assert(registerV4Data.data.status === 'inactive', 'Newly registered model starts as inactive');
    assert(registerV4Data.data.checksum === v4Checksum, 'Checksum matches SHA-256');
    assert(registerV4Data.data.trainingAccuracy === 0.942, 'Training accuracy is preserved');
    assert(registerV4Data.data.testAccuracy === null, 'Test accuracy remains null when not evaluated');
    const v4ModelId = registerV4Data.data.id;

    // ----------------------------------------------------
    // 29. Duplicate Model Version Check -> 409 Conflict
    // ----------------------------------------------------
    console.log(yellow('\n[29] Testing POST /api/admin/ai/models (Duplicate Version -> 409 Conflict)'));
    const dupModelRes = await fetch(`${baseUrl}/api/admin/ai/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({
        modelName: 'Duplicate V4 Attempt',
        version: uniqueV4Version,
        artifactPath: v4ArtifactPath,
      }),
    });
    assert(dupModelRes.status === 409, `Duplicate model version returns 409 (got ${dupModelRes.status})`);

    // ----------------------------------------------------
    // 30. Checksum Validation -> 400 Bad Request
    // ----------------------------------------------------
    console.log(yellow('\n[30] Testing POST /api/admin/ai/models (Invalid Checksum -> 400 Bad Request)'));
    const badChecksumRes = await fetch(`${baseUrl}/api/admin/ai/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({
        modelName: 'Bad Checksum Model',
        version: `bad_checksum_${Date.now()}`,
        artifactPath: v4ArtifactPath,
        checksum: '1111111111111111111111111111111111111111111111111111111111111111',
      }),
    });
    assert(badChecksumRes.status === 400, `Invalid checksum returns 400 (got ${badChecksumRes.status})`);

    // ----------------------------------------------------
    // 31. Incompatible Tensor Shapes / Labels -> 400 Bad Request
    // ----------------------------------------------------
    console.log(yellow('\n[31] Testing POST /api/admin/ai/models (Incompatible Output Shape -> 400 Bad Request)'));
    const badShapeRes = await fetch(`${baseUrl}/api/admin/ai/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({
        modelName: 'Bad Shape Model',
        version: `bad_shape_${Date.now()}`,
        artifactPath: v4ArtifactPath,
        outputShape: [1, 10], // Incompatible: 10 classes instead of 7
      }),
    });
    assert(badShapeRes.status === 400, `Incompatible output shape returns 400 (got ${badShapeRes.status})`);

    // ----------------------------------------------------
    // 31b. Path Traversal Rejection Test -> 400 Security Violation
    // ----------------------------------------------------
    console.log(yellow('\n[31b] Testing POST /api/admin/ai/models (Path Traversal Attempt -> 400)'));
    const traversalRes = await fetch(`${baseUrl}/api/admin/ai/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({
        modelName: 'Malicious Traversal Model',
        version: `traversal_${Date.now()}`,
        artifactPath: '../../../../windows/system32/calc.exe',
      }),
    });
    assert(traversalRes.status === 400, `Path traversal attempt returns 400 (got ${traversalRes.status})`);

    // ----------------------------------------------------
    // 32. Activate Model & Hot-Reload: PATCH /api/admin/ai/models/:id/activate
    // ----------------------------------------------------
    console.log(yellow('\n[32] Testing PATCH /api/admin/ai/models/:id/activate (Model Activation & Hot-Reload)'));
    const activateRes = await fetch(`${baseUrl}/api/admin/ai/models/${v4ModelId}/activate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({}),
    });
    const activateData = await activateRes.json();
    assert(activateRes.status === 200, `Activate model status is 200 (got ${activateRes.status})`);
    assert(activateData.success === true, 'Activation success is true');
    assert(activateData.data.model.status === 'active', 'Model status updated to active');
    assert(activateData.data.deployStatus === 'hot_reloaded', 'Deployment status is hot_reloaded');
    assert(activateData.data.hotReloaded === true, 'hotReloaded flag is true');
    assert(activateData.data.previousActiveVersion === 'v3', 'previousActiveVersion is recorded as v3 for rollback');

    // Verify only ONE server/universal model is active
    const checkActiveRes = await fetch(`${baseUrl}/api/admin/ai/models?status=active`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const checkActiveData = await checkActiveRes.json();
    const activeServerModels = checkActiveData.data.models.filter(
      (m) => m.targetPlatform === 'server' || m.targetPlatform === 'universal'
    );
    assert(activeServerModels.length === 1, `Exactly 1 active server model exists (got ${activeServerModels.length})`);
    assert(activeServerModels[0].id === v4ModelId, 'The active model is the newly activated v4 model');

    // ----------------------------------------------------
    // 32b. Model Activation Error on Non-existent ID -> 404
    // ----------------------------------------------------
    console.log(yellow('\n[32b] Testing Model Activation (Non-existent ID -> 404)'));
    const nonExistentActRes = await fetch(`${baseUrl}/api/admin/ai/models/660000000000000000000000/activate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({}),
    });
    assert(nonExistentActRes.status === 404, `Non-existent model activation returns 404 (got ${nonExistentActRes.status})`);

    // ----------------------------------------------------
    // 33. Live Inference Serves With Activated Model Version
    // ----------------------------------------------------
    console.log(yellow('\n[33] Testing Live Inference with Activated Model Version (Must Return v4)'));
    const testV4Form = new FormData();
    const testV4Blob = new Blob([dummyJpgBuffer], { type: 'image/jpeg' });
    testV4Form.append('image', testV4Blob, 'test_v4.jpg');

    const v4InferenceRes = await fetch(`${baseUrl}/api/ai/classify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: testV4Form,
    });
    const v4InferenceData = await v4InferenceRes.json();
    assert(v4InferenceRes.status === 201, `v4 inference status is 201 (got ${v4InferenceRes.status})`);
    assert(v4InferenceData.data.modelVersion === uniqueV4Version, `Inference modelVersion switched to ${uniqueV4Version} (got ${v4InferenceData.data.modelVersion})`);

    // ----------------------------------------------------
    // 34. Concurrent Activation Safety Test
    // ----------------------------------------------------
    console.log(yellow('\n[34] Testing Concurrent Model Activation Safety'));
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      fetch(`${baseUrl}/api/admin/ai/models/${v4ModelId}/activate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuthToken}` },
        body: JSON.stringify({}),
      }),
      fetch(`${baseUrl}/api/admin/ai/models/${v4ModelId}/activate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuthToken}` },
        body: JSON.stringify({}),
      }),
    ]);
    assert(concurrentRes1.status === 200, `Concurrent activation 1 is 200 (got ${concurrentRes1.status})`);
    assert(concurrentRes2.status === 200, `Concurrent activation 2 is 200 (got ${concurrentRes2.status})`);

    // ----------------------------------------------------
    // 35. Safe Rollback to Previous Version: PATCH /api/admin/ai/models/:id/rollback
    // ----------------------------------------------------
    console.log(yellow('\n[35] Testing PATCH /api/admin/ai/models/:id/rollback (Rollback v4 -> v3)'));
    const rollbackRes = await fetch(`${baseUrl}/api/admin/ai/models/${v4ModelId}/rollback`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({}),
    });
    const rollbackData = await rollbackRes.json();
    assert(rollbackRes.status === 200, `Rollback status code is 200 (got ${rollbackRes.status})`);
    assert(rollbackData.success === true, 'Rollback success is true');
    assert(rollbackData.data.rolledBackFrom === uniqueV4Version, `Rolled back from ${uniqueV4Version}`);
    assert(rollbackData.data.activeVersion === 'v3', 'Active version successfully restored to v3');
    assert(rollbackData.data.hotReloaded === true, 'Inference engine hot-reloaded back to v3');

    // Verify inference serves with v3 again
    const postRollbackForm = new FormData();
    const postRollbackBlob = new Blob([dummyJpgBuffer], { type: 'image/jpeg' });
    postRollbackForm.append('image', postRollbackBlob, 'test_post_rollback.jpg');
    const postRollbackRes = await fetch(`${baseUrl}/api/ai/classify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: postRollbackForm,
    });
    const postRollbackData = await postRollbackRes.json();
    assert(postRollbackData.data.modelVersion === 'v3', `Post-rollback inference serves with v3 (got ${postRollbackData.data.modelVersion})`);

    // ----------------------------------------------------
    // 36. Mobile Bundled Platform Target Distinction
    // ----------------------------------------------------
    console.log(yellow('\n[36] Testing Mobile Bundled Model Target Distinction (No Fake Update Claim)'));
    const mobileModelRes = await fetch(`${baseUrl}/api/admin/ai/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({
        modelName: 'MobileNetV2 V3.1 Client Offline Bundle',
        version: `v3_1_mobile_${Date.now()}`,
        artifactPath: v4ArtifactPath,
        targetPlatform: 'mobile_bundled',
      }),
    });
    const mobileModelData = await mobileModelRes.json();
    assert(mobileModelRes.status === 201, `Mobile model registered with 201 (got ${mobileModelRes.status})`);
    const mobileModelId = mobileModelData.data.id;

    const activateMobileRes = await fetch(`${baseUrl}/api/admin/ai/models/${mobileModelId}/activate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
      },
      body: JSON.stringify({}),
    });
    const activateMobileData = await activateMobileRes.json();
    assert(activateMobileRes.status === 200, `Mobile model activation status is 200 (got ${activateMobileRes.status})`);
    assert(activateMobileData.data.hotReloaded === false, 'Server inference was NOT hot-reloaded for mobile bundle');
    assert(activateMobileData.data.requiresMobileBuild === true, 'requiresMobileBuild is true');
    assert(activateMobileData.data.deployStatus === 'mobile_build_required', 'deployStatus is mobile_build_required');

    // ----------------------------------------------------
    // 37. Comprehensive AI Statistics: GET /api/admin/ai/statistics
    // ----------------------------------------------------
    console.log(yellow('\n[37] Testing GET /api/admin/ai/statistics (Admin AI Statistics & Confusion Pairs)'));
    // Unauth check
    const unauthStatsRes = await fetch(`${baseUrl}/api/admin/ai/statistics`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(unauthStatsRes.status === 403, `Regular user accessing AI statistics returns 403 (got ${unauthStatsRes.status})`);

    // Admin authorized check
    const adminStatsRes = await fetch(`${baseUrl}/api/admin/ai/statistics`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const adminStatsData = await adminStatsRes.json();
    assert(adminStatsRes.status === 200, `AI statistics status is 200 (got ${adminStatsRes.status})`);
    assert(adminStatsData.success === true, 'AI statistics success is true');

    const stats = adminStatsData.data;
    assert(typeof stats.totalClassifications === 'number' && stats.totalClassifications >= 1, `Total classifications >= 1 (got ${stats.totalClassifications})`);
    assert(stats.byCategory && typeof stats.byCategory.plastic === 'number', 'Contains 7 categories breakdown (plastic)');
    assert(stats.byCategory && typeof stats.byCategory.organic === 'number', 'Contains 7 categories breakdown (organic)');
    assert(stats.bySource && typeof stats.bySource.server === 'number', 'Source breakdown contains server count');
    assert(stats.bySource && typeof stats.bySource.offline === 'number', 'Source breakdown contains offline count');
    assert(typeof stats.averageInferenceTimeMs === 'number', `Average inference time is a number (${stats.averageInferenceTimeMs}ms)`);
    assert(stats.feedbackStats && typeof stats.feedbackStats.totalFeedback === 'number', 'Feedback stats contains total feedback');
    assert(Array.isArray(stats.confusionPairs), 'Confusion pairs is an array');
    assert(stats.timeSeries && Array.isArray(stats.timeSeries.daily), 'Time series contains daily aggregation');
    assert(stats.timeSeries && Array.isArray(stats.timeSeries.weekly), 'Time series contains weekly aggregation');
    assert(stats.timeSeries && Array.isArray(stats.timeSeries.monthly), 'Time series contains monthly aggregation');
    assert(stats.datasetSummary && typeof stats.datasetSummary.totalItems === 'number', 'Dataset summary contains totalItems');
    assert(stats.datasetSummary && typeof stats.datasetSummary.bySplit.train === 'number', 'Dataset summary contains train split count');
    assert(typeof stats.moderatedImagesCount === 'number', `Moderated images count is a number (${stats.moderatedImagesCount})`);
    assert(stats.activeModelAccuracy && stats.activeModelAccuracy.modelVersion, 'Active model benchmark accuracy is included');
    assert(stats.feedbackStats.note.includes('strictly separated from benchmark Test Accuracy'), 'Feedback rate is explicitly NOT confused with Test Accuracy');

    // ----------------------------------------------------
    // 37b. Filtered AI Statistics Query Test (?modelVersion=v3)
    // ----------------------------------------------------
    console.log(yellow('\n[37b] Testing GET /api/admin/ai/statistics with query filter (?modelVersion=v3)'));
    const filteredStatsRes = await fetch(`${baseUrl}/api/admin/ai/statistics?modelVersion=v3`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` },
    });
    const filteredStatsData = await filteredStatsRes.json();
    assert(filteredStatsRes.status === 200, `Filtered AI statistics status is 200 (got ${filteredStatsRes.status})`);
    assert(filteredStatsData.success === true, 'Filtered AI statistics success is true');
    assert(typeof filteredStatsData.data.totalClassifications === 'number', 'Filtered total classifications is a number');

    // ----------------------------------------------------
    // 12. Invalid File Format Test (.txt -> 400)
    // ----------------------------------------------------
    console.log(yellow('\n[12] Testing Invalid File Format (.txt -> 400)'));
    const invalidFormData = new FormData();
    const txtBlob = new Blob(['sample text document'], { type: 'text/plain' });
    invalidFormData.append('image', txtBlob, 'document.txt');

    const invalidFileRes = await fetch(`${baseUrl}/api/ai/classify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: invalidFormData,
    });
    assert(invalidFileRes.status === 400, `Invalid file format status is 400 (got ${invalidFileRes.status})`);

    // ----------------------------------------------------
    // 12b. Spoofed File Extension Test (.jpg extension with text content -> 400 via Magic Bytes)
    // ----------------------------------------------------
    console.log(yellow('\n[12b] Testing Spoofed File Extension (.jpg with non-image bytes -> 400)'));
    const spoofedFormData = new FormData();
    const spoofedBlob = new Blob(['malicious payload disguised as image'], { type: 'image/jpeg' });
    spoofedFormData.append('image', spoofedBlob, 'malicious.jpg');

    const spoofedRes = await fetch(`${baseUrl}/api/ai/classify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: spoofedFormData,
    });
    assert(spoofedRes.status === 400, `Spoofed image rejected with status 400 (got ${spoofedRes.status})`);

    // ----------------------------------------------------
    // 13. File Too Large Test (> 5MB -> 413)
    // ----------------------------------------------------
    console.log(yellow('\n[13] Testing File Size Exceeded (> 5MB -> 413)'));
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024); // 5.5MB
    const largeFormData = new FormData();
    const largeBlob = new Blob([largeBuffer], { type: 'image/jpeg' });
    largeFormData.append('image', largeBlob, 'large_image.jpg');

    const largeFileRes = await fetch(`${baseUrl}/api/ai/classify`, {
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
    if (aiMicroserviceProcess && aiMicroserviceProcess.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(aiMicroserviceProcess.pid), '/f', '/t'], { stdio: 'ignore' });
        } else {
          aiMicroserviceProcess.kill('SIGTERM');
        }
      } catch (_) { }
    }
    await mongoose.connection.close();
    await require('../../src/config/redis').closeRedis();

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