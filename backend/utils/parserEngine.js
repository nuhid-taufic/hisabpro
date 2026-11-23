function parseNumeric(raw) {
  if (!raw) return 0;
  const num = Number.parseFloat(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : 0;
}

function detectSmsProvider(text) {
  const lower = text.toLowerCase();
  if (lower.includes('bkash') || /trxid\s+[a-z0-9]{6,20}/i.test(text)) return 'bKash';
  if (lower.includes('nagad') || lower.includes('txnid')) return 'Nagad';
  if (lower.includes('rocket') || lower.includes('dbbl mobile')) return 'Rocket';
  if (lower.includes('a/c') || lower.includes('debited') || lower.includes('credited')) return 'Bank';
  return null;
}

function tryParseBdSms(rawText) {
  const text = rawText.trim();
  const looksLikeSms =
    /(?:tk|bdt)\.?\s*[\d,]+(?:\.\d{1,2})?/i.test(text) &&
    /(trxid|txnid|balance|fee|cash out|cash in|send money|received|payment|debited|credited)/i.test(text);

  if (!looksLikeSms) return null;

  const provider = detectSmsProvider(text) || 'bKash';
  const lower = text.toLowerCase();

  const amountMatch = text.match(/(?:tk|bdt)\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const feeMatch = text.match(/(?:fee|charge)\s*(?:tk|bdt)?\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const balanceMatch = text.match(/(?:balance|bal)\s*(?:tk|bdt)?\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const trxMatch = text.match(/(?:trxid|txnid|trx\s*id|ref)[:\s#-]*([A-Z0-9]{6,20})/i);
  const phoneMatch = text.match(/(?:to|from)\s+(01\d{9}|01\d{3}[X*]{4,6})/i);

  const amount = parseNumeric(amountMatch?.[1]);
  if (amount <= 0) return null;

  const fee = parseNumeric(feeMatch?.[1]);
  const smsBalance = balanceMatch ? parseNumeric(balanceMatch[1]) : null;
  const externalTrxId = trxMatch ? trxMatch[1].toUpperCase() : null;

  let type = 'EXPENSE';
  let targetWalletHint = null;
  let note = `${provider} SMS Transaction`;

  if (lower.includes('cash out')) {
    type = 'TRANSFER';
    targetWalletHint = 'Cash';
    note = `${provider} Cash Out${phoneMatch ? ` (${phoneMatch[1]})` : ''}`;
  } else if (lower.includes('cash in') || lower.includes('received') || lower.includes('credited')) {
    type = 'INCOME';
    note = `${provider} Money Received${phoneMatch ? ` from ${phoneMatch[1]}` : ''}`;
  } else if (lower.includes('send money')) {
    type = 'EXPENSE';
    note = `${provider} Send Money${phoneMatch ? ` to ${phoneMatch[1]}` : ''}`;
  } else if (lower.includes('payment') || lower.includes('debited')) {
    type = 'EXPENSE';
    note = `${provider} Merchant Payment`;
  }

  return {
    source: 'BD_SMS',
    providerHint: provider,
    type,
    amount,
    fee,
    walletHint: provider,
    targetWalletHint,
    contactHint: phoneMatch?.[1] || null,
    categoryHint: null,
    tags: [provider.toLowerCase()],
    externalTrxId,
    smsBalance,
    note,
  };
}

function parseBanglishCommand(rawText) {
  const text = rawText.trim();
  const tags = [...text.matchAll(/#([a-zA-Z0-9_-]+)/g)].map((m) => m[1].toLowerCase());
  const cleaned = text.replace(/#[a-zA-Z0-9_-]+/g, '').trim();
  const lower = cleaned.toLowerCase();

  let amount = 0;
  const kMatch = lower.match(/\b(\d+(?:\.\d+)?)k\b/);
  if (kMatch) {
    amount = parseFloat(kMatch[1]) * 1000;
  } else {
    const numMatches = [...cleaned.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:tk|taka|bdt)?\b/gi)];
    const validAmt = numMatches.find((m) => !/^01\d{9}$/.test(m[1].replace(/,/g, '')));
    amount = parseNumeric(validAmt?.[1]);
  }

  let walletHint = 'Cash';
  if (/\bbkash\b/i.test(lower)) walletHint = 'bKash';
  else if (/\bnagad\b/i.test(lower)) walletHint = 'Nagad';
  else if (/\brocket\b/i.test(lower)) walletHint = 'Rocket';
  else if (/\b(bank|dbbl|city|brac|card)\b/i.test(lower)) walletHint = 'DBBL';
  else if (/\bcash\s*box\b/i.test(lower)) walletHint = 'Shop Cash Box';

  let type = 'EXPENSE';
  let contactHint = null;
  let categoryHint = null;

  const isLend = /\b(dhar\s+dilam|dhar\s+dao|pabo|lend|baki\s+dilam|baki\s+bechlam)\b/i.test(lower);
  const isBorrow = /\b(dhar\s+nilam|dhar\s+nichi|borrow|debo)\b/i.test(lower);
  const isCreditExpense = /\b(bakite|baki\s+nilam|baki\s+kroy)\b/i.test(lower);
  const isSettleIn = /\b(adoy|ferot\s+pelam|dhar\s+shodh\s+korlo|pelam\s+baki)\b/i.test(lower);
  const isSettleOut = /\b(shodh\s+dilam|ferot\s+dilam|baki\s+shodh)\b/i.test(lower);
  const isIncome = /\b(pelam|income|salary|beton|freelance|client\s+pay|payment\s+pelam)\b/i.test(lower);

  if (isLend) type = 'LEND';
  else if (isSettleIn) type = 'SETTLEMENT_IN';
  else if (isSettleOut) type = 'SETTLEMENT_OUT';
  else if (isCreditExpense) {
    type = 'CREDIT_EXPENSE';
    walletHint = null;
  } else if (isBorrow) type = 'BORROW';
  else if (isIncome) type = 'INCOME';

  const contactPattern = cleaned.match(/^([A-Za-z][A-Za-z .]{1,28}?)\s+(?:ke|theke|er\s+kache|kache)\b/i);
  if (contactPattern) contactHint = contactPattern[1].trim();

  if (type === 'EXPENSE') {
    if (/\b(lunch|dinner|breakfast|cha|coffee|food|khabar|biryani|burger|nasta)\b/i.test(lower)) {
      categoryHint = 'Food';
    } else if (/\b(rickshaw|vara|bus|uber|pathao|train|fuel|petrol|octane)\b/i.test(lower)) {
      categoryHint = 'Transport';
    } else if (/\b(wifi|net|current|bill|rent|gas)\b/i.test(lower)) {
      categoryHint = 'Bills & Utilities';
    }
  } else if (type === 'INCOME' && /\b(client|fiverr|upwork|logo|design|freelance)\b/i.test(lower)) {
    categoryHint = 'Freelance';
  }

  return {
    source: 'BANGLISH_COMMAND',
    providerHint: null,
    type,
    amount,
    fee: 0,
    walletHint,
    targetWalletHint: null,
    contactHint,
    categoryHint,
    tags,
    externalTrxId: null,
    smsBalance: null,
    note: cleaned,
  };
}

function parseMagicInput(rawText) {
  return tryParseBdSms(rawText) || parseBanglishCommand(rawText);
}

module.exports = { parseMagicInput };
