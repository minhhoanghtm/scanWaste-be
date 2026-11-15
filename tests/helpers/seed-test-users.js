require('../../src/config/env');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../src/modules/users/user.model');
const { generateToken } = require('../../src/utils/jwt');
const authSession = require('../../src/modules/auth/auth.session');

async function seedTestUsers() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  }

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  const testAccounts = [
    {
      name: 'Nguyễn Văn Test',
      email: 'user.test@scanwaste.vn',
      role: 'user',
      isActive: true,
      password: hashedPassword,
      totalPoints: 200,
    },
    {
      name: 'Trần Quản Trị',
      email: 'admin.test@scanwaste.vn',
      role: 'admin',
      isActive: true,
      password: hashedPassword,
      totalPoints: 500,
    },
    {
      name: 'Lê Nhân Viên',
      email: 'staff.test@scanwaste.vn',
      role: 'staff',
      isActive: true,
      password: hashedPassword,
      totalPoints: 100,
    },
    {
      name: 'Tài Khoản Bị Khóa',
      email: 'locked.test@scanwaste.vn',
      role: 'user',
      isActive: false,
      password: hashedPassword,
      totalPoints: 0,
    },
  ];

  const results = {};

  for (const acc of testAccounts) {
    let user = await User.findOne({ email: acc.email });
    if (!user) {
      user = await User.create(acc);
    } else {
      user.name = acc.name;
      user.role = acc.role;
      user.isActive = acc.isActive;
      user.password = acc.password;
      user.totalPoints = acc.totalPoints;
      await user.save();
    }

    const session = await authSession.create(user);
    const token = session.token;

    results[acc.email] = {
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        totalPoints: user.totalPoints,
        availablePoints: user.totalPoints,
      },
      token,
      refreshToken: session.refreshToken,
    };
  }

  return results;
}

if (require.main === module) {
  seedTestUsers().then((res) => {
    console.log('SEED TEST USERS COMPLETE:');
    console.log(JSON.stringify(res, null, 2));
    mongoose.disconnect();
  });
}

module.exports = { seedTestUsers };
