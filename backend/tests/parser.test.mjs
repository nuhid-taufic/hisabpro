import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseMagicInput } = require('../utils/parserEngine');

describe('Magic Command Bar & BD SMS Auto-Parser', () => {
  it('parses bKash Cash Out SMS into TRANSFER with fee, TrxID and remaining balance', () => {
    const sms =
      'Cash Out Tk 5,000.00 to 01711889900 successful. Fee Tk 92.50. Balance Tk 6,815.00. TrxID BJK72X9Q.';
    const res = parseMagicInput(sms);

    expect(res.source).toBe('BD_SMS');
    expect(res.providerHint).toBe('bKash');
    expect(res.type).toBe('TRANSFER');
    expect(res.amount).toBe(5000);
    expect(res.fee).toBe(92.5);
    expect(res.smsBalance).toBe(6815);
    expect(res.externalTrxId).toBe('BJK72X9Q');
    expect(res.targetWalletHint).toBe('Cash');
  });

  it('parses Nagad Cash In SMS as INCOME', () => {
    const sms = 'Cash In Tk 2,500.00 from 01819001122 successful. Balance Tk 6,300.00. TxnID NGD99281A';
    const res = parseMagicInput(sms);

    expect(res.source).toBe('BD_SMS');
    expect(res.providerHint).toBe('Nagad');
    expect(res.type).toBe('INCOME');
    expect(res.amount).toBe(2500);
    expect(res.externalTrxId).toBe('NGD99281A');
  });

  it('parses Banglish LEND command with contact and wallet', () => {
    const res = parseMagicInput('rahim ke 500 dhar dilam bkash');

    expect(res.source).toBe('BANGLISH_COMMAND');
    expect(res.type).toBe('LEND');
    expect(res.amount).toBe(500);
    expect(res.contactHint.toLowerCase()).toBe('rahim');
    expect(res.walletHint).toBe('bKash');
  });

  it('parses daily expense with hashtags and auto-category', () => {
    const res = parseMagicInput('lunch 220 cash #hangout #friends');

    expect(res.type).toBe('EXPENSE');
    expect(res.amount).toBe(220);
    expect(res.walletHint).toBe('Cash');
    expect(res.categoryHint).toBe('Food');
    expect(res.tags).toEqual(['hangout', 'friends']);
  });

  it('parses shorthand k suffix amounts like 2.5k', () => {
    const res = parseMagicInput('client payment pelam 2.5k dbbl #fiverr');

    expect(res.type).toBe('INCOME');
    expect(res.amount).toBe(2500);
    expect(res.walletHint).toBe('DBBL');
    expect(res.categoryHint).toBe('Freelance');
  });
});
