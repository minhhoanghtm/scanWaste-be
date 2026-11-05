const $ = (selector) => document.querySelector(selector);
let accessToken = null;
let refreshToken = null;
let refreshing = null;
let authGeneration = 0;
let toastTimer;
let signedInProfile = null;
let resetEmail = '';
let pendingRegistration = null;
let pendingLogin = null;
const resendDeadlines = {};
const memberScreens = ['home', 'profile', 'lookup', 'scan', 'history', 'detail', 'activity', 'wallet', 'statistics', 'stations', 'rewards'];

const messageForCode = {
  INVALID_OTP: 'Mã không đúng, đã hết hạn hoặc đã được sử dụng. Vui lòng kiểm tra email hoặc gửi lại mã.',
  OTP_COOLDOWN: 'Vui lòng đợi trước khi yêu cầu mã mới.',
  EMAIL_NOT_CONFIGURED: 'Chưa gửi được email. Vui lòng thử lại sau.',
  AUTH_STORE_UNAVAILABLE: 'Dịch vụ đăng nhập tạm gián đoạn. Vui lòng thử lại sau.',
  SESSION_REVOKED: 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  REFRESH_TOKEN_REUSED: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.',
  EMAIL_EXISTS: 'Email này đã được đăng ký. Vui lòng dùng email khác hoặc đăng nhập.',
  PHONE_EXISTS: 'Số điện thoại này đã được đăng ký.',
  INVALID_CREDENTIALS: 'Email/SĐT hoặc mật khẩu không chính xác.',
  WEAK_PASSWORD: 'Mật khẩu cần ít nhất 8 ký tự và không quá 72 byte.',
  TOO_MANY_REQUESTS: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  UNAUTHORIZED: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  SOCIAL_NOT_CONFIGURED: 'Đăng nhập này cần được cấu hình với Google trước khi sử dụng.',
  INVALID_PROVIDER_TOKEN: 'Không xác minh được tài khoản Google. Vui lòng thử đăng nhập lại.',
  SOCIAL_CHALLENGE_INVALID: 'Lượt xác thực đã hết hạn. Vui lòng chọn đăng nhập lại.',
  ACCOUNT_LINK_REQUIRED: 'Email đã có tài khoản. Hãy đăng nhập bằng mật khẩu, rồi liên kết Google trong Hồ sơ.',
  ACCOUNT_LINK_CONFLICT: 'Không thể liên kết: tài khoản hoặc email không khớp.',
  PROVIDER_EMAIL_UNVERIFIED: 'Google chưa cung cấp email đã xác minh cho ứng dụng.',
};

