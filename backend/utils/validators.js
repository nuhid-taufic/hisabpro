const EMAIL_REGEX = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

function normalizeAndValidateEmail(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const email = String(raw).trim().toLowerCase();
  if (email.length > 254 || email.includes('..') || !EMAIL_REGEX.test(email)) {
    throw new Error('Please enter a valid email address (e.g. name@domain.com).');
  }
  return email;
}

function normalizeAndValidatePhone(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const cleaned = String(raw).trim().replace(/[\s\-().]/g, '');

  // Bangladesh mobile: 013-019 (11 digits) or 88013-88019 or +88013-+88019
  if (/^01[3-9]\d{8}$/.test(cleaned)) {
    return `+88${cleaned}`;
  }
  if (/^8801[3-9]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (/^\+8801[3-9]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // General International E.164 (8 to 15 digits with leading +)
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    if (cleaned.startsWith('+880') && !/^\+8801[3-9]\d{8}$/.test(cleaned)) {
      throw new Error('Invalid Bangladesh phone number. Use 013-019 with 11 digits.');
    }
    return cleaned;
  }

  throw new Error('Enter a valid phone number (e.g. 01711889900 or +8801711889900).');
}

function parseLoginIdentifier(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    throw new Error('Email or phone number is required.');
  }
  if (value.includes('@')) {
    return { kind: 'email', value: normalizeAndValidateEmail(value) };
  }
  return { kind: 'phone', value: normalizeAndValidatePhone(value) };
}

module.exports = {
  normalizeAndValidateEmail,
  normalizeAndValidatePhone,
  parseLoginIdentifier,
};
