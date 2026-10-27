const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '../../package.json'));
const express = backendRequire('express');
backendRequire('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const backendPort = Number(process.env.PORT) || 5000;
const previewPort = Number(process.env.PREVIEW_PORT) || 5173;
const app = express();
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use('/api', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
  try {
    const headers = {};
    for (const name of ['content-type', 'authorization', 'cookie']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const response = await fetch(`http://127.0.0.1:${backendPort}${req.originalUrl}`, {
      method: req.method,
      headers,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: req.body }),
      signal: AbortSignal.timeout(15000),
    });
    for (const name of ['content-type', 'retry-after']) {
      if (response.headers.has(name)) res.setHeader(name, response.headers.get(name));
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.status(502).json({
      success: false,
      message: `Không kết nối được backend. Vui lòng kiểm tra server ở cổng ${backendPort}.`,
      code: 'BACKEND_UNAVAILABLE',
      errors: [],
    });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(previewPort, '127.0.0.1', () => {
  console.log(`EcoSort AI: http://localhost:${previewPort}`);
});