function toast(text) {
  clearTimeout(toastTimer);
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function showScreen(name) {
  if (memberScreens.includes(name) && !accessToken) name = 'login';
  if (name === 'verify' && !accessToken && !pendingRegistration && !pendingLogin) name = 'login';
  if (!$(`#${name}-screen`)) return;
  document.querySelectorAll('.screen').forEach((screen) => { screen.hidden = screen.id !== `${name}-screen`; });
  $('#member-nav').hidden = !memberScreens.includes(name);
  document.querySelectorAll('#member-nav [data-screen]').forEach((button) => {
    if (button.dataset.screen === ({ history: 'home', detail: 'home', activity: 'home', statistics: 'home', stations: 'lookup', wallet: 'profile' }[name] || name)) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const titles = { login: 'Đăng nhập', register: 'Đăng ký', home: 'Trang chủ', profile: 'Hồ sơ', verify: 'Xác minh email', forgot: 'Quên mật khẩu', reset: 'Đặt lại mật khẩu', lookup: 'Tra cứu rác', scan: 'Quét AI', history: 'Lịch sử quét', detail: 'Chi tiết', activity: 'Lịch sử điểm', wallet: 'Ví voucher', statistics: 'Thống kê', stations: 'Điểm thu gom', rewards: 'Quà tặng' };
  document.title = `EcoSort AI · ${titles[name]}`;
  if (name === 'profile') loadMemberProfile();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector(`#${name}-screen h1`)?.setAttribute('tabindex', '-1');
  document.querySelector(`#${name}-screen h1`)?.focus({ preventScroll: true });
  window.dispatchEvent(new CustomEvent('ecosort-screen', { detail: name }));
}

function showMessage(target, message, success = false) {
  const element = $(target);
  element.textContent = message;
  element.classList.toggle('success', success);
  element.hidden = !message;
}

function setFieldError(id, text) {
  $(`#${id}-error`).textContent = text;
  $(`#${id}`).setAttribute('aria-invalid', String(Boolean(text)));
  return !text;
}

function normalizePhone(value) {
  const clean = value.replace(/[\s().-]/g, '');
  if (/^0[35789]\d{8}$/.test(clean)) return `+84${clean.slice(1)}`;
  if (/^[35789]\d{8}$/.test(clean)) return `+84${clean}`;
  if (/^84[35789]\d{8}$/.test(clean)) return `+${clean}`;
  return /^\+84[35789]\d{8}$/.test(clean) ? clean : null;
}

function validateRegisterField(id) {
  const value = $(`#${id}`).value;
  let error = '';
  if (id === 'register-name' && (!value.trim() || value.trim().length > 100)) error = 'Vui lòng nhập họ tên (tối đa 100 ký tự).';
  if (id === 'register-email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) || value.trim().length > 254)) error = 'Vui lòng nhập địa chỉ email hợp lệ.';
  if (id === 'register-phone' && !normalizePhone(value)) error = 'Vui lòng nhập SĐT di động Việt Nam hợp lệ.';
  if (id === 'register-password' && (value.length < 8 || !value.trim() || new TextEncoder().encode(value).length > 72)) error = 'Mật khẩu cần ít nhất 8 ký tự, tối đa 72 byte UTF-8.';
  if (id === 'register-confirm' && (!value || value !== $('#register-password').value)) error = 'Mật khẩu xác nhận chưa khớp.';
  return setFieldError(id, error);
}

function updateStrength() {
  const password = $('#register-password').value;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password) || password.length >= 14) score++;
  if (password.length < 8 && password) score = 1;
  if (password && score === 0) score = 1;
  $('#strength-bars').dataset.score = String(score);
  $('#strength-label').textContent = password ? ['Yếu', 'Yếu', 'Trung bình', 'Khá mạnh', 'Mạnh'][score] : 'Chưa nhập';
}

async function api(path, body, retry = true, method = body === undefined ? 'GET' : 'POST') {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('Không thể kết nối máy chủ. Kiểm tra kết nối rồi thử lại.');
  }
  const payload = await response.json();
  if (response.status === 401 && payload.code === 'TOKEN_EXPIRED' && refreshToken && retry) {
    if (!refreshing) {
      const generation = authGeneration;
      refreshing = api('/auth/refresh', { refreshToken }, false).then(data => {
        if (generation !== authGeneration) throw new Error('Phiên đã thay đổi. Vui lòng đăng nhập lại.');
        accessToken = data.token; refreshToken = data.refreshToken;
      }).catch(error => { if (generation === authGeneration) clearAuthentication(); throw error; })
        .finally(() => { refreshing = null; });
    }
    await refreshing;
    return api(path, body, false, method);
  }
  if (!response.ok) {
    const error = new Error(messageForCode[payload.code] || payload.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    error.code = payload.code;
    error.retryAfter = Number(response.headers.get('retry-after')) || 60;
    throw error;
  }
  return payload.data;
}

function fillProfile(user) {
  signedInProfile = user;
  window.dispatchEvent(new CustomEvent('ecosort-profile', { detail: user }));
  $('#profile-email-status').textContent = user.emailVerified ? 'Đã xác minh' : 'Chưa xác minh';
  $('#profile-verify').hidden = Boolean(user.emailVerified);
  $('#profile-name').textContent = user.name;
  $('#profile-email').textContent = user.email;
  $('#profile-phone').textContent = user.phone || 'Chưa cập nhật';
  $('#profile-role').textContent = user.role === 'admin' ? 'Quản trị viên' : 'Thành viên EcoSort';
  renderAvatar($('#profile-avatar'), user);
  $('#home-name').textContent = user.name;
  renderAvatar($('#home-avatar'), user);
  $('#remove-avatar').hidden = !user.avatarUrl;
  for (const field of ['availablePoints', 'totalPoints', 'spentPoints']) {
    const id = { availablePoints: 'available', totalPoints: 'total', spentPoints: 'spent' }[field];
    $(`#profile-${id}-points`).textContent = new Intl.NumberFormat('vi-VN').format(user[field] || 0);
  }
  $('#profile-created').textContent = user.createdAt ? new Intl.DateTimeFormat('vi-VN').format(new Date(user.createdAt)) : 'Chưa có thông tin';
  $('#profile-session').textContent = 'Đã xác thực';
  showMessage('#profile-message', '');
}

async function completeAuthentication(data, registered, destination = 'home') {
  authGeneration++;
  accessToken = data.token;
  refreshToken = data.refreshToken;
  // Verify the issued JWT through the protected profile endpoint as well.
  const profile = await api('/users/me');
  fillProfile(profile);
  $('#home-auth-message').textContent = registered
    ? 'Bạn đã tạo tài khoản thành công. Hành trình xanh bắt đầu!'
    : 'Bạn đã đăng nhập thành công.';
  showMessage('#home-message', '');
  if (!profile.emailVerified) openVerification(registered ? data.emailVerification?.delivery : undefined);
  else showScreen(destination);
}

function loading(button, state, idleText) {
  button.disabled = state;
  button.setAttribute('aria-busy', String(state));
  button.querySelector('span').textContent = state ? 'Đang xử lý…' : idleText;
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('#login-message', '');
  const identifier = $('#login-identifier').value.trim();
  const password = $('#login-password').value;
  const identifierValid = setFieldError('login-identifier', identifier ? '' : 'Nhập email hoặc số điện thoại của bạn.');
  const passwordValid = setFieldError('login-password', password ? '' : 'Nhập mật khẩu của bạn.');
  if (!identifierValid || !passwordValid) return;
  loading($('#login-submit'), true, 'Đăng nhập');
  try {
    const data = await api('/auth/login', { identifier, password });
    try {
      if ($('#remember').checked) localStorage.setItem('ecosort-remembered-identifier', identifier);
      else localStorage.removeItem('ecosort-remembered-identifier');
    } catch { /* Storage may be unavailable in private browsing. */ }
    clearAuthentication();
    pendingLogin = data;
    openVerification('sent');
    $('#login-password').value = '';
  } catch (error) {
    accessToken = null;
    showMessage('#login-message', error.message);
  } finally { loading($('#login-submit'), false, 'Đăng nhập'); }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('#register-message', '');
  const ids = ['register-name', 'register-email', 'register-phone', 'register-password', 'register-confirm'];
  const valid = ids.map(validateRegisterField).every(Boolean);
  if (!valid) { document.querySelector('#register-form [aria-invalid=true]')?.focus(); return; }
  if (!$('#terms').checked) { showMessage('#register-message', 'Vui lòng đồng ý Điều khoản và Chính sách để tiếp tục.'); return; }
  loading($('#register-submit'), true, 'Tạo tài khoản & Bắt đầu');
  try {
    const data = await api('/auth/register', {
      name: $('#register-name').value.trim(),
      email: $('#register-email').value.trim(),
      phone: normalizePhone($('#register-phone').value),
      password: $('#register-password').value,
      confirmPassword: $('#register-confirm').value,
    });
    clearAuthentication();
    pendingRegistration = data;
    openVerification('sent');
    $('#register-form').reset();
    updateStrength();
  } catch (error) {
    clearAuthentication();
    showMessage('#register-message', error.message);
    if (error.code === 'EMAIL_EXISTS') setFieldError('register-email', 'Email đã được đăng ký.');
    if (error.code === 'PHONE_EXISTS') setFieldError('register-phone', 'Số điện thoại đã được đăng ký.');
  } finally {
    loading($('#register-submit'), false, 'Tạo tài khoản & Bắt đầu');
    $('#register-submit').disabled = !$('#terms').checked;
  }
});

document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document.querySelectorAll('[data-notice]').forEach((button) => button.addEventListener('click', () => toast(button.dataset.notice)));
document.querySelectorAll('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
  const input = $(`#${button.dataset.toggle}`);
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  button.setAttribute('aria-pressed', String(visible));
}));
document.querySelectorAll('#register-form input[required]').forEach((input) => {
  input.addEventListener('blur', () => validateRegisterField(input.id));
  input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') validateRegisterField(input.id); });
});
$('#register-password').addEventListener('input', updateStrength);
$('#terms').addEventListener('change', () => { $('#register-submit').disabled = !$('#terms').checked; });
function clearAuthentication() {
  authGeneration++;
  accessToken = null; refreshToken = null; signedInProfile = null; pendingRegistration = null; pendingLogin = null;
  $('#login-password').value = '';
  $('#verify-otp').value = '';
  resetProfilePanels();
  window.dispatchEvent(new Event('ecosort-logout'));
}
async function logout(all = false) {
  const button = all ? $('#logout-all') : $('#logout');
  button.disabled = true;
  try {
    if (refreshing) await refreshing;
    await api(all ? '/auth/logout-all' : '/auth/logout', {});
    clearAuthentication();
    showMessage('#login-message', all ? 'Bạn đã đăng xuất trên tất cả thiết bị.' : 'Bạn đã đăng xuất.', true);
    showScreen('login');
  } catch (error) {
    if (['SESSION_REVOKED', 'UNAUTHORIZED', 'INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_REUSED'].includes(error.code)) {
      clearAuthentication(); showScreen('login'); showMessage('#login-message', error.message);
    } else showMessage($('#verify-screen').hidden ? '#profile-message' : '#verify-message', error.message);
  } finally { button.disabled = false; }
}
$('#logout').addEventListener('click', () => logout());
$('#logout-all').addEventListener('click', () => logout(true));
$('#verify-back').addEventListener('click', () => {
  if (pendingRegistration) { clearAuthentication(); showScreen('register'); }
  else if (pendingLogin) { clearAuthentication(); showScreen('login'); }
  else logout();
});
$('#refresh-profile').addEventListener('click', loadMemberProfile);

