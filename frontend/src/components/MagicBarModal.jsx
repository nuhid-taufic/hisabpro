import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { apiFetch, fmtTk } from '../lib/api';

const PRESETS = [
  {
    label: 'bKash Cash Out SMS',
    value:
      'Cash Out Tk 5,000.00 to 01711889900 successful. Fee Tk 92.50. Balance Tk 6,815.00. TrxID BJK72X9Q.',
  },
  {
    label: 'Banglish Lend',
    value: 'rahim ke 500 dhar dilam bkash',
  },
  {
    label: 'Expense + Tag',
    value: 'lunch 220 cash #hangout',
  },
];

export default function MagicBarModal({
  open,
  onClose,
  books,
  activeBookId,
  wallets,
  contacts,
  onSaved,
  notify,
}) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overrideType, setOverrideType] = useState('EXPENSE');
  const [overrideWalletId, setOverrideWalletId] = useState('');
  const [overrideTargetWalletId, setOverrideTargetWalletId] = useState('');
  const [overrideContactId, setOverrideContactId] = useState('');
  const [autoReconcile, setAutoReconcile] = useState(false);

  useEffect(() => {
    if (!open) {
      setInput('');
      setPreview(null);
      setAutoReconcile(false);
    }
  }, [open]);

  if (!open) return null;

  async function runPreview(customText) {
    const query = (customText ?? input).trim();
    if (query.length < 2) return;
    setParsing(true);
    try {
      const res = await apiFetch('/parser/preview', {
        method: 'POST',
        body: JSON.stringify({ input: query }),
      });
      setPreview(res);
      setOverrideType(res.parsed.type);
      setOverrideWalletId(res.resolved.walletId || wallets[0]?.id || '');
      setOverrideTargetWalletId(
        res.resolved.targetWalletId ||
          wallets.find((w) => w.id !== (res.resolved.walletId || wallets[0]?.id))?.id ||
          ''
      );
      setOverrideContactId(res.resolved.contactId || '');
      setAutoReconcile(false);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setParsing(false);
    }
  }

  async function commitParsed() {
    if (!preview) return;
    if (preview.warnings.isDuplicateTrx) {
      notify('Duplicate TrxID blocked to prevent double entry.', true);
      return;
    }

    setSaving(true);
    try {
      const targetBookId =
        activeBookId !== 'ALL' ? activeBookId : books.find((b) => b.isDefault)?.id || books[0]?.id;

      await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          bookId: targetBookId,
          type: overrideType,
          amount: preview.parsed.amount,
          fee: preview.parsed.fee || 0,
          walletId: overrideType === 'CREDIT_EXPENSE' ? null : overrideWalletId || null,
          targetWalletId: overrideType === 'TRANSFER' ? overrideTargetWalletId || null : null,
          contactId: overrideContactId || null,
          newContactName:
            !overrideContactId && preview.resolved.isNewContact ? preview.resolved.contactName : undefined,
          categoryId: preview.resolved.categoryId || null,
          tags: preview.parsed.tags || [],
          note: preview.parsed.note,
          externalTrxId: preview.parsed.externalTrxId || undefined,
          rawInputText: input,
        }),
      });

      if (autoReconcile && preview.warnings.balanceMismatch) {
        await apiFetch(`/wallets/${preview.warnings.balanceMismatch.walletId}/reconcile`, {
          method: 'POST',
          body: JSON.stringify({
            actualBalance: preview.warnings.balanceMismatch.smsBalance,
            bookId: targetBookId,
            note: `Auto-reconciled from ${preview.parsed.providerHint || 'SMS'} balance`,
          }),
        });
      }

      notify(
        autoReconcile && preview.warnings.balanceMismatch
          ? 'Saved & wallet auto-reconciled to SMS balance.'
          : 'Transaction saved atomically.'
      );
      await onSaved();
      onClose();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 md:items-center md:p-4">
      <div className="w-full max-w-xl rounded-t-2xl md:rounded-2xl border border-[#26262B] bg-[#141417] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#3B82F6]" />
            <h2 className="text-base font-bold text-white">Magic Command Bar &amp; BD SMS Parser</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-[#1C1C21] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          rows={3}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Paste bKash/Nagad SMS or type "rahim ke 500 dhar dilam bkash"...'
          className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:border-[#3B82F6] focus:outline-none"
        />

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setInput(p.value);
                  runPreview(p.value);
                }}
                className="rounded-full border border-[#26262B] bg-[#0A0A0B] px-2.5 py-1 text-[11px] text-zinc-300 hover:border-[#3B82F6] hover:text-white"
              >
                Try: {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={parsing || input.trim().length < 2}
            onClick={() => runPreview()}
            className="rounded-xl border border-[#26262B] bg-[#1C1C21] px-4 py-1.5 text-xs font-semibold text-white hover:border-[#3B82F6] disabled:opacity-40"
          >
            {parsing ? 'Parsing...' : 'Parse Preview'}
          </button>
        </div>

        {preview && (
          <div className="mt-4 space-y-3 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-[#0F1E3A] border border-[#1E3A6E] px-2 py-0.5 text-[11px] font-bold text-[#3B82F6]">
                  {preview.parsed.source === 'BD_SMS'
                    ? `${preview.parsed.providerHint} SMS`
                    : 'Banglish NLP'}
                </span>
                {preview.parsed.externalTrxId && (
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      preview.warnings.isDuplicateTrx
                        ? 'bg-[#310B15] text-[#F43F5E] border border-[#5A1627]'
                        : 'bg-[#062B20] text-[#10B981] border border-[#0D4D39]'
                    }`}
                  >
                    TrxID: {preview.parsed.externalTrxId}{' '}
                    {preview.warnings.isDuplicateTrx ? 'DUPLICATE BLOCKED' : 'Unique'}
                  </span>
                )}
              </div>

              <div className="text-right tabular-nums">
                <div className="text-lg font-bold text-white">{fmtTk(preview.parsed.amount * 100)}</div>
                {preview.parsed.fee > 0 && (
                  <div className="text-[11px] text-[#F43F5E]">+ Fee {fmtTk(preview.parsed.fee * 100)}</div>
                )}
              </div>
            </div>

            {preview.warnings.isDuplicateTrx && (
              <div className="rounded-xl border border-[#5A1627] bg-[#310B15] p-3 text-xs text-rose-200">
                This SMS TrxID ({preview.parsed.externalTrxId}) is already saved in your ledger. Duplicate submission is blocked.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="mb-1 block text-zinc-500">Detected Type</label>
                <select
                  value={overrideType}
                  onChange={(e) => setOverrideType(e.target.value)}
                  className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2.5 py-2 text-white"
                >
                  <option value="TRANSFER">TRANSFER (Wallet to Wallet)</option>
                  <option value="EXPENSE">EXPENSE</option>
                  <option value="INCOME">INCOME</option>
                  <option value="LEND">LEND (Dhar Dewa)</option>
                  <option value="BORROW">BORROW (Dhar Newa)</option>
                  <option value="CREDIT_EXPENSE">CREDIT_EXPENSE</option>
                  <option value="SETTLEMENT_IN">SETTLEMENT_IN</option>
                  <option value="SETTLEMENT_OUT">SETTLEMENT_OUT</option>
                </select>
              </div>

              {overrideType !== 'CREDIT_EXPENSE' && (
                <div>
                  <label className="mb-1 block text-zinc-500">
                    {overrideType === 'TRANSFER' ? 'Source Wallet' : 'Wallet'}
                  </label>
                  <select
                    value={overrideWalletId}
                    onChange={(e) => setOverrideWalletId(e.target.value)}
                    className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2.5 py-2 text-white"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({fmtTk(w.balancePaisa, false)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {overrideType === 'TRANSFER' && (
                <div>
                  <label className="mb-1 block text-zinc-500">Target Wallet</label>
                  <select
                    value={overrideTargetWalletId}
                    onChange={(e) => setOverrideTargetWalletId(e.target.value)}
                    className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2.5 py-2 text-white"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-zinc-500">
                  Contact {preview.resolved.isNewContact && !overrideContactId ? '(Will Auto-Create)' : ''}
                </label>
                <select
                  value={overrideContactId}
                  onChange={(e) => setOverrideContactId(e.target.value)}
                  className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2.5 py-2 text-white"
                >
                  <option value="">
                    {preview.resolved.isNewContact
                      ? `+ Create "${preview.resolved.contactName}"`
                      : 'None'}
                  </option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {preview.warnings.balanceMismatch && (
              <div className="rounded-xl border border-[#573C0C] bg-[#2B1E06] p-3 text-xs text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
                  <div>
                    <div className="font-bold text-[#F59E0B]">
                      Balance Mismatch on {preview.warnings.balanceMismatch.walletName}
                    </div>
                    <p className="mt-0.5 text-amber-100/80 tabular-nums">
                      SMS Balance: {fmtTk(preview.warnings.balanceMismatch.smsBalance * 100)} | App expects:{' '}
                      {fmtTk(preview.warnings.balanceMismatch.expectedAppBalanceAfterTx * 100)} (Diff:{' '}
                      {preview.warnings.balanceMismatch.difference > 0 ? '+' : ''}
                      {preview.warnings.balanceMismatch.difference} Tk)
                    </p>
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 font-semibold text-[#F59E0B]">
                      <input
                        type="checkbox"
                        checked={autoReconcile}
                        onChange={(e) => setAutoReconcile(e.target.checked)}
                        className="accent-amber-500"
                      />
                      Auto-reconcile {preview.warnings.balanceMismatch.walletName} to match SMS balance
                    </label>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={saving || preview.warnings.isDuplicateTrx || preview.parsed.amount <= 0}
              onClick={commitParsed}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3B82F6] py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving Atomically...' : 'Confirm & Save Transaction'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
