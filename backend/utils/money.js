function toPaisa(taka) {
  const num = Number(taka);
  if (!Number.isFinite(num)) throw new Error('Invalid monetary amount');
  return BigInt(Math.round(num * 100));
}

function serialize(data) {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === 'bigint') return Number(value);
      if (value && typeof value === 'object' && value.constructor?.name === 'Decimal') {
        return Number(value.toString());
      }
      return value;
    })
  );
}

function computeLedgerDeltas({ type, amountPaisa, feePaisa = 0n }) {
  switch (type) {
    case 'INCOME':
      return { sourceWalletDelta: amountPaisa - feePaisa, targetWalletDelta: 0n, contactNetDelta: 0n };
    case 'EXPENSE':
      return { sourceWalletDelta: -(amountPaisa + feePaisa), targetWalletDelta: 0n, contactNetDelta: 0n };
    case 'TRANSFER':
      return { sourceWalletDelta: -(amountPaisa + feePaisa), targetWalletDelta: amountPaisa, contactNetDelta: 0n };
    case 'LEND':
      return { sourceWalletDelta: -(amountPaisa + feePaisa), targetWalletDelta: 0n, contactNetDelta: amountPaisa };
    case 'BORROW':
      return { sourceWalletDelta: amountPaisa - feePaisa, targetWalletDelta: 0n, contactNetDelta: -amountPaisa };
    case 'CREDIT_EXPENSE':
      return { sourceWalletDelta: 0n, targetWalletDelta: 0n, contactNetDelta: -amountPaisa };
    case 'SETTLEMENT_IN':
      return { sourceWalletDelta: amountPaisa - feePaisa, targetWalletDelta: 0n, contactNetDelta: -amountPaisa };
    case 'SETTLEMENT_OUT':
      return { sourceWalletDelta: -(amountPaisa + feePaisa), targetWalletDelta: 0n, contactNetDelta: amountPaisa };
    case 'ADJUSTMENT':
      return { sourceWalletDelta: amountPaisa, targetWalletDelta: 0n, contactNetDelta: 0n };
    default:
      throw new Error(`Unsupported transaction type: ${type}`);
  }
}

module.exports = { toPaisa, serialize, computeLedgerDeltas };