try { $('#login-identifier').value = localStorage.getItem('ecosort-remembered-identifier') || ''; } catch {}
async function checkConnection() {
  try {
    const data = await api('/health');
    const connected = data.database === 'connected';
    $('#connection').className = `connection ${connected ? 'online' : 'offline'}`;
    $('#connection-label').textContent = connected ? 'Backend & MongoDB đã kết nối' : 'Chưa kết nối MongoDB';
  } catch {
    $('#connection').className = 'connection offline';
    $('#connection-label').textContent = 'Backend chưa kết nối';
  }
}
checkConnection();
setInterval(checkConnection, 30000);

let socialConfig;
let googleChallenge;
let socialBusy = false;

function socialMessage(message) {
  const target = !$('#profile-screen').hidden ? '#profile-message'
    : !$('#home-screen').hidden ? '#home-message'
    : !$('#register-screen').hidden ? '#register-message' : '#login-message';
  showMessage(target, message);
}

function showSocialSetup() {
  $('#social-setup-title').textContent = 'Kết nối tài khoản Google';
  $('#social-setup-description').textContent = `Tạo OAuth Client loại Web application trong Google Cloud, khai báo origin ${location.origin} rồi cấu hình GOOGLE_CLIENT_ID trong file .env của backend.`;
  $('#social-setup-link').href = 'https://console.cloud.google.com/auth/clients';
  $('#social-setup-link').textContent = 'Mở Google Cloud Console ↗';
  $('#social-setup').showModal();
}

