import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Contact2,
  Copy,
  ExternalLink,
  Flag,
  Link2,
  Plus,
  Search,
  ShieldOff,
  Smartphone,
  X,
} from 'lucide-react';
import { apiFetch, fmtDate, fmtTk, getInitials } from '../lib/api';
import { useI18n } from '../context/I18nContext';

const ROLES = ['CUSTOMER', 'SUPPLIER', 'BOTH', 'FRIEND', 'CLIENT', 'FAMILY'];

export default function ContactsView({ books, activeBookId, wallets, refreshBase, notify }) {
  const { t } = useI18n();
  const [contacts, setContacts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [ledgerTxs, setLedgerTxs] = useState([]);

  // Add Contact Modal State
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    type: 'CUSTOMER',
    address: '',
    note: '',
    openingDir: 'PABO',
    openingAmount: '',
    enableTrustLink: true,
  });
  const [savingContact, setSavingContact] = useState(false);

  // Inline Quick Ledger Action State
  const [quickType, setQuickType] = useState(null);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickWalletId, setQuickWalletId] = useState('');
  const [quickNote, setQuickNote] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/contacts?${params.toString()}`);
      const list = res.contacts || [];
      setContacts(list);
      setSelectedId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch (err) {
      notify(err.message, true);
    }
  }, [filter, search, notify]);

  const loadLedger = useCallback(
    async (id) => {
      if (!id) {
        setSelectedContact(null);
        setLedgerTxs([]);
        return;
      }
      try {
        const res = await apiFetch(`/contacts/${id}/ledger`);
        setSelectedContact(res.contact);
        setLedgerTxs(res.transactions || []);
      } catch (err) {
        notify(err.message, true);
      }
    },
    [notify]
  );

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    loadLedger(selectedId);
  }, [selectedId, loadLedger]);

  async function pickFromPhonebook() {
    if (!navigator.contacts?.select) {
      notify('Phonebook Picker works on Android Chrome PWA.', false);
      return;
    }
    try {
      const picked = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (picked[0]) {
        setForm((prev) => ({
          ...prev,
          name: picked[0].name?.[0] || prev.name,
          phone: picked[0].tel?.[0]?.replace(/[^\d+]/g, '') || prev.phone,
        }));
      }
    } catch {
      // dismissed
    }
  }

  async function submitNewContact(e) {
    e.preventDefault();
    setSavingContact(true);
    try {
      const rawAmt = Number(form.openingAmount) || 0;
      const signedOpening = form.openingDir === 'PABO' ? rawAmt : -rawAmt;
      const res = await apiFetch('/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone.trim() || undefined,
          type: form.type,
          address: form.address.trim() || undefined,
          note: form.note.trim() || undefined,
          openingBalance: signedOpening,
          enableTrustLink: form.enableTrustLink,
        }),
      });

      await Promise.all([refreshBase(), loadContacts()]);
      setSelectedId(res.contact.id);
      notify(`${res.contact.name} added to contacts.`);
      setForm({
        name: '',
        phone: '',
        type: 'CUSTOMER',
        address: '',
        note: '',
        openingDir: 'PABO',
        openingAmount: '',
        enableTrustLink: true,
      });
      setAddOpen(false);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSavingContact(false);
    }
  }

  async function enableOrCopyTrustLink() {
    if (!selectedContact) return;
    try {
      const res = await apiFetch(`/contacts/${selectedContact.id}/share-link`, {
        method: 'POST',
        body: JSON.stringify({ rotate: false }),
      });
      setSelectedContact(res.contact);
      const url = `${window.location.origin}/?trust=${res.shareToken}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      notify('Live Trust Link active & copied to clipboard.');
      loadContacts();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function revokeTrustLink() {
    if (!selectedContact) return;
    try {
      const res = await apiFetch(`/contacts/${selectedContact.id}/share-link`, {
        method: 'DELETE',
      });
      setSelectedContact(res.contact);
      notify('Live Trust Link revoked.');
      loadContacts();
    } catch (err) {
      notify(err.message, true);
    }
  }

  function copyWhatsAppSummary() {
    if (!selectedContact) return;
    const net = selectedContact.netBalancePaisa;
    const balanceLine =
      net > 0
        ? `Remaining Receivable (Pabo): ${fmtTk(net)}`
        : net < 0
          ? `Remaining Payable (Debo): ${fmtTk(-net)}`
          : 'Fully Settled (৳ 0.00)';
    const linkLine =
      selectedContact.isShareEnabled && selectedContact.shareToken
        ? `\nLive Verified Ledger: ${window.location.origin}/?trust=${selectedContact.shareToken}`
        : '';
    const msg = `Hi ${selectedContact.name},\nUpdated HisabPro summary:\n${balanceLine}${linkLine}`;
    navigator.clipboard?.writeText(msg);
    notify('WhatsApp summary copied.');
  }

  async function submitQuickAction(e) {
    e.preventDefault();
    if (!selectedContact || !quickType) return;
    try {
      const targetBookId =
        activeBookId !== 'ALL' ? activeBookId : books.find((b) => b.isDefault)?.id || books[0]?.id;
      await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          bookId: targetBookId,
          type: quickType,
          amount: Number(quickAmount),
          walletId: quickWalletId || wallets[0]?.id || null,
          contactId: selectedContact.id,
          note: quickNote.trim() || undefined,
        }),
      });
      setQuickType(null);
      setQuickAmount('');
      setQuickNote('');
      await Promise.all([refreshBase(), loadContacts(), loadLedger(selectedContact.id)]);
      notify('Contact ledger updated.');
    } catch (err) {
      notify(err.message, true);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{t('contactsTitle')}</h1>
          <p className="text-xs text-[#A1A1AA]">
            {t('contactsSub')}
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          {t('addContact')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Directory */}
        <div className="space-y-3 lg:col-span-5">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchContact')}
              className="w-full rounded-xl border border-[#26262B] bg-[#141417] py-2 pl-9 pr-3 text-xs text-white focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {['all', 'pabo', 'debo', 'customer', 'supplier'].map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase ${
                  filter === t
                    ? 'bg-[#3B82F6] text-white'
                    : 'border border-[#26262B] bg-[#141417] text-[#A1A1AA]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {contacts.length === 0 ? (
              <div className="rounded-xl border border-[#26262B] bg-[#141417] p-6 text-center text-xs text-zinc-500">
                {t('noContacts')}
              </div>
            ) : (
              contacts.map((c) => {
                const net = c.netBalancePaisa;
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition ${
                      active
                        ? 'border-[#3B82F6] bg-[#1C1C21]'
                        : 'border-[#26262B] bg-[#141417] hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#26262B] bg-[#0A0A0B] text-xs font-bold text-zinc-200">
                        {getInitials(c.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                        <div className="truncate text-[11px] text-[#A1A1AA]">
                          {c.type}
                          {c.phone ? ` • ${c.phone}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div
                        className={`text-sm font-bold ${
                          net > 0 ? 'text-[#10B981]' : net < 0 ? 'text-[#F43F5E]' : 'text-zinc-500'
                        }`}
                      >
                        {fmtTk(Math.abs(net), false)}
                      </div>
                      <div className="text-[10px] uppercase text-zinc-500">
                        {net > 0 ? 'Pabo' : net < 0 ? 'Debo' : 'Settled'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Timeline */}
        <div className="lg:col-span-7">
          {selectedContact ? (
            <div className="space-y-5 rounded-2xl border border-[#26262B] bg-[#141417] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{selectedContact.name}</h2>
                    <span className="rounded bg-[#0A0A0B] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                      {selectedContact.type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#A1A1AA]">
                    {selectedContact.phone || 'No phone'}
                    {selectedContact.address ? ` • ${selectedContact.address}` : ''}
                  </p>
                  {selectedContact.note && (
                    <p className="mt-1 text-xs text-zinc-500">{selectedContact.note}</p>
                  )}
                </div>

                <div className="text-right tabular-nums">
                  <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">
                    {selectedContact.netBalancePaisa >= 0
                      ? 'Tumi Pabe (Receivable)'
                      : 'Tumi Dibe (Payable)'}
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      selectedContact.netBalancePaisa > 0
                        ? 'text-[#10B981]'
                        : selectedContact.netBalancePaisa < 0
                          ? 'text-[#F43F5E]'
                          : 'text-zinc-300'
                    }`}
                  >
                    {fmtTk(Math.abs(selectedContact.netBalancePaisa))}
                  </div>
                </div>
              </div>

              {/* Trust Link & WhatsApp Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={enableOrCopyTrustLink}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#3B82F6] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {selectedContact.isShareEnabled ? t('copyTrustLink') : t('enableTrustLink')}
                </button>
                {selectedContact.isShareEnabled && selectedContact.shareToken && (
                  <>
                    <a
                      href={`/?trust=${selectedContact.shareToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#0D4D39] bg-[#062B20] px-3 py-2 text-xs font-semibold text-[#10B981]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('openPublicView')}
                    </a>
                    <button
                      onClick={revokeTrustLink}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#5A1627] bg-[#310B15] px-3 py-2 text-xs font-semibold text-[#F43F5E]"
                    >
                      <ShieldOff className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  </>
                )}
                <button
                  onClick={copyWhatsAppSummary}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-600"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t('copyWhatsApp')}
                </button>
              </div>

              {/* Quick Ledger Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setQuickType('LEND');
                    setQuickWalletId(wallets[0]?.id || '');
                  }}
                  className="rounded-xl border border-[#5A1627] bg-[#310B15] py-2.5 text-xs font-semibold text-[#F43F5E]"
                >
                  {t('quickLend')}
                </button>
                <button
                  onClick={() => {
                    setQuickType('SETTLEMENT_IN');
                    setQuickWalletId(wallets[0]?.id || '');
                  }}
                  className="rounded-xl bg-[#10B981] py-2.5 text-xs font-bold text-[#062B20]"
                >
                  {t('quickReceive')}
                </button>
                <button
                  onClick={() => {
                    setQuickType('SETTLEMENT_OUT');
                    setQuickWalletId(wallets[0]?.id || '');
                  }}
                  className="rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 text-xs font-semibold text-zinc-200"
                >
                  {t('quickPay')}
                </button>
              </div>

              {quickType && (
                <form
                  onSubmit={submitQuickAction}
                  className="space-y-2.5 rounded-xl border border-[#3B82F6]/40 bg-[#0A0A0B] p-3.5 text-xs"
                >
                  <div className="font-semibold text-[#3B82F6]">
                    {quickType} with {selectedContact.name}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.01"
                      value={quickAmount}
                      onChange={(e) => setQuickAmount(e.target.value)}
                      placeholder="Amount (BDT)"
                      className="rounded-lg border border-[#26262B] bg-[#141417] px-3 py-2 text-white tabular-nums"
                    />
                    <select
                      value={quickWalletId}
                      onChange={(e) => setQuickWalletId(e.target.value)}
                      className="rounded-lg border border-[#26262B] bg-[#141417] px-3 py-2 text-white"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder="Optional note..."
                    className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-3 py-2 text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickType(null)}
                      className="flex-1 rounded-lg border border-[#26262B] py-1.5 text-zinc-400"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="flex-1 rounded-lg bg-[#3B82F6] py-1.5 font-semibold text-white">
                      Save Entry
                    </button>
                  </div>
                </form>
              )}

              {/* {t('historyTimeline')} */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  {t('historyTimeline')} ({ledgerTxs.length})
                </div>
                {ledgerTxs.length === 0 ? (
                  <div className="rounded-xl border border-[#26262B] bg-[#0A0A0B] p-6 text-center text-xs text-zinc-500">
                    {t('noContactEntries')}
                  </div>
                ) : (
                  ledgerTxs.map((tx) => (
                    <div
                      key={tx.id}
                      className={`rounded-xl border p-3.5 ${
                        tx.verificationStatus === 'DISPUTED'
                          ? 'border-[#573C0C] bg-[#2B1E06]/40'
                          : 'border-[#26262B] bg-[#0A0A0B]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] text-[#A1A1AA]">
                            {fmtDate(tx.transactionDate)} • {tx.type}
                            {tx.wallet ? ` • ${tx.wallet.name}` : ''}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-white">
                            {tx.note || tx.type}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-sm font-bold text-white">{fmtTk(tx.amountPaisa)}</div>
                          <span
                            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              tx.verificationStatus === 'CONFIRMED'
                                ? 'bg-[#062B20] text-[#10B981]'
                                : tx.verificationStatus === 'DISPUTED'
                                  ? 'bg-[#2B1E06] text-[#F59E0B]'
                                  : 'bg-[#1C1C21] text-[#A1A1AA]'
                            }`}
                          >
                            {tx.verificationStatus === 'CONFIRMED' && <CheckCircle2 className="h-3 w-3" />}
                            {tx.verificationStatus === 'DISPUTED' && <Flag className="h-3 w-3" />}
                            {tx.verificationStatus}
                          </span>
                        </div>
                      </div>

                      {tx.stockOrder?.items?.length > 0 && (
                        <div className="mt-2 rounded-lg border border-[#26262B] bg-[#141417] p-2.5 text-[11px] space-y-1">
                          <div className="font-semibold text-[#3B82F6]">
                            Invoice #{tx.stockOrder.orderNumber}
                          </div>
                          {tx.stockOrder.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-zinc-300 tabular-nums">
                              <span>
                                {item.quantity}x {item.product.name} @ {fmtTk(item.unitPricePaisa, false)}
                              </span>
                              <span className="font-semibold text-white">
                                {fmtTk(item.lineTotalPaisa, false)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {tx.disputeNote && (
                        <div className="mt-2 rounded-lg bg-[#2B1E06] px-3 py-1.5 text-xs text-[#F59E0B]">
                          {selectedContact.name}: &ldquo;{tx.disputeNote}&rdquo;
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-10 text-center text-xs text-zinc-500">
              Select a contact or create a new profile.
            </div>
          )}
        </div>
      </div>

      {/* {t('addContact')} Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 md:items-center md:p-4">
          <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#0D4D39] bg-[#062B20] text-sm font-bold text-[#10B981]">
                  {form.name ? getInitials(form.name) : <Contact2 className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{t('addContact')}</h3>
                  <p className="text-xs text-[#A1A1AA]">Duplicate phone check &amp; opening balance</p>
                </div>
              </div>
              <button onClick={() => setAddOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={pickFromPhonebook}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#26262B] bg-[#0A0A0B] py-2 text-xs font-medium text-zinc-300 hover:border-[#3B82F6]"
            >
              <Smartphone className="h-4 w-4 text-[#3B82F6]" />
              Import from Mobile Phonebook
            </button>

            <form onSubmit={submitNewContact} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Full Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Rahim Uddin or Karim Telecom"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="01711XXXXXX"
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">Address / Shop</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Station Road"
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[#A1A1AA]">Role</label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, type: r })}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                        form.type === r
                          ? 'border-[#3B82F6] bg-[#0F1E3A] text-[#3B82F6]'
                          : 'border-[#26262B] bg-[#0A0A0B] text-zinc-400'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[#A1A1AA]">Opening Balance (Purono Khata)</label>
                <div className="flex gap-2">
                  <div className="flex rounded-xl border border-[#26262B] bg-[#0A0A0B] p-1">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, openingDir: 'PABO' })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                        form.openingDir === 'PABO' ? 'bg-[#062B20] text-[#10B981]' : 'text-zinc-500'
                      }`}
                    >
                      Pabo
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, openingDir: 'DEBO' })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                        form.openingDir === 'DEBO' ? 'bg-[#310B15] text-[#F43F5E]' : 'text-zinc-500'
                      }`}
                    >
                      Debo
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.openingAmount}
                    onChange={(e) => setForm({ ...form, openingAmount: e.target.value })}
                    placeholder="0.00"
                    className="flex-1 rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-zinc-200">
                  <Link2 className="h-4 w-4 text-[#10B981]" />
                  Enable Zero-Dispute Live Trust Link
                </span>
                <input
                  type="checkbox"
                  checked={form.enableTrustLink}
                  onChange={(e) => setForm({ ...form, enableTrustLink: e.target.checked })}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>

              <button
                type="submit"
                disabled={savingContact}
                className="w-full rounded-xl bg-[#3B82F6] py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {savingContact ? 'Saving Profile...' : 'Save Contact Profile'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
