const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const env = require('../../config/env');
const User = require('../users/user.model');
const AuthChallenge = require('./auth-challenge.model');
const authService = require('./auth.service');
const { normalizeEmail } = require('./auth.utils');
const { sendSuccess } = require('../../utils/response');

const googleClient = new OAuth2Client();
const error = (message, statusCode, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });
const random = () => crypto.randomBytes(32).toString('hex');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cookieName = (provider) => `ecosort_oauth_${provider}`;

function configuration() {
  return {
    google: { enabled: Boolean(env.GOOGLE_CLIENT_ID), clientId: env.GOOGLE_CLIENT_ID },
  };
}

function googleProvider() {
  if (!configuration().google.enabled) {
    throw error('Google sign-in is not configured', 503, 'SOCIAL_NOT_CONFIGURED');
  }
  return 'google';
}

function cookieValue(req, name) {
  return (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

async function createChallenge(req, res, next) {
  try {
    const provider = googleProvider();
    const browserSecret = random();
    const challenge = await AuthChallenge.create({
      _id: random(), provider, nonce: random(), state: random(), browserHash: hash(browserSecret),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    res.cookie(cookieName(provider), browserSecret, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.SOCIAL_PUBLIC_ORIGIN.startsWith('https://'),
      maxAge: 10 * 60 * 1000,
      path: '/api/auth/social',
    });
    return sendSuccess(res, 'Identity challenge created', {
      challengeId: challenge._id, nonce: challenge.nonce, state: challenge.state,
    });
  } catch (err) { return next(err); }
}

async function verifyGoogleIdentity(body, challenge) {
  if (typeof body.idToken !== 'string' || body.idToken.length > 16000) {
    throw error('Missing Google ID token', 400, 'VALIDATION_ERROR');
  }
  if (body.idToken.split('.').length !== 3) {
    throw error('Invalid Google ID token format', 401, 'INVALID_PROVIDER_TOKEN');
  }
  let claims;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: body.idToken, audience: env.GOOGLE_CLIENT_ID,
    });
    claims = ticket.getPayload();
  } catch {
    throw error('Google identity token could not be verified', 401, 'INVALID_PROVIDER_TOKEN');
  }
  if (!claims || typeof claims.sub !== 'string' || !claims.sub || typeof claims.exp !== 'number'
    || claims.exp <= Date.now() / 1000 || claims.nonce !== challenge.nonce) {
    throw error('Invalid identity claims or nonce', 401, 'INVALID_PROVIDER_TOKEN');
  }
  return claims;
}

async function resolveAccount(provider, claims, body, currentUser) {
  if (provider !== 'google') throw error('Unsupported identity provider', 400, 'VALIDATION_ERROR');
  const providerField = 'googleId';
  let user = await User.findOne({ [providerField]: claims.sub });
  if (user) {
    if (currentUser && !user._id.equals(currentUser._id)) {
      throw error('This identity belongs to another account', 409, 'ACCOUNT_LINK_CONFLICT');
    }
    return user;
  }

  const email = normalizeEmail(claims.email);
  if (!email || ![true, 'true'].includes(claims.email_verified)) {
    throw error('A verified provider email address is required', 401, 'PROVIDER_EMAIL_UNVERIFIED');
  }
  const existing = await User.findOne({ email });
  if (existing) {
    // Email matching alone is never enough to link a social identity.
    if (!currentUser || !existing._id.equals(currentUser._id)) {
      throw error('Sign in with your existing account before linking this identity', 409, 'ACCOUNT_LINK_REQUIRED');
    }
    user = await User.findOneAndUpdate({
      _id: existing._id, [providerField]: { $exists: false },
    }, { $set: { [providerField]: claims.sub, emailVerified: true } }, { new: true, runValidators: true });
    if (!user) throw error('A different identity is already linked', 409, 'ACCOUNT_LINK_CONFLICT');
    return user;
  }
  if (currentUser) {
    throw error('Use an identity with the same verified email as your current account', 409, 'ACCOUNT_LINK_CONFLICT');
  }

  const submittedName = claims.name;
  const name = typeof submittedName === 'string' && submittedName.trim()
    ? submittedName.trim().slice(0, 100) : 'Thành viên EcoSort';
  try {
    user = await User.create({ name, email, [providerField]: claims.sub, emailVerified: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
    user = await User.findOne({ [providerField]: claims.sub });
    if (!user) throw error('The email is already registered; sign in before linking', 409, 'ACCOUNT_LINK_REQUIRED');
  }
  return user;
}

async function socialLogin(req, res, next) {
  try {
    const provider = googleProvider();
    const body = req.body || {};
    if (typeof body.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(body.challengeId)
      || typeof body.state !== 'string') {
      throw error('Invalid identity challenge', 400, 'VALIDATION_ERROR');
    }
    const browserSecret = cookieValue(req, cookieName(provider));
    const challenge = await AuthChallenge.findOne({
      _id: body.challengeId, provider, browserHash: hash(browserSecret), expiresAt: { $gt: new Date() },
    });
    if (!browserSecret || !challenge || challenge.state !== body.state) {
      throw error('Identity challenge expired or belongs to another browser', 401, 'SOCIAL_CHALLENGE_INVALID');
    }
    const claims = await verifyGoogleIdentity(body, challenge);
    const consumed = await AuthChallenge.findOneAndDelete({
      _id: challenge._id, browserHash: challenge.browserHash, expiresAt: { $gt: new Date() },
    });
    if (!consumed) throw error('Identity challenge was already used', 401, 'SOCIAL_CHALLENGE_INVALID');
    const user = await resolveAccount(provider, claims, body, req.user);
    res.clearCookie(cookieName(provider), { path: '/api/auth/social' });
    return sendSuccess(res, 'Social login successful', authService.createSession(user));
  } catch (err) { return next(err); }
}

module.exports = { configuration, createChallenge, socialLogin, resolveAccount };