$('#close-setup').addEventListener('click', () => $('#social-setup').close());

function loadProviderScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Không tải được Google. Kiểm tra kết nối mạng hoặc trình chặn quảng cáo.'));
    document.head.append(script);
  });
}

async function finishGoogleLogin(payload) {
  if (socialBusy) return;
  socialBusy = true;
  const destination = !$('#profile-screen').hidden && accessToken ? 'profile' : 'home';
  socialMessage('');
  try {
    const data = await api('/auth/social/google', {
      ...payload, challengeId: googleChallenge.challengeId, state: googleChallenge.state,
    });
    await completeAuthentication(data, false, destination);
    toast('Đã xác thực Google và lưu tài khoản.');
  } catch (error) { socialMessage(error.message); }
  finally {
    socialBusy = false;
    try { await renewGoogleChallenge(); }
    catch (error) { socialMessage(error.message); }
  }
}

async function renewGoogleChallenge() {
  googleChallenge = await api('/auth/social/google/challenge', {});
  google.accounts.id.initialize({
    client_id: socialConfig.google.clientId,
    nonce: googleChallenge.nonce,
    callback: (response) => finishGoogleLogin({ idToken: response.credential }),
    auto_select: false,
  });
  document.querySelectorAll('[data-google-container]').forEach((container) => {
    container.replaceChildren();
    const availableWidth = container.parentElement.clientWidth || $('.app-shell').clientWidth - 48;
    google.accounts.id.renderButton(container, {
      type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with',
      width: Math.max(160, Math.min(350, availableWidth)), locale: 'vi',
    });
  });
}

