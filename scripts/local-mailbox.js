// Development-only SMTP inbox. Emails stay on this computer and are never forwarded.
const { SMTPServer } = require('smtp-server');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
if (process.env.NODE_ENV === 'production') throw new Error('Local mailbox is disabled in production');
const directory = path.resolve(__dirname, '../local-mailbox');
const port = Number(process.env.LOCAL_SMTP_PORT || 2526);
const server = new SMTPServer({ logger: false, size: 1024 * 1024,
  disabledCommands: ['AUTH', 'STARTTLS'],
  onData(stream, session, done) {
    const parts = [];
    stream.on('data', chunk => parts.push(chunk));
    stream.on('error', done);
    stream.on('end', async () => {
      if (stream.sizeExceeded) return done(new Error('Message too large'));
      try {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        const file = path.join(directory, `${Date.now()}-${randomUUID()}.eml`);
        await fs.writeFile(file, Buffer.concat(parts), { flag: 'wx', mode: 0o600 });
        console.log(`Local email saved: ${file}`); // Never print OTP/email body.
        done();
      } catch (error) { done(error); }
    });
  },
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local-only SMTP on 127.0.0.1:${port}; open .eml messages in ${directory}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
