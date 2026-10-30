// Run interactively on the developer's own Mac. Never pass credentials as arguments.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const envPath = path.resolve(__dirname, '../.env');

function hiddenPassword() {
  return new Promise((resolve, reject) => {
    let value = '';
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('Mật khẩu ứng dụng Google (nhập ẩn, Enter để tiếp tục): ');
    const finish = (error) => {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value.replace(/\s/g, ''));
    };
    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('CANCELLED'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') value = value.slice(0, -1);
      else if (!key.ctrl && !key.meta && str) value += str.replace(/[\r\n]/g, '');
    };
    process.stdin.on('keypress', onKey);
  });
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('TTY_REQUIRED');
  const before = fs.readFileSync(envPath, 'utf8');
  const current = dotenv.parse(before);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const fallback = current.SMTP_USER || '';
  const email = (await new Promise(resolve => rl.question(`Gmail gửi thư [${fallback}]: `, resolve))).trim() || fallback;
  rl.close();
  if (!/^[A-Za-z0-9._%+-]+@gmail\.com$/i.test(email)) throw new Error('INVALID_EMAIL');
  console.log('Sẽ kiểm tra kết nối Gmail, lưu cấu hình và gửi một email kiểm tra đến chính địa chỉ này.');
  const password = await hiddenPassword();
  if (!/^[a-z]{16}$/i.test(password)) throw new Error('APP_PASSWORD_REQUIRED');
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: email, pass: password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  try {
    await transport.verify();
    // Avoid overwriting concurrent edits to unrelated settings.
    if (fs.readFileSync(envPath, 'utf8') !== before) throw new Error('ENV_CHANGED');
    const replacements = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true',
      SMTP_USER: email, SMTP_PASS: password, SMTP_FROM: `EcoSort AI <${email}>` };
    const seen = new Set();
    const lines = before.trimEnd().split('\n').map(line => {
      const key = /^\s*(?:export\s+)?([A-Z_]+)\s*=/.exec(line)?.[1];
      if (!(key in replacements)) return line;
      seen.add(key);
      return `${key}=${replacements[key]}`;
    });
    for (const [key, value] of Object.entries(replacements)) if (!seen.has(key)) lines.push(`${key}=${value}`);
    fs.chmodSync(envPath, 0o600);
    fs.writeFileSync(envPath, lines.join('\n') + '\n', { mode: 0o600 });
    console.log('Gmail đã xác thực; đã lưu cấu hình vào .env trên máy.');
    const result = await transport.sendMail({ from: replacements.SMTP_FROM, to: email,
      subject: 'EcoSort AI — Kiểm tra gửi email',
      text: 'Đây là email kiểm tra cấu hình gửi thư của EcoSort AI. Khi bạn nhận được thư này, hãy quay lại ứng dụng để thử OTP xác minh email và đặt lại mật khẩu.' });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('RECIPIENT_REJECTED');
    console.log('Gmail SMTP đã nhận thư kiểm tra. Kiểm tra hộp thư đến/Spam trên điện thoại.');
    console.log('Khởi động lại backend để áp dụng cấu hình, sau đó bấm Gửi lại mã trong EcoSort.');
  } finally { transport.close(); }
}
main().catch(error => {
  const messages = {
    TTY_REQUIRED: 'Hãy chạy npm run mail:setup trong Terminal của bạn.',
    CANCELLED: 'Đã hủy; không lưu mật khẩu.',
    INVALID_EMAIL: 'Nhập địa chỉ Gmail hợp lệ.',
    APP_PASSWORD_REQUIRED: 'Cần Mật khẩu ứng dụng Google gồm 16 chữ cái, không dùng mật khẩu đăng nhập Gmail.',
    ENV_CHANGED: 'File .env vừa thay đổi. Chạy lại để giữ các cấu hình mới.',
    EAUTH: 'Gmail từ chối xác thực. Kiểm tra địa chỉ Gmail và Mật khẩu ứng dụng.',
    RECIPIENT_REJECTED: 'SMTP chưa chấp nhận người nhận; chưa xác nhận gửi thư thành công.',
  };
  console.error(messages[error.code] || messages[error.message] || 'Không hoàn tất kết nối/gửi thư Gmail. Kiểm tra mạng và cấu hình rồi thử lại.');
  process.exitCode = 1;
});