async function initializeSocial() {
  document.querySelectorAll('.social-row .social-button').forEach((button) => {
    button.dataset.social = 'google';
    button.disabled = false;
    button.removeAttribute('title');
    button.addEventListener('click', () => {
      if (!socialConfig) return socialMessage('Chưa lấy được cấu hình máy chủ. Vui lòng thử tải lại trang.');
      showSocialSetup();
    });
  });
  try {
    socialConfig = await api('/auth/social/config');
    if (socialConfig.google.enabled) {
      await loadProviderScript('https://accounts.google.com/gsi/client');
      document.querySelectorAll('[data-social="google"]').forEach((button) => {
        const container = document.createElement('div');
        container.className = 'google-container';
        container.dataset.googleContainer = '';
        button.replaceWith(container);
      });
      await renewGoogleChallenge();
    }
  } catch (error) { socialMessage(error.message); }
}
initializeSocial();

function startCooldown(buttonId, seconds = 60) {
  resendDeadlines[buttonId] = Date.now() + seconds * 1000;
  updateCooldowns();
}
function updateCooldowns() {
  for (const [id, deadline] of Object.entries(resendDeadlines)) {
    const button = $('#' + id);
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    button.disabled = seconds > 0;
    button.textContent = seconds > 0 ? `Gửi lại mã sau ${seconds}s` : 'Gửi lại mã';
    if (!seconds) delete resendDeadlines[id];
  }
}
setInterval(updateCooldowns, 1000);
function openVerification(delivery) {
  if (!signedInProfile && !pendingRegistration && !pendingLogin) return;
  $('#verify-heading').textContent = pendingRegistration ? 'Xác nhận đăng ký' : pendingLogin ? 'Xác nhận đăng nhập' : 'Xác minh email';
  $('#verify-back').setAttribute('aria-label', pendingRegistration ? 'Về đăng ký' : 'Về đăng nhập');
  $('#verify-email').textContent = pendingRegistration?.email || pendingLogin?.email || signedInProfile.email;
  $('#verify-otp').value = '';
  showMessage('#verify-message', delivery === 'sent' ? (pendingRegistration ? 'Đã gửi mã đến email của bạn. Nhập đúng mã để hoàn tất đăng ký; tài khoản chưa được tạo.' : pendingLogin ? 'Đã gửi mã đến email của tài khoản. Nhập đúng mã để hoàn tất đăng nhập.' : 'Mã xác minh đã được gửi. Vui lòng kiểm tra email.')
    : delivery === 'failed' || delivery === 'not_configured' ? 'Chưa gửi được mã. Bạn có thể yêu cầu gửi lại.'
    : 'Nhấn Gửi mã xác minh nếu bạn chưa nhận được mã.', delivery === 'sent');
  if (delivery === 'sent') startCooldown('verify-resend', pendingRegistration?.resendAfter || pendingLogin?.resendAfter || 60);
  showScreen('verify');
}
$('#profile-verify').addEventListener('click', () => openVerification());
$('#verify-resend').addEventListener('click', async () => {
  const button = $('#verify-resend'); button.disabled = true;
  try {
    const result = pendingRegistration
      ? await api('/auth/register/resend', { registrationId: pendingRegistration.registrationId })
      : pendingLogin ? await api('/auth/login/resend', { loginChallengeId: pendingLogin.loginChallengeId })
      : await api('/auth/email/send-otp', {});
    if (result.alreadyVerified) { fillProfile(await api('/users/me')); showScreen('home'); return; }
    startCooldown('verify-resend');
    showMessage('#verify-message', 'Đã gửi mã mới. Vui lòng kiểm tra email.', true);
  } catch (error) {
    if (error.code === 'OTP_COOLDOWN' || error.code === 'TOO_MANY_REQUESTS') startCooldown('verify-resend', error.retryAfter);
    showMessage('#verify-message', error.message);
  } finally { if (!resendDeadlines['verify-resend']) button.disabled = false; }
});
$('#verify-form').addEventListener('submit', async event => {
  event.preventDefault();
  const otp = $('#verify-otp').value.trim();
  if (!/^\d{6}$/.test(otp)) return showMessage('#verify-message', 'Vui lòng nhập mã gồm 6 số.');
  loading($('#verify-submit'), true, 'Xác minh & tiếp tục');
  try {
    if (pendingRegistration) {
      const data = await api('/auth/register/verify', { registrationId: pendingRegistration.registrationId, otp });
      pendingRegistration = null;
      await completeAuthentication(data, true);
      toast('Đăng ký thành công!');
    } else if (pendingLogin) {
      const data = await api('/auth/login/verify', { loginChallengeId: pendingLogin.loginChallengeId, otp });
      pendingLogin = null;
      await completeAuthentication(data, false);
      toast('Đăng nhập thành công!');
    } else {
      await api('/auth/email/verify', { otp });
      fillProfile(await api('/users/me'));
      showScreen('home'); toast('Email đã được xác minh.');
    }
    $('#verify-otp').value = '';
  } catch (error) { showMessage('#verify-message', error.message); }
  finally { loading($('#verify-submit'), false, 'Xác minh & tiếp tục'); }
});
$('#open-forgot').addEventListener('click', () => {
  const identifier = $('#login-identifier').value.trim();
  $('#forgot-email').value = identifier.includes('@') ? identifier : '';
  showMessage('#forgot-message', ''); showScreen('forgot');
});
$('#forgot-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#forgot-email').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showMessage('#forgot-message', 'Vui lòng nhập email hợp lệ.');
  loading($('#forgot-submit'), true, 'Gửi mã xác nhận');
  try {
    await api('/auth/password/forgot', { email });
    resetEmail = email; $('#reset-email').textContent = email;
    $('#reset-form').reset(); showMessage('#reset-message', '');
    startCooldown('reset-resend'); showScreen('reset');
  } catch (error) { showMessage('#forgot-message', error.message); }
  finally { loading($('#forgot-submit'), false, 'Gửi mã xác nhận'); }
});
$('#reset-resend').addEventListener('click', async () => {
  const button = $('#reset-resend'); button.disabled = true;
  try {
    await api('/auth/password/forgot', { email: resetEmail });
    startCooldown('reset-resend');
    showMessage('#reset-message', 'Nếu tài khoản hợp lệ, mã mới sẽ được gửi đến email của bạn.', true);
  } catch (error) {
    if (error.code === 'OTP_COOLDOWN' || error.code === 'TOO_MANY_REQUESTS') startCooldown('reset-resend', error.retryAfter);
    showMessage('#reset-message', error.message);
  } finally { if (!resendDeadlines['reset-resend']) button.disabled = false; }
});
$('#reset-form').addEventListener('submit', async event => {
  event.preventDefault();
  const otp = $('#reset-otp').value.trim();
  const password = $('#reset-password').value;
  const confirmPassword = $('#reset-confirm').value;
  if (!/^\d{6}$/.test(otp)) return showMessage('#reset-message', 'Vui lòng nhập mã gồm 6 số.');
  if (password.length < 8 || !password.trim() || new TextEncoder().encode(password).length > 72)
    return showMessage('#reset-message', 'Mật khẩu cần ít nhất 8 ký tự và không quá 72 byte.');
  if (password !== confirmPassword) return showMessage('#reset-message', 'Mật khẩu xác nhận chưa khớp.');
  loading($('#reset-submit'), true, 'Lưu mật khẩu mới');
  try {
    await api('/auth/password/reset', { email: resetEmail, otp, password, confirmPassword });
    clearAuthentication(); $('#reset-form').reset();
    $('#login-identifier').value = resetEmail;
    showScreen('login');
    showMessage('#login-message', 'Đã đổi mật khẩu và đăng xuất các phiên cũ. Hãy đăng nhập bằng mật khẩu mới.', true);
  } catch (error) { showMessage('#reset-message', error.message); }
  finally { loading($('#reset-submit'), false, 'Lưu mật khẩu mới'); }
});


