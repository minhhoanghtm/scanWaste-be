const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createPreviewApp } = require('../../tools/auth-preview/server');
const express = require('express');

const listen = async app => { const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); return server; };
const close = server => new Promise(resolve => server.close(resolve));

test('hosted web rejects missing, insecure or credential-bearing backend configuration', () => {
  assert.throws(() => createPreviewApp({ NODE_ENV: 'production' }), /BACKEND_URL/);
  for (const BACKEND_URL of ['http://backend.example', 'https://user:pass@backend.example', 'https://backend.example/api']) {
    assert.throws(() => createPreviewApp({ NODE_ENV: 'production', BACKEND_URL }));
  }
});

test('web proxies API, OAuth cookies and classification images without exposing backend configuration', async () => {
  const backend = express(); backend.use(express.json());
  backend.post('/api/echo', (req, res) => { res.cookie('oauth', 'fixture', { httpOnly: true, secure: true, sameSite: 'lax' }); res.status(202).json({ body: req.body, authorization: req.headers.authorization }); });
  backend.get('/uploads/photo.png', (req, res) => res.type('png').send(Buffer.from([1, 2, 3])));
  const upstream = await listen(backend);
  const web = await listen(createPreviewApp({ BACKEND_URL: `http://127.0.0.1:${upstream.address().port}` }));
  const base = `http://127.0.0.1:${web.address().port}`;
  try {
    const reply = await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer fixture' }, body: JSON.stringify({ name: 'demo' }) });
    assert.equal(reply.status, 202);
    assert.match(reply.headers.get('set-cookie'), /HttpOnly/);
    assert.match(reply.headers.get('set-cookie'), /Secure/);
    assert.deepEqual(await reply.json(), { body: { name: 'demo' }, authorization: 'Bearer fixture' });
    const image = await fetch(base + '/uploads/photo.png');
    assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([1, 2, 3]));
    const config = await fetch(base + '/runtime-config.json');
    assert.equal(config.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await config.json(), { rewardsUrl: 'http://localhost:8081' });
    const index = await fetch(base + '/'); assert.match(await index.text(), /id="login-screen"/);
  } finally { await close(web); await close(upstream); }
});

test('public runtime config has no localhost fallback in production', async () => {
  const web = await listen(createPreviewApp({ NODE_ENV: 'production', BACKEND_URL: 'https://backend.example' }));
  try {
    const result = await fetch(`http://127.0.0.1:${web.address().port}/runtime-config.json`);
    assert.deepEqual(await result.json(), { rewardsUrl: '' });
  } finally { await close(web); }
});
