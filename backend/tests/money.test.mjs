import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeLedgerDeltas, toPaisa } = require('../utils/money');

describe('Atomic Ledger Balance Math (Paisa Precision)', () => {
  it('converts fractional BDT to exact BigInt paisa without float drift', () => {
    expect(toPaisa(500.5)).toBe(50050n);
    expect(toPaisa(92.5)).toBe(9250n);
    expect(toPaisa(0.1 + 0.2)).toBe(30n);
  });

  it('computes LEND with fee accurately (wallet drops by amount+fee, Pabo rises by amount)', () => {
    const res = computeLedgerDeltas({
      type: 'LEND',
      amountPaisa: toPaisa(1000),
      feePaisa: toPaisa(18.5),
    });
    expect(res.sourceWalletDelta).toBe(-101850n);
    expect(res.contactNetDelta).toBe(100000n);
  });

  it('computes TRANSFER between wallets accurately', () => {
    const res = computeLedgerDeltas({
      type: 'TRANSFER',
      amountPaisa: toPaisa(5000),
      feePaisa: toPaisa(92.5),
    });
    expect(res.sourceWalletDelta).toBe(-509250n);
    expect(res.targetWalletDelta).toBe(500000n);
    expect(res.contactNetDelta).toBe(0n);
  });

  it('keeps wallet untouched on CREDIT_EXPENSE (Bakite Kroy) while raising Debo', () => {
    const res = computeLedgerDeltas({
      type: 'CREDIT_EXPENSE',
      amountPaisa: toPaisa(1500),
    });
    expect(res.sourceWalletDelta).toBe(0n);
    expect(res.contactNetDelta).toBe(-150000n);
  });

  it('computes partial SETTLEMENT_IN recovery accurately', () => {
    const res = computeLedgerDeltas({
      type: 'SETTLEMENT_IN',
      amountPaisa: toPaisa(400),
    });
    expect(res.sourceWalletDelta).toBe(40000n);
    expect(res.contactNetDelta).toBe(-40000n);
  });
});