// Profile uses the same authenticated backend and MongoDB as the rest of the app.
let profileRequest = 0;
let historyRequest = 0;
let walletRequest = 0;
let historyPage = 1;
let historyHasNext = false;
let profileSaving = false;
const formatPoints = value => new Intl.NumberFormat('vi-VN').format(value);
const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa có ngày';

function renderAvatar(element, user) {
  element.replaceChildren();
  if (/^\/uploads\/avatars\/[a-f0-9-]+\.(png|jpg|webp)$/.test(user.avatarUrl || '')) {
    const image = document.createElement('img');
    image.src = user.avatarUrl;
    image.alt = `Ảnh đại diện của ${user.name}`;
    element.append(image);
  } else element.textContent = user.name.trim().split(/\s+/).at(-1)?.slice(0, 1).toUpperCase() || 'E';
}

function resetProfilePanels() {
  profileRequest++; historyRequest++; walletRequest++;
  $('#profile-edit-form').hidden = true;
  $('#avatar-input').value = '';
  for (const panel of ['point-history', 'wallet']) {
    $(`#${panel}-panel`).hidden = true;
    $(`#${panel}-list`).replaceChildren();
    document.querySelector(`[data-profile-panel="${panel}"]`).setAttribute('aria-expanded', 'false');
  }
  $('#profile-avatar').replaceChildren();
  historyPage = 1;
}

