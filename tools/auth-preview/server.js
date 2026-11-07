const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '../../package.json'));
const express = backendRequire('express');
backendRequire('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

function origin(value, name, production) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials or a path; production requires HTTPS`);
  }
  return url.origin;
}

function createPreviewApp(options = process.env) {
  const production = options.NODE_ENV === 'production';
  if (production && !options.BACKEND_URL) throw new Error('BACKEND_URL is required in production');
  const backendUrl = origin(options.BACKEND_URL || `http://127.0.0.1:${Number(options.PORT) || 5000}`, 'BACKEND_URL', production);
  const rewardsUrl = options.REWARDS_PUBLIC_URL
    ? origin(options.REWARDS_PUBLIC_URL, 'REWARDS_PUBLIC_URL', production)
    : production ? '' : 'http://localhost:8081';
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
  app.get('/runtime-config.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ rewardsUrl });
  });
  app.use(['/api', '/uploads'], express.raw({ type: () => true, limit: '6mb' }), async (req, res) => {
    try {
      const headers = {};
      for (const name of ['content-type', 'authorization', 'cookie']) {
        if (req.headers[name]) headers[name] = req.headers[name];
      }
      // Concatenation preserves the configured host even for a path starting with //.
      const response = await fetch(`${backendUrl}${req.originalUrl}`, {
        method: req.method,
        headers,
        redirect: 'manual',
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: req.body }),
        signal: AbortSignal.timeout(20000),
      });
      for (const name of ['content-type', 'retry-after', 'cache-control', 'content-disposition']) {
        if (response.headers.has(name)) res.setHeader(name, response.headers.get(name));
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      if (req.method === 'HEAD') return res.status(response.status).end();
      res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.status(502).json({ success: false, message: 'Không kết nối được máy chủ. Vui lòng thử lại.',
        code: 'BACKEND_UNAVAILABLE', errors: [] });
    }
  });
  app.use(express.static(path.join(__dirname, 'public')));
  return app;
}

if (require.main === module) {
  const production = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PREVIEW_PORT) || (production ? Number(process.env.PORT) || 10000 : 5173);
  const host = production ? '0.0.0.0' : '127.0.0.1';
  createPreviewApp().listen(port, host, () => console.log(`EcoSort web listening on port ${port}`));
}
module.exports = { createPreviewApp };
