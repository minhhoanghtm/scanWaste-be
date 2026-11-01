/**
 * Cấp quyền admin cho một tài khoản ĐÃ ĐĂNG KÝ (dùng khi demo UC011–UC014).
 * API đăng ký luôn tạo role 'user' và không cho client tự đặt role, nên cần script này.
 *
 *   npm run make-admin -- email@example.com
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/modules/users/user.model');

(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Cách dùng: npm run make-admin -- email@example.com');
    process.exitCode = 1;
    return;
  }
  try {
    await mongoose.connect(env.MONGODB_URI);
    const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });
    if (!user) {
      console.error(`[make-admin] Không tìm thấy tài khoản ${email}. Hãy đăng ký trước.`);
      process.exitCode = 1;
    } else {
      console.log(`[make-admin] ${user.email} hiện có role: ${user.role}`);
    }
  } catch (error) {
    console.error('[make-admin] Lỗi:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