function profileError(error, target = '#profile-message') {
  if (['TOKEN_EXPIRED', 'UNAUTHORIZED', 'SESSION_REVOKED', 'REFRESH_TOKEN_REUSED', 'INVALID_REFRESH_TOKEN'].includes(error.code)) {
    clearAuthentication(); showScreen('login'); showMessage('#login-message', error.message);
  } else showMessage(target, error.message);
}

async function loadMemberProfile() {
  if (!accessToken) return;
  const generation = authGeneration;
  const requestId = ++profileRequest;
  $('#refresh-profile').disabled = true;
  try {
    const user = await api('/users/me');
    if (generation !== authGeneration || requestId !== profileRequest) return;
    fillProfile(user);
    if (!$('#point-history-panel').hidden) loadPointHistory();
    if (!$('#wallet-panel').hidden) loadWallet();
  } catch (error) {
    if (generation === authGeneration && requestId === profileRequest) profileError(error);
  } finally { if (requestId === profileRequest) $('#refresh-profile').disabled = false; }
}

$('#edit-profile').addEventListener('click', () => {
  if (!signedInProfile) return;
  for (const field of ['name', 'email', 'phone']) $(`#edit-${field}`).value = signedInProfile[field] || '';
  showMessage('#edit-profile-message', '');
  $('#profile-edit-form').hidden = false;
  $('#edit-name').focus();
});
$('#cancel-edit').addEventListener('click', () => {
  $('#profile-edit-form').hidden = true;
  $('#edit-profile').focus();
});
$('#profile-edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (profileSaving) return;
  const name = $('#edit-name').value.trim();
  const email = $('#edit-email').value.trim();
  const rawPhone = $('#edit-phone').value.trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : '';
  if (!name || name.length > 100) return showMessage('#edit-profile-message', 'Họ tên cần từ 1 đến 100 ký tự.');
  if (rawPhone && !phone) return showMessage('#edit-profile-message', 'Số điện thoại Việt Nam chưa hợp lệ.');
  const generation = authGeneration;
  profileSaving = true;
  loading($('#save-profile'), true, 'Lưu thay đổi');
  showMessage('#edit-profile-message', '');
  try {
    const user = await api('/users/me', { name, email, phone }, true, 'PATCH');
    if (generation !== authGeneration) return;
    fillProfile(user);
    $('#profile-edit-form').hidden = true;
    $('#edit-profile').focus();
    showMessage('#profile-message', 'Đã lưu thông tin cá nhân.', true);
  } catch (error) { if (generation === authGeneration) profileError(error, '#edit-profile-message'); }
  finally { profileSaving = false; loading($('#save-profile'), false, 'Lưu thay đổi'); }
});
$('#choose-avatar').addEventListener('click', () => $('#avatar-input').click());
let avatarSaving = false;
async function updateAvatar(file) {
  if (avatarSaving) return;
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
    return showMessage('#profile-message', 'Chọn ảnh JPG, PNG hoặc WEBP, tối đa 5 MB.');
  }
  const generation = authGeneration;
  avatarSaving = true;
  $('#choose-avatar').disabled = $('#remove-avatar').disabled = true;
  showMessage('#profile-message', 'Đang lưu ảnh đại diện…', true);
  try {
    const body = file ? new FormData() : undefined;
    if (file) body.append('avatar', file);
    const user = await api('/users/me/avatar', body, true, file ? 'POST' : 'DELETE');
    if (generation !== authGeneration) return;
    fillProfile(user);
    showMessage('#profile-message', file ? 'Đã lưu ảnh đại diện.' : 'Đã xóa ảnh đại diện.', true);
  } catch (error) { if (generation === authGeneration) profileError(error); }
  finally {
    avatarSaving = false;
    $('#choose-avatar').disabled = $('#remove-avatar').disabled = false;
    $('#avatar-input').value = '';
  }
}
$('#avatar-input').addEventListener('change', () => { const file = $('#avatar-input').files[0]; if (file) updateAvatar(file); });
$('#remove-avatar').addEventListener('click', () => updateAvatar(null));

