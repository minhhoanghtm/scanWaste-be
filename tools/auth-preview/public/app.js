const $ = (selector) => document.querySelector(selector);
let accessToken = null;
let toastTimer;

const messageForCode = {
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
  if (['home', 'profile'].includes(name) && !accessToken) name = 'login';
  if (!$(`#${name}-screen`)) return;
  document.querySelectorAll('.screen').forEach((screen) => { screen.hidden = screen.id !== `${name}-screen`; });
  $('#member-nav').hidden = !['home', 'profile'].includes(name);
  document.querySelectorAll('#member-nav [data-screen]').forEach((button) => {
    if (button.dataset.screen === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const titles = { login: 'Đăng nhập', register: 'Đăng ký', home: 'Trang chủ', profile: 'Hồ sơ' };
  document.title = `EcoSort AI · ${titles[name]}`;
  window.scrollTo({ top: 0, behavior: 'instant' });
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

async function api(path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('Không thể kết nối máy chủ. Kiểm tra kết nối rồi thử lại.');
  }
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(messageForCode[payload.code] || payload.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    error.code = payload.code;
    throw error;
  }
  return payload.data;
}

function fillProfile(user) {
  $('#profile-name').textContent = user.name;
  $('#profile-email').textContent = user.email;
  $('#profile-phone').textContent = user.phone || 'Chưa cập nhật';
  $('#profile-role').textContent = user.role === 'admin' ? 'Quản trị viên' : 'Thành viên EcoSort';
  $('#profile-avatar').textContent = user.name.trim().split(/\s+/).slice(-1)[0].slice(0, 1).toUpperCase();
  $('#home-name').textContent = user.name;
  $('#home-avatar').textContent = $('#profile-avatar').textContent;
  $('#profile-created').textContent = user.createdAt ? new Intl.DateTimeFormat('vi-VN').format(new Date(user.createdAt)) : 'Chưa có thông tin';
  $('#profile-session').textContent = 'Đã xác thực';
  showMessage('#profile-message', '');
}

async function completeAuthentication(data, registered, destination = 'home') {
  accessToken = data.token;
  // Verify the issued JWT through the protected profile endpoint as well.
  const profile = await api('/users/me');
  fillProfile(profile);
  $('#home-auth-message').textContent = registered
    ? 'Bạn đã tạo tài khoản thành công. Hành trình xanh bắt đầu!'
    : 'Bạn đã đăng nhập thành công.';
  showMessage('#home-message', '');
  showScreen(destination);
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
    await completeAuthentication(data, false);
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
    await completeAuthentication(data, true);
    $('#register-form').reset();
    updateStrength();
  } catch (error) {
    accessToken = null;
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
$('#logout').addEventListener('click', () => {
  accessToken = null;
  $('#login-password').value = '';
  showMessage('#login-message', 'Bạn đã đăng xuất trên trình duyệt này.', true);
  showScreen('login');
});
$('#refresh-profile').addEventListener('click', async () => {
  const button = $('#refresh-profile');
  button.disabled = true;
  try { fillProfile(await api('/users/me')); toast('Đã cập nhật hồ sơ từ máy chủ.'); }
  catch (error) {
    if (['TOKEN_EXPIRED', 'UNAUTHORIZED'].includes(error.code)) {
      accessToken = null; showScreen('login'); showMessage('#login-message', error.message);
    } else showMessage('#profile-message', error.message);
  } finally { button.disabled = false; }
});

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
  $('#social-setup-description').textContent = 'Tạo OAuth Client loại Web application trong Google Cloud, khai báo origin http://localhost:5173 rồi cấu hình GOOGLE_CLIENT_ID trong file .env của backend.';
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
