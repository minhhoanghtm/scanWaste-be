const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIETNAMESE_MOBILE_PATTERN = /^\+84[35789]\d{8}$/;

const normalizeEmail = (email) => {
  if (typeof email !== 'string') {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  return normalizedEmail.length <= 254 && EMAIL_PATTERN.test(normalizedEmail)
    ? normalizedEmail
    : null;
};

const normalizeVietnamesePhone = (phone) => {
  if (typeof phone !== 'string') {
    return null;
  }

  let normalizedPhone = phone.trim().replace(/[\s().-]/g, '');

  if (/^0\d{9}$/.test(normalizedPhone)) {
    normalizedPhone = `+84${normalizedPhone.slice(1)}`;
  } else if (/^84\d{9}$/.test(normalizedPhone)) {
    normalizedPhone = `+${normalizedPhone}`;
  }

  return VIETNAMESE_MOBILE_PATTERN.test(normalizedPhone) ? normalizedPhone : null;
};

const normalizeLoginIdentifier = (identifier) => {
  const email = normalizeEmail(identifier);
  if (email) {
    return { field: 'email', value: email };
  }

  const phone = normalizeVietnamesePhone(identifier);
  if (phone) {
    return { field: 'phone', value: phone };
  }

  return null;
};

module.exports = {
  normalizeEmail,
  normalizeVietnamesePhone,
  normalizeLoginIdentifier,
};