document.querySelectorAll('[data-profile-panel]').forEach(button => button.addEventListener('click', () => {
  const panel = $(`#${button.dataset.profilePanel}-panel`);
  panel.hidden = !panel.hidden;
  button.setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) {
    if (button.dataset.profilePanel === 'point-history') { historyPage = 1; loadPointHistory(); }
    else loadWallet();
  }
}));
function activityRow(title, subtitle, value, className = '') {
  const item = document.createElement('li');
  const content = document.createElement('div');
  const heading = document.createElement('strong'); heading.textContent = title;
  const note = document.createElement('small'); note.textContent = subtitle;
  content.append(heading, note);
  const amount = document.createElement('span'); amount.textContent = value; amount.className = className;
  item.append(content, amount);
  return item;
}
async function loadPointHistory() {
  const generation = authGeneration;
  const requestId = ++historyRequest;
  $('#history-prev').disabled = $('#history-next').disabled = true;
  $('#point-history-list').replaceChildren();
  $('#history-page').textContent = '';
  showMessage('#point-history-message', 'Đang tải lịch sử…', true);
  try {
    const data = await api(`/users/me/points/history?page=${historyPage}&limit=10&type=${$('#point-history-filter').value}`);
    if (generation !== authGeneration || requestId !== historyRequest) return;
    for (const item of data.items) {
      const earned = item.type === 'earned';
      $('#point-history-list').append(activityRow(
        `${earned ? 'Tích điểm' : 'Đổi quà'} · ${item.title || 'Hoạt động xanh'}`,
        formatDate(item.occurredAt), `${earned ? '+' : ''}${formatPoints(item.points)} điểm`, earned ? 'points-earned' : 'points-redeemed'
      ));
    }
    showMessage('#point-history-message', data.items.length ? '' : 'Bạn chưa có giao dịch điểm trong mục này.', true);
    $('#history-page').textContent = data.pagination.totalCount ? `${historyPage} / ${data.pagination.totalPages}` : '0 giao dịch';
    historyHasNext = data.pagination.hasNextPage;
    $('#history-prev').disabled = !data.pagination.hasPrevPage;
    $('#history-next').disabled = !historyHasNext;
  } catch (error) { if (generation === authGeneration && requestId === historyRequest) profileError(error, '#point-history-message'); }
}
$('#point-history-filter').addEventListener('change', () => { historyPage = 1; loadPointHistory(); });
$('#history-prev').addEventListener('click', () => { if (historyPage > 1) { historyPage--; loadPointHistory(); } });
$('#history-next').addEventListener('click', () => { if (historyHasNext) { historyPage++; loadPointHistory(); } });
async function loadWallet() {
  const generation = authGeneration;
  const requestId = ++walletRequest;
  $('#wallet-list').replaceChildren();
  showMessage('#wallet-message', 'Đang tải quà đã đổi…', true);
  try {
    const data = await api('/vouchers/wallet');
    if (generation !== authGeneration || requestId !== walletRequest) return;
    const statusNames = { active: 'Có thể dùng', used: 'Đã sử dụng', expired: 'Đã hết hạn' };
    for (const item of data.items) {
      const row = activityRow(item.voucherName, `${formatPoints(item.pointsUsed)} điểm · ${formatDate(item.redeemedAt)}`, statusNames[item.status]);
      const code = document.createElement('small'); code.className = 'voucher-code'; code.textContent = `Mã: ${item.voucherCode}`;
      const expiry = document.createElement('small'); expiry.textContent = item.expiresAt ? `Hết hạn: ${formatDate(item.expiresAt)}` : 'Không giới hạn ngày sử dụng';
      row.firstElementChild.append(code, expiry);
      $('#wallet-list').append(row);
    }
    showMessage('#wallet-message', data.items.length ? '' : 'Bạn chưa đổi phần quà nào.', true);
  } catch (error) { if (generation === authGeneration && requestId === walletRequest) profileError(error, '#wallet-message'); }
}
