process.env.SMTP_HOST = ''; // Tests never send email through the user's configured provider.
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authService = require('../../src/modules/auth/auth.service');
const { validateRegister, validateLogin } = require('../../src/modules/auth/auth.validation');
const User = require('../../src/modules/users/user.model');
const env = require('../../src/config/env');

const runValidation = (middleware, body) => {
  const req = { body: { ...body } };
  const result = { nextCalled: false };
  const res = {
    status(statusCode) {
      result.statusCode = statusCode;
      return this;
    },
    json(payload) {
      result.payload = payload;
      return payload;
    },
  };

  middleware(req, res, () => {
    result.nextCalled = true;
  });

  return { req, result };
};

const runAuthTests = async () => {
  console.log('Running Auth Module Unit Tests...');

  const validRegistration = runValidation(validateRegister, {
    name: '  Nguyen Minh Anh  ',
    email: 'MINH.ANH@EXAMPLE.COM ',
    phone: '0912 345 678',
    password: 'Password123!',
    confirmPassword: 'Password123!',
  });
  assert.equal(validRegistration.result.nextCalled, true);
  assert.equal(validRegistration.req.body.name, 'Nguyen Minh Anh');
  assert.equal(validRegistration.req.body.email, 'minh.anh@example.com');
  assert.equal(validRegistration.req.body.phone, '+84912345678');

  const invalidRegistration = runValidation(validateRegister, {
    name: 'Minh Anh',
    email: 'not-an-email',
    phone: '123',
    password: 'short',
  });
  assert.equal(invalidRegistration.result.nextCalled, false);
  assert.equal(invalidRegistration.result.statusCode, 400);
  assert.equal(invalidRegistration.result.payload.code, 'VALIDATION_ERROR');

  const emailLogin = runValidation(validateLogin, {
    identifier: ' MINH.ANH@EXAMPLE.COM ',
    password: 'Password123!',
  });
  assert.equal(emailLogin.result.nextCalled, true);
  assert.equal(emailLogin.req.body.identifier, 'minh.anh@example.com');

  const phoneLogin = runValidation(validateLogin, {
    identifier: '0912345678',
    password: 'Password123!',
  });
  assert.equal(phoneLogin.result.nextCalled, true);
  assert.equal(phoneLogin.req.body.identifier, '+84912345678');

  const duplicateIdentifierLogin = runValidation(validateLogin, {
    email: 'minh.anh@example.com',
    phone: '0912345678',
    password: 'Password123!',
  });
  assert.equal(duplicateIdentifierLogin.result.nextCalled, false);
  assert.equal(duplicateIdentifierLogin.result.statusCode, 400);

  const sessions = require('../../src/modules/auth/auth.session');
  const originalSessionCreate = sessions.create;
  sessions.create = async user => ({ token: require('../../src/utils/jwt').generateToken({ sub: String(user._id), role: user.role }) });
  const loginOtp = require('../../src/modules/auth/auth.login-otp');
  const originalLoginOtp = loginOtp.request;
  loginOtp.request = async user => ({ loginChallengeId: 'unit-test', email: user.email, status: 'pending_otp' });
  const originalFindOne = User.findOne;
  const originalCreate = User.create;

  try {
    let createdUser;
    User.findOne = async () => null;
    User.create = async (payload) => {
      createdUser = payload;
      return {
        _id: '507f1f77bcf86cd799439011',
        ...payload,
        role: 'user',
        createdAt: new Date('2026-10-27T00:00:00.000Z'),
        updatedAt: new Date('2026-10-27T00:00:00.000Z'),
      };
    };

    await assert.rejects(() => authService.register({ name: 'Test', email: 'minh.anh@example.com', phone: '0912345678', password: 'Password123!' }), { errorCode: 'EMAIL_NOT_CONFIGURED' });
    assert.equal(createdUser, undefined, 'No account before email verification');
    const savedUser = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Nguyen Minh Anh',
      email: 'minh.anh@example.com',
      phone: '+84912345678',
      password: await bcrypt.hash('Password123!', 12),
      role: 'user',
      createdAt: new Date('2026-10-27T00:00:00.000Z'),
      updatedAt: new Date('2026-10-27T00:00:00.000Z'),
    };
    User.findOne = (query) => ({
      select: async () => {
        if (query.email === savedUser.email || query.phone === savedUser.phone) {
          return savedUser;
        }
        return null;
      },
    });

    const emailLoginResult = await authService.login({
      identifier: 'minh.anh@example.com',
      password: 'Password123!',
    });
    assert.equal(emailLoginResult.email, savedUser.email);
    assert.equal(emailLoginResult.token, undefined);
    assert.equal(emailLoginResult.status, 'pending_otp');

    const phoneLoginResult = await authService.login({
      identifier: '0912345678',
      password: 'Password123!',
    });
    assert.equal(phoneLoginResult.email, savedUser.email);

    await assert.rejects(
      () => authService.login({ identifier: 'minh.anh@example.com', password: 'wrong-password' }),
      (error) => error.errorCode === 'INVALID_CREDENTIALS' && error.statusCode === 401
    );

    User.findOne = async () => ({ email: 'minh.anh@example.com' });
    await assert.rejects(
      () => authService.register({
        name: 'Other User',
        email: 'minh.anh@example.com',
        phone: '0987654321',
        password: 'Password123!',
      }),
      (error) => error.errorCode === 'EMAIL_EXISTS' && error.statusCode === 409
    );
  } finally {
    loginOtp.request = originalLoginOtp;
    sessions.create = originalSessionCreate;
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }

  console.log('✔ Auth Module unit tests passed');
};

if (require.main === module) {
  runAuthTests().catch((error) => {
    console.error('✖ Auth Module unit test failed', error);
    process.exit(1);
  });
}

module.exports = runAuthTests;
