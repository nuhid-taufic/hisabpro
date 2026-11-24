import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { apiFetch, fmtDate, fmtTk } from '../lib/api';
import { useI18n } from '../context/I18nContext';

const TX_TYPES = [
  { value: 'EXPENSE', label: 'Expense (Khoroch)' },
  { value: 'INCOME', label: 'Income (Aay)' },
  { value: 'TRANSFER', label: 'Transfer (Wallet to Wallet)' },
  { value: 'LEND', label: 'Lend (Dhar Dewa / Pabo)' },
  { value: 'BORROW', label: 'Borrow (Dhar Newa / Debo)' },
  { value: 'CREDIT_EXPENSE', label: 'Credit Expense (Bakite Kroy)' },
  { value: 'SETTLEMENT_IN', label: 'Pabo Adoy (Receive Due)' },
  { value: 'SETTLEMENT_OUT', label: 'Debo Porishodh (Pay Due)' },
];

export default function DashboardView({
  books,
  activeBookId,
  wallets,
  contacts,
  categories,
  refreshBase,
  notify,
}) {
  const { t } = useI18n();
  const [kpis, setKpis] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [walletFilter, setWalletFilter] = useState('ALL');

  // Add Transaction Modal
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    bookId: '',
    type: 'EXPENSE',
    amount: '',
    fee: '',
    currency: 'BDT',
    originalAmount: '',
    exchangeRate: '120',
    walletId: '',
    targetWalletId: '',
    contactId: '',
    categoryId: '',
    tagsInput: '',
    note: '',
  });
  const [savingTx, setSavingTx] = useState(false);

  // Add Wallet Modal
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [wName, setWName] = useState('');
  const [wType, setWType] = useState('CASH');
  const [wOpenBal, setWOpenBal] = useState('0');

  // Reconcile Modal
  const [reconcileTarget, setReconcileTarget] = useState(null);
  const [actualBalance, setActualBalance] = useState('');

  const loadLedger = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeBookId) params.set('bookId', activeBookId);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (walletFilter !== 'ALL') params.set('walletId', walletFilter);
      if (search.trim()) params.set('search', search.trim());

      const [sumRes, txRes] = await Promise.all([
        apiFetch(`/transactions/summary?bookId=${encodeURIComponent(activeBookId)}`),
        apiFetch(`/transactions?${params.toString()}`),
      ]);
      setKpis(sumRes.kpis);
      setTransactions(txRes.transactions || []);
    } catch (err) {
      notify(err.message, true);
    }
  }, [activeBookId, typeFilter, walletFilter, search, notify]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  function openNewTxModal() {
    const defaultBook =
      activeBookId !== 'ALL' ? activeBookId : books.find((b) => b.isDefault)?.id || books[0]?.id || '';
    const firstWallet = wallets[0]?.id || '';
    const secondWallet = wallets[1]?.id || '';
    setTxForm({
      bookId: defaultBook,
      type: 'EXPENSE',
      amount: '',
      fee: '',
      currency: 'BDT',
      originalAmount: '',
      exchangeRate: '120',
      walletId: firstWallet,
      targetWalletId: secondWallet,
      contactId: '',
      categoryId: '',
      tagsInput: '',
      note: '',
    });
    setTxModalOpen(true);
  }

  async function submitTransaction(e) {
    e.preventDefault();
    setSavingTx(true);
    try {
      const tags = txForm.tagsInput
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean);

      const isUsd = txForm.currency === 'USD';
      const origAmt = isUsd ? Number(txForm.originalAmount) : undefined;
      const rate = isUsd ? Number(txForm.exchangeRate) : undefined;
      const finalBdtAmount = isUsd && origAmt && rate ? origAmt * rate : Number(txForm.amount);

      await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          bookId: txForm.bookId || undefined,
          type: txForm.type,
          amount: finalBdtAmount,
          fee: Number(txForm.fee) || 0,
          currency: txForm.currency,
          originalAmount: origAmt,
          exchangeRate: rate,
          walletId: txForm.type === 'CREDIT_EXPENSE' ? null : txForm.walletId || null,
          targetWalletId: txForm.type === 'TRANSFER' ? txForm.targetWalletId || null : null,
          contactId: txForm.contactId || null,
          categoryId: txForm.categoryId || null,
          tags,
          note: txForm.note.trim() || undefined,
        }),
      });

      await Promise.all([refreshBase(), loadLedger()]);
      notify('Transaction committed atomically.');
      setTxModalOpen(false);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSavingTx(false);
    }
  }

  async function reverseTx(tx) {
    if (!window.confirm('Reverse & soft-delete this transaction? Balances will automatically revert.')) {
      return;
    }
    try {
      await apiFetch(`/transactions/${tx.id}`, { method: 'DELETE' });
      await Promise.all([refreshBase(), loadLedger()]);
      notify('Transaction reversed cleanly.');
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function submitWallet(e) {
    e.preventDefault();
    try {
      await apiFetch('/wallets', {
        method: 'POST',
        body: JSON.stringify({ name: wName, type: wType, openingBalance: Number(wOpenBal) || 0 }),
      });
      await Promise.all([refreshBase(), loadLedger()]);
      notify(`Wallet "${wName}" created.`);
      setWName('');
      setWOpenBal('0');
      setWalletModalOpen(false);
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function submitReconcile(e) {
    e.preventDefault();
    if (!reconcileTarget) return;
    try {
      await apiFetch(`/wallets/${reconcileTarget.id}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({
          actualBalance: Number(actualBalance),
          bookId: activeBookId !== 'ALL' ? activeBookId : undefined,
        }),
      });
      await Promise.all([refreshBase(), loadLedger()]);
      notify(`${reconcileTarget.name} reconciled.`);
      setReconcileTarget(null);
    } catch (err) {
      notify(err.message, true);
    }
  }

  const needsContact = ['LEND', 'BORROW', 'CREDIT_EXPENSE', 'SETTLEMENT_IN', 'SETTLEMENT_OUT'].includes(
    txForm.type
  );

  return (
    <div className="space-y-6">
      {/* KPI Hero Card */}
      <section className="rounded-2xl border border-[#26262B] bg-[#141417] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
              {t('totalNetBalance')}
            </div>
            <div className="mt-1 text-3xl font-bold text-[#FAFAFA] tabular-nums">
              {fmtTk(kpis?.totalNetBalancePaisa)}
            </div>
            <div className="mt-1 text-xs text-[#A1A1AA] tabular-nums">
              {t('safeToSpend')}:{' '}
              <span className="font-semibold text-[#FAFAFA]">{fmtTk(kpis?.safeToSpendPaisa)}</span>
            </div>
          </div>
          <button
            onClick={openNewTxModal}
            className="inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            {t('newTransaction')}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#10B981]/30 bg-[#062B20]/40 p-3.5">
            <div className="text-[10px] font-bold uppercase text-[#10B981]">{t('motPabo')}</div>
            <div className="mt-1 text-lg font-bold text-white tabular-nums">
              {fmtTk(kpis?.totalPaboPaisa)}
            </div>
          </div>
          <div className="rounded-xl border border-[#F43F5E]/30 bg-[#310B15]/40 p-3.5">
            <div className="text-[10px] font-bold uppercase text-[#F43F5E]">{t('motDebo')}</div>
            <div className="mt-1 text-lg font-bold text-white tabular-nums">
              {fmtTk(kpis?.totalDeboPaisa)}
            </div>
          </div>
          <div className="rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3.5">
            <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('monthIncome')}</div>
            <div className="mt-1 text-lg font-bold text-[#10B981] tabular-nums">
              {fmtTk(kpis?.monthIncomePaisa)}
            </div>
          </div>
          <div className="rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3.5">
            <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('monthExpense')}</div>
            <div className="mt-1 text-lg font-bold text-[#F43F5E] tabular-nums">
              {fmtTk(kpis?.monthExpensePaisa)}
            </div>
          </div>
        </div>
      </section>

      {/* Wallets Strip */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#A1A1AA]">
            {t('walletsTitle')}
          </h2>
          <button
            onClick={() => setWalletModalOpen(true)}
            className="rounded-lg border border-[#26262B] bg-[#141417] px-3 py-1 text-xs font-semibold text-zinc-200 hover:border-[#3B82F6]"
          >
            {t('addWallet')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {wallets.map((w) => (
            <div
              key={w.id}
              className="flex flex-col justify-between rounded-xl border border-[#26262B] bg-[#141417] p-3.5"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <WalletIcon className="h-3.5 w-3.5 text-[#3B82F6]" />
                  {w.name}
                </span>
                <button
                  onClick={() => {
                    setReconcileTarget(w);
                    setActualBalance((w.balancePaisa / 100).toFixed(2));
                  }}
                  title="Reconcile Balance"
                  className="rounded p-1 text-zinc-500 hover:bg-[#1C1C21] hover:text-[#3B82F6]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2.5 text-lg font-bold text-white tabular-nums">
                {fmtTk(w.balancePaisa, false)}
              </div>
              <div className="text-[10px] uppercase text-zinc-500">{w.type}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Search & Filter Bar + Transaction List */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchTxPlaceholder')}
              className="w-full rounded-xl border border-[#26262B] bg-[#141417] py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:border-[#3B82F6] focus:outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-[#26262B] bg-[#141417] px-3 py-2 text-xs text-white"
          >
            <option value="ALL">{t('allTypes')}</option>
            {TX_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.value}
              </option>
            ))}
            <option value="ADJUSTMENT">ADJUSTMENT</option>
          </select>
          <select
            value={walletFilter}
            onChange={(e) => setWalletFilter(e.target.value)}
            className="rounded-xl border border-[#26262B] bg-[#141417] px-3 py-2 text-xs text-white"
          >
            <option value="ALL">{t('allWallets')}</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {transactions.length === 0 ? (
            <div className="rounded-xl border border-[#26262B] bg-[#141417] p-8 text-center text-xs text-zinc-500">
              {t('noTxsFound')}
            </div>
          ) : (
            transactions.map((tx) => {
              const isIn = ['INCOME', 'BORROW', 'SETTLEMENT_IN'].includes(tx.type);
              const isTransfer = tx.type === 'TRANSFER';
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#26262B] bg-[#141417] px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isTransfer
                          ? 'bg-blue-500/15 text-[#3B82F6]'
                          : isIn
                            ? 'bg-emerald-500/15 text-[#10B981]'
                            : 'bg-rose-500/15 text-[#F43F5E]'
                      }`}
                    >
                      {isTransfer ? (
                        <ArrowRightLeft className="h-4 w-4" />
                      ) : isIn ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {tx.note || tx.contact?.name || tx.type}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#A1A1AA]">
                        <span className="rounded bg-[#0A0A0B] px-1.5 py-0.5 font-semibold text-zinc-300">
                          {tx.type}
                        </span>
                        {tx.book && <span>{tx.book.name}</span>}
                        {tx.wallet && (
                          <span>
                            • {tx.wallet.name}
                            {tx.targetWallet ? ` -> ${tx.targetWallet.name}` : ''}
                          </span>
                        )}
                        {tx.contact && <span>• {tx.contact.name}</span>}
                        {tx.category && <span>• {tx.category.name}</span>}
                        <span>• {fmtDate(tx.transactionDate)}</span>
                        {tx.tags?.map((tt) => (
                          <span key={tt.tag.id} className="text-[#3B82F6]">
                            #{tt.tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right tabular-nums">
                      <div
                        className={`text-sm font-bold ${
                          isTransfer ? 'text-[#3B82F6]' : isIn ? 'text-[#10B981]' : 'text-white'
                        }`}
                      >
                        {isTransfer ? '' : isIn ? '+' : '-'}
                        {fmtTk(Math.abs(tx.amountPaisa))}
                      </div>
                      {tx.currency !== 'BDT' && tx.originalAmountPaisa && (
                        <div className="text-[10px] text-zinc-400">
                          ${(tx.originalAmountPaisa / 100).toFixed(2)} {tx.currency}
                        </div>
                      )}
                      {tx.feePaisa > 0 && (
                        <div className="text-[10px] text-[#F43F5E]">Fee {fmtTk(tx.feePaisa)}</div>
                      )}
                    </div>
                    <button
                      onClick={() => reverseTx(tx)}
                      title="Reverse & Soft-Delete"
                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-[#1C1C21] hover:text-[#F43F5E]"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* New Atomic Transaction Modal */}
      {txModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 md:items-center md:p-4">
          <div className="w-full max-w-lg rounded-t-2xl md:rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">New Atomic Transaction</h3>
              <button onClick={() => setTxModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitTransaction} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Ledger Book</label>
                  <select
                    value={txForm.bookId}
                    onChange={(e) => setTxForm({ ...txForm, bookId: e.target.value })}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.bookType})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Transaction Type</label>
                  <select
                    value={txForm.type}
                    onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  >
                    {TX_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Currency</label>
                  <select
                    value={txForm.currency}
                    onChange={(e) => setTxForm({ ...txForm, currency: e.target.value })}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  >
                    <option value="BDT">BDT (৳)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>

                {txForm.currency === 'BDT' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-[#A1A1AA]">Amount (BDT) *</label>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={txForm.amount}
                        onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[#A1A1AA]">Fee / Charge</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={txForm.fee}
                        onChange={(e) => setTxForm({ ...txForm, fee: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-[#A1A1AA]">USD Amount *</label>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={txForm.originalAmount}
                        onChange={(e) => setTxForm({ ...txForm, originalAmount: e.target.value })}
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[#A1A1AA]">Rate (1 USD = Tk)</label>
                      <input
                        type="number"
                        required
                        min="1"
                        step="0.01"
                        value={txForm.exchangeRate}
                        onChange={(e) => setTxForm({ ...txForm, exchangeRate: e.target.value })}
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                      />
                    </div>
                  </>
                )}
              </div>

              {txForm.type !== 'CREDIT_EXPENSE' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[#A1A1AA]">
                      {txForm.type === 'TRANSFER' ? 'From Wallet *' : 'Wallet'}
                    </label>
                    <select
                      value={txForm.walletId}
                      onChange={(e) => setTxForm({ ...txForm, walletId: e.target.value })}
                      className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({fmtTk(w.balancePaisa, false)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {txForm.type === 'TRANSFER' ? (
                    <div>
                      <label className="mb-1 block text-[#A1A1AA]">To Wallet *</label>
                      <select
                        required
                        value={txForm.targetWalletId}
                        onChange={(e) => setTxForm({ ...txForm, targetWalletId: e.target.value })}
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                      >
                        {wallets.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-[#A1A1AA]">Category</label>
                      <select
                        value={txForm.categoryId}
                        onChange={(e) => setTxForm({ ...txForm, categoryId: e.target.value })}
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                      >
                        <option value="">None</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {needsContact && (
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Contact *</label>
                  <select
                    required
                    value={txForm.contactId}
                    onChange={(e) => setTxForm({ ...txForm, contactId: e.target.value })}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  >
                    <option value="">Select Contact</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Tags (e.g. #trip #fiverr)</label>
                  <input
                    value={txForm.tagsInput}
                    onChange={(e) => setTxForm({ ...txForm, tagsInput: e.target.value })}
                    placeholder="#hangout #bike"
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Note</label>
                  <input
                    value={txForm.note}
                    onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
                    placeholder="Short description..."
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingTx}
                className="w-full rounded-xl bg-[#3B82F6] py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {savingTx ? 'Committing...' : 'Save Transaction'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Wallet Modal */}
      {walletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <h3 className="mb-4 text-base font-bold text-white">Add Wallet</h3>
            <form onSubmit={submitWallet} className="space-y-3 text-xs">
              <input
                required
                value={wName}
                onChange={(e) => setWName(e.target.value)}
                placeholder="Wallet Name (e.g. Nagad, City Bank)"
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
              />
              <select
                value={wType}
                onChange={(e) => setWType(e.target.value)}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
              >
                <option value="CASH">CASH</option>
                <option value="MFS">MFS (bKash/Nagad/Rocket)</option>
                <option value="BANK">BANK</option>
                <option value="CARD">CARD</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={wOpenBal}
                onChange={(e) => setWOpenBal(e.target.value)}
                placeholder="Opening Balance (BDT)"
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white tabular-nums"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setWalletModalOpen(false)}
                  className="flex-1 rounded-xl border border-[#26262B] py-2.5 text-zinc-300"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1-Click Reconcile Modal */}
      {reconcileTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <h3 className="text-base font-bold text-white">Reconcile {reconcileTarget.name}</h3>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              Current App Balance: <strong className="text-white">{fmtTk(reconcileTarget.balancePaisa)}</strong>
            </p>
            <form onSubmit={submitReconcile} className="mt-4 space-y-3">
              <input
                type="number"
                step="0.01"
                required
                value={actualBalance}
                onChange={(e) => setActualBalance(e.target.value)}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-base font-bold text-white tabular-nums"
              />
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setReconcileTarget(null)}
                  className="flex-1 rounded-xl border border-[#26262B] py-2.5 text-zinc-300"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white">
                  Match Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
