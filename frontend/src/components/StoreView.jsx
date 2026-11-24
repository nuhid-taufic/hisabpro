import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Flame,
  History,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch, fmtDate, fmtTk } from '../lib/api';
import { useI18n } from '../context/I18nContext';

const BD_NOTES = [1000, 500, 200, 100, 50, 20, 10];

export default function StoreView({ books, activeBookId, wallets, contacts, refreshBase, notify }) {
  const { t } = useI18n();
  const storeBook = useMemo(() => {
    const selected = books.find((b) => b.id === activeBookId && b.bookType === 'STORE');
    return selected || books.find((b) => b.bookType === 'STORE') || books[0] || null;
  }, [books, activeBookId]);

  const [subTab, setSubTab] = useState('pos');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [trending, setTrending] = useState(null);
  const [trendDays, setTrendDays] = useState(30);

  // POS Cart State
  const [orderType, setOrderType] = useState('SALE');
  const [cart, setCart] = useState([]);
  const [contactId, setContactId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Inventory Add Product State
  const [pForm, setPForm] = useState({
    name: '',
    sku: '',
    unit: 'pcs',
    costPrice: '',
    mrpPrice: '',
    minSellPrice: '',
    openingStock: '10',
    lowStockLimit: '5',
  });

  // Stock Adjust & Movement Log Modal State
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustReason, setAdjustReason] = useState('DAMAGE');
  const [adjustQty, setAdjustQty] = useState('-1');
  const [adjustNote, setAdjustNote] = useState('');
  const [movementModal, setMovementModal] = useState(null);

  // Daily Cash Closing State
  const [closingWalletId, setClosingWalletId] = useState('');
  const [closingDate, setClosingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedData, setExpectedData] = useState(null);
  const [notesCount, setNotesCount] = useState({
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
  });
  const [manualActualCash, setManualActualCash] = useState('');
  const [closingNote, setClosingNote] = useState('');

  useEffect(() => {
    if (wallets.length > 0 && !walletId) {
      const cashBox = wallets.find((w) => w.name.toLowerCase().includes('cash box')) || wallets[0];
      setWalletId(cashBox.id);
      setClosingWalletId(cashBox.id);
    }
  }, [wallets, walletId]);

  const loadStore = useCallback(async () => {
    if (!storeBook) return;
    try {
      const [pRes, oRes, tRes] = await Promise.all([
        apiFetch(`/store/products?bookId=${storeBook.id}`),
        apiFetch(`/store/orders?bookId=${storeBook.id}`),
        apiFetch(`/store/analytics/trending?bookId=${storeBook.id}&days=${trendDays}`),
      ]);
      setProducts(pRes.products || []);
      setOrders(oRes.orders || []);
      setTrending(tRes);
    } catch (err) {
      notify(err.message, true);
    }
  }, [storeBook, trendDays, notify]);

  const loadExpectedCash = useCallback(async () => {
    if (!storeBook || !closingWalletId) return;
    try {
      const res = await apiFetch(
        `/store/cash-closing/expected?bookId=${storeBook.id}&walletId=${closingWalletId}&date=${closingDate}`
      );
      setExpectedData(res);
    } catch (err) {
      notify(err.message, true);
    }
  }, [storeBook, closingWalletId, closingDate, notify]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  useEffect(() => {
    if (subTab === 'closing') loadExpectedCash();
  }, [subTab, loadExpectedCash]);

  function addToCart(product) {
    setCart((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (found) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          unitPrice: orderType === 'SALE' ? product.mrpPricePaisa / 100 : product.costPricePaisa / 100,
        },
      ];
    });
  }

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const netTotal = Math.max(0, subtotal - (Number(discount) || 0));
  const paidNum = paidAmount === '' ? netTotal : Number(paidAmount) || 0;
  const dueNum = Math.max(0, netTotal - paidNum);

  async function submitOrder(e) {
    e.preventDefault();
    if (!storeBook || cart.length === 0) return;
    setSubmittingOrder(true);
    try {
      const res = await apiFetch('/store/orders', {
        method: 'POST',
        body: JSON.stringify({
          bookId: storeBook.id,
          type: orderType,
          contactId: contactId || null,
          walletId: paidNum > 0 ? walletId : null,
          discount: Number(discount) || 0,
          paidAmount: paidNum,
          note: orderNote.trim() || undefined,
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
          })),
        }),
      });
      notify(
        `${res.order.orderNumber} saved! Stock, wallet & party ledger updated.${
          res.lossWarnings?.length ? ' (Note: Sold below cost)' : ''
        }`
      );
      setCart([]);
      setDiscount('0');
      setPaidAmount('');
      setOrderNote('');
      await Promise.all([refreshBase(), loadStore()]);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function submitNewProduct(e) {
    e.preventDefault();
    if (!storeBook) return;
    try {
      await apiFetch('/store/products', {
        method: 'POST',
        body: JSON.stringify({
          bookId: storeBook.id,
          name: pForm.name,
          sku: pForm.sku || undefined,
          unit: pForm.unit || 'pcs',
          costPrice: Number(pForm.costPrice),
          mrpPrice: Number(pForm.mrpPrice),
          minSellPrice: pForm.minSellPrice !== '' ? Number(pForm.minSellPrice) : undefined,
          openingStock: Number(pForm.openingStock) || 0,
          lowStockLimit: Number(pForm.lowStockLimit) || 5,
        }),
      });
      notify(`"${pForm.name}" added to inventory.`);
      setPForm({
        name: '',
        sku: '',
        unit: 'pcs',
        costPrice: '',
        mrpPrice: '',
        minSellPrice: '',
        openingStock: '10',
        lowStockLimit: '5',
      });
      loadStore();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function submitStockAdjust(e) {
    e.preventDefault();
    if (!adjustProduct) return;
    try {
      const signedQty =
        adjustReason === 'DAMAGE' || adjustReason === 'RETURN_OUT'
          ? -Math.abs(Number(adjustQty))
          : adjustReason === 'RETURN_IN'
            ? Math.abs(Number(adjustQty))
            : Number(adjustQty);

      await apiFetch(`/store/products/${adjustProduct.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          reason: adjustReason,
          quantityChange: signedQty,
          note: adjustNote.trim() || undefined,
        }),
      });
      notify(`Stock updated for ${adjustProduct.name}.`);
      setAdjustProduct(null);
      setAdjustNote('');
      loadStore();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function openMovements(product) {
    try {
      const res = await apiFetch(`/store/products/${product.id}/movements`);
      setMovementModal({ product: res.product, movements: res.movements || [] });
    } catch (err) {
      notify(err.message, true);
    }
  }

  const countedFromNotes = BD_NOTES.reduce((s, d) => s + d * (notesCount[d] || 0), 0);
  const actualCashFinal =
    manualActualCash.trim() !== '' ? Number(manualActualCash) || 0 : countedFromNotes;
  const expectedCashTaka = (expectedData?.expectedCashPaisa || 0) / 100;
  const cashDiff = Number((actualCashFinal - expectedCashTaka).toFixed(2));

  async function submitDayClose() {
    if (!storeBook || !closingWalletId) return;
    try {
      await apiFetch('/store/cash-closing', {
        method: 'POST',
        body: JSON.stringify({
          bookId: storeBook.id,
          walletId: closingWalletId,
          closingDate,
          actualCash: actualCashFinal,
          denominationJson: Object.fromEntries(
            Object.entries(notesCount).map(([k, v]) => [String(k), v])
          ),
          autoReconcile: true,
          note: closingNote.trim() || undefined,
        }),
      });
      notify('Daily Cash Closing confirmed & wallet reconciled.');
      setClosingNote('');
      await Promise.all([refreshBase(), loadExpectedCash()]);
    } catch (err) {
      notify(err.message, true);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{t('storeTitle')}</h1>
          <p className="text-xs text-[#A1A1AA]">
            Store Book: <strong className="text-zinc-200">{storeBook?.name || 'My Store'}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-[#26262B] bg-[#141417] p-1">
          {[
            { id: 'pos', label: t('tabPos'), icon: ShoppingCart },
            { id: 'inventory', label: t('tabInventory'), icon: Package },
            { id: 'orders', label: t('tabInvoices'), icon: Receipt },
            { id: 'trending', label: t('tabTrending'), icon: Flame },
            { id: 'closing', label: t('tabClosing'), icon: Calculator },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  subTab === t.id ? 'bg-[#3B82F6] text-white' : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUBTAB 1: POS SALE & PURCHASE WITH MANUAL MRP OVERRIDE */}
      {subTab === 'pos' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#A1A1AA]">
                {t('tapProduct')}
              </span>
              <div className="flex rounded-lg border border-[#26262B] bg-[#141417] p-0.5 text-xs">
                <button
                  onClick={() => {
                    setOrderType('SALE');
                    setCart([]);
                  }}
                  className={`rounded-md px-3 py-1 font-semibold ${
                    orderType === 'SALE' ? 'bg-[#10B981] text-[#062B20]' : 'text-zinc-400'
                  }`}
                >
                  {t('saleMode')}
                </button>
                <button
                  onClick={() => {
                    setOrderType('PURCHASE');
                    setCart([]);
                  }}
                  className={`rounded-md px-3 py-1 font-semibold ${
                    orderType === 'PURCHASE' ? 'bg-[#3B82F6] text-white' : 'text-zinc-400'
                  }`}
                >
                  {t('purchaseMode')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="rounded-xl border border-[#26262B] bg-[#141417] p-3.5 text-left transition hover:border-[#3B82F6]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{p.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        p.isLowStock
                          ? 'bg-[#310B15] text-[#F43F5E] border border-[#5A1627]'
                          : 'bg-[#1C1C21] text-zinc-300'
                      }`}
                    >
                      {p.currentStock} {p.unit}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between text-xs tabular-nums">
                    <span className="text-zinc-500">Cost: {fmtTk(p.costPricePaisa, false)}</span>
                    <span className="font-bold text-[#10B981]">
                      MRP: {fmtTk(p.mrpPricePaisa, false)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={submitOrder}
            className="h-fit space-y-4 rounded-2xl border border-[#26262B] bg-[#141417] p-5 lg:col-span-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">
                {orderType === 'SALE'
                  ? 'POS Sale Bill (Manual MRP Override)'
                  : 'Stock Purchase (Updates Weighted Avg Cost)'}
              </h2>
              <span className="text-xs text-[#A1A1AA]">{cart.length} items</span>
            </div>

            {cart.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#26262B] bg-[#0A0A0B] py-8 text-center text-xs text-zinc-500">
                {t('emptyCart')}
              </div>
            ) : (
              <div className="space-y-2.5">
                {cart.map((line) => {
                  const mrp = line.product.mrpPricePaisa / 100;
                  const cost = line.product.costPricePaisa / 100;
                  const diff = Number((line.unitPrice - mrp).toFixed(2));
                  const isLoss = orderType === 'SALE' && line.unitPrice < cost;

                  return (
                    <div
                      key={line.product.id}
                      className={`rounded-xl border p-3 ${
                        isLoss
                          ? 'border-[#5A1627] bg-[#310B15]/50'
                          : 'border-[#26262B] bg-[#0A0A0B]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{line.product.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) => prev.filter((x) => x.product.id !== line.product.id))
                          }
                          className="text-zinc-500 hover:text-[#F43F5E]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-3 items-center gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] text-zinc-500">Qty</label>
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={line.quantity}
                            onChange={(e) => {
                              const q = Number(e.target.value) || 0;
                              setCart((prev) =>
                                prev.map((x) =>
                                  x.product.id === line.product.id ? { ...x, quantity: q } : x
                                )
                              );
                            }}
                            className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2 py-1 text-white tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-500">
                            {orderType === 'SALE' ? `Price (MRP ৳${mrp})` : 'Buy Price (Tk)'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => {
                              const p = Number(e.target.value) || 0;
                              setCart((prev) =>
                                prev.map((x) =>
                                  x.product.id === line.product.id ? { ...x, unitPrice: p } : x
                                )
                              );
                            }}
                            className="w-full rounded-lg border border-[#3B82F6]/60 bg-[#141417] px-2 py-1 font-bold text-white tabular-nums"
                          />
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-[10px] text-zinc-500">Line Total</div>
                          <div className="text-sm font-bold text-white">
                            {fmtTk(line.quantity * line.unitPrice * 100, false)}
                          </div>
                        </div>
                      </div>

                      {orderType === 'SALE' && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          {isLoss && (
                            <span className="inline-flex items-center gap-1 rounded bg-[#310B15] px-2 py-0.5 font-semibold text-[#F43F5E]">
                              <AlertTriangle className="h-3 w-3" />
                              Selling at Loss (Cost ৳{cost})
                            </span>
                          )}
                          {diff < 0 && !isLoss && (
                            <span className="rounded bg-[#2B1E06] px-2 py-0.5 text-[#F59E0B]">
                              {diff} Tk below MRP
                            </span>
                          )}
                          {diff > 0 && (
                            <span className="rounded bg-[#062B20] px-2 py-0.5 text-[#10B981]">
                              +{diff} Tk above MRP
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="mb-1 block text-[#A1A1AA]">
                  {orderType === 'SALE' ? 'Customer (Required for Baki)' : 'Supplier'}
                </label>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                >
                  <option value="">Walk-in (Cash Only)</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Wallet</label>
                <select
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Extra Bill Discount (BDT)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Paid Now (Blank = Full)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder={netTotal.toFixed(2)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                />
              </div>
            </div>

            <input
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Optional bill note..."
              className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-xs text-white"
            />

            <div className="space-y-1 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3.5 text-xs tabular-nums">
              <div className="flex justify-between text-[#A1A1AA]">
                <span>{t('netBillTotal')}</span>
                <span className="text-sm font-bold text-white">{fmtTk(netTotal * 100)}</span>
              </div>
              <div className="flex justify-between text-[#A1A1AA]">
                <span>Paid Now</span>
                <span className="font-semibold text-[#10B981]">{fmtTk(paidNum * 100)}</span>
              </div>
              <div className="flex justify-between text-[#A1A1AA]">
                <span>Baki (Syncs to Contact &amp; Trust Link)</span>
                <span className="font-semibold text-[#F59E0B]">{fmtTk(dueNum * 100)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={cart.length === 0 || submittingOrder}
              className="w-full rounded-xl bg-[#3B82F6] py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {submittingOrder
                ? 'Saving Order...'
                : `Confirm ${orderType === 'SALE' ? 'Sale Invoice' : 'Stock Purchase'}`}
            </button>
          </form>
        </div>
      )}

      {/* SUBTAB 2: INVENTORY CATALOG + DAMAGE/RETURN ADJUST + MOVEMENT HISTORY */}
      {subTab === 'inventory' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={submitNewProduct}
            className="h-fit space-y-3 rounded-2xl border border-[#26262B] bg-[#141417] p-5 text-xs lg:col-span-5"
          >
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <Plus className="h-4 w-4 text-[#3B82F6]" /> {t('addProduct')}
            </h2>
            <input
              required
              value={pForm.name}
              onChange={(e) => setPForm({ ...pForm, name: e.target.value })}
              placeholder="Product Name *"
              className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-sm text-white"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                value={pForm.sku}
                onChange={(e) => setPForm({ ...pForm, sku: e.target.value })}
                placeholder="SKU / Code (Optional)"
                className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
              />
              <input
                value={pForm.unit}
                onChange={(e) => setPForm({ ...pForm, unit: e.target.value })}
                placeholder="Unit (pcs, kg, box)"
                className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-[#A1A1AA]">Cost (Tk) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={pForm.costPrice}
                  onChange={(e) => setPForm({ ...pForm, costPrice: e.target.value })}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2.5 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#A1A1AA]">MRP (Tk) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={pForm.mrpPrice}
                  onChange={(e) => setPForm({ ...pForm, mrpPrice: e.target.value })}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2.5 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#A1A1AA]">Min Sell</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pForm.minSellPrice}
                  onChange={(e) => setPForm({ ...pForm, minSellPrice: e.target.value })}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2.5 py-2 text-white tabular-nums"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-[#A1A1AA]">Opening Stock</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={pForm.openingStock}
                  onChange={(e) => setPForm({ ...pForm, openingStock: e.target.value })}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#A1A1AA]">Low Stock Alert Limit</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={pForm.lowStockLimit}
                  onChange={(e) => setPForm({ ...pForm, lowStockLimit: e.target.value })}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white hover:bg-blue-500"
            >
              {t('saveProduct')}
            </button>
          </form>

          <div className="space-y-2.5 lg:col-span-7">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26262B] bg-[#141417] p-4"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  <div className="mt-0.5 text-xs text-[#A1A1AA] tabular-nums">
                    Cost {fmtTk(p.costPricePaisa, false)} • MRP {fmtTk(p.mrpPricePaisa, false)}
                    {p.sku ? ` • ${p.sku}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right tabular-nums">
                    <div
                      className={`text-sm font-bold ${
                        p.isLowStock ? 'text-[#F43F5E]' : 'text-[#10B981]'
                      }`}
                    >
                      {p.currentStock} {p.unit}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Val: {fmtTk(p.stockValuePaisa, false)}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setAdjustProduct(p);
                      setAdjustReason('DAMAGE');
                      setAdjustQty('1');
                    }}
                    title="Damage / Return / Adjust Stock"
                    className="rounded-lg border border-[#26262B] bg-[#0A0A0B] p-2 text-zinc-300 hover:border-[#3B82F6]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => openMovements(p)}
                    title="View Stock Movement Log"
                    className="rounded-lg border border-[#26262B] bg-[#0A0A0B] p-2 text-zinc-300 hover:border-[#3B82F6]"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 3: INVOICE & PURCHASE HISTORY */}
      {subTab === 'orders' && (
        <div className="space-y-2.5">
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-8 text-center text-xs text-zinc-500">
              No store invoices or purchases recorded yet.
            </div>
          ) : (
            orders.map((ord) => (
              <div
                key={ord.id}
                className="space-y-2.5 rounded-2xl border border-[#26262B] bg-[#141417] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        ord.type === 'SALE'
                          ? 'bg-[#062B20] text-[#10B981]'
                          : 'bg-[#0F1E3A] text-[#3B82F6]'
                      }`}
                    >
                      {ord.orderNumber}
                    </span>
                    <span className="text-xs text-[#A1A1AA]">
                      {fmtDate(ord.orderDate)} • {ord.contact?.name || 'Walk-in Cash'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="font-bold text-white">Total: {fmtTk(ord.totalAmountPaisa)}</span>
                    {ord.dueAmountPaisa > 0 && (
                      <span className="rounded bg-[#2B1E06] px-2 py-0.5 font-semibold text-[#F59E0B]">
                        Due {fmtTk(ord.dueAmountPaisa, false)}
                      </span>
                    )}
                    {ord.type === 'SALE' && (
                      <span className="rounded bg-[#062B20] px-2 py-0.5 font-semibold text-[#10B981]">
                        Profit {fmtTk(ord.profitPaisa, false)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1 rounded-xl bg-[#0A0A0B] p-3 text-xs">
                  {ord.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-zinc-300 tabular-nums">
                      <span>
                        {item.quantity}x {item.product.name} @ {fmtTk(item.unitPricePaisa, false)}{' '}
                        {item.priceVariancePaisa !== 0 && (
                          <span className="text-[10px] text-zinc-500">
                            (MRP {fmtTk(item.mrpPricePaisa, false)})
                          </span>
                        )}
                      </span>
                      <span className="font-semibold text-white">
                        {fmtTk(item.lineTotalPaisa, false)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUBTAB 4: TRENDING & DEAD STOCK ANALYTICS */}
      {subTab === 'trending' && trending && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <div className="flex gap-1 rounded-xl border border-[#26262B] bg-[#141417] p-1 text-xs">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setTrendDays(d)}
                  className={`rounded-lg px-3 py-1 font-semibold ${
                    trendDays === d ? 'bg-[#3B82F6] text-white' : 'text-[#A1A1AA]'
                  }`}
                >
                  Last {d} Days
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-5">
              <h2 className="mb-3 text-sm font-bold text-white">{t('topSelling')}</h2>
              {trending.topSelling.length === 0 ? (
                <p className="text-xs text-zinc-500">No sales in this period.</p>
              ) : (
                <div className="space-y-2">
                  {trending.topSelling.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between rounded-xl bg-[#0A0A0B] p-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{item.name}</div>
                        <div className="text-[#A1A1AA]">
                          Sold: {item.qtySold} {item.unit} • Stock left: {item.currentStock}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="font-bold text-[#10B981]">
                          Profit {fmtTk(item.profitPaisa, false)}
                        </div>
                        <div className="text-zinc-500">Rev {fmtTk(item.revenuePaisa, false)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-[#5A1627] bg-[#310B15]/25 p-5">
                <h2 className="mb-3 text-sm font-bold text-[#F43F5E]">{t('lowStockRadar')}</h2>
                {trending.lowStockRadar.length === 0 ? (
                  <p className="text-xs text-zinc-400">All products are stocked above limit.</p>
                ) : (
                  trending.lowStockRadar.map((item) => (
                    <div
                      key={item.productId}
                      className="mb-2 flex justify-between rounded-lg bg-[#0A0A0B]/80 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-white">{item.name}</span>
                      <span className="font-bold text-[#F43F5E]">
                        {item.currentStock} left (Limit {item.lowStockLimit})
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-5">
                <h2 className="mb-3 text-sm font-bold text-zinc-200">
                  Dead Stock (0 Sales in {trendDays}d)
                </h2>
                {trending.deadStock.length === 0 ? (
                  <p className="text-xs text-zinc-500">Every stocked product moved.</p>
                ) : (
                  trending.deadStock.map((item) => (
                    <div
                      key={item.productId}
                      className="mb-2 flex justify-between rounded-lg bg-[#0A0A0B] px-3 py-2 text-xs"
                    >
                      <span className="text-zinc-200">{item.name}</span>
                      <span className="text-[#A1A1AA]">{item.currentStock} sitting</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: REAL DAILY CASH CLOSING (OPENING + IN - OUT) */}
      {subTab === 'closing' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 rounded-2xl border border-[#26262B] bg-[#141417] p-5 lg:col-span-6">
            <h2 className="text-sm font-bold text-white">{t('noteCounter')}</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Cash Box Wallet</label>
                <select
                  value={closingWalletId}
                  onChange={(e) => setClosingWalletId(e.target.value)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Closing Date</label>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              {BD_NOTES.map((noteVal) => (
                <div
                  key={noteVal}
                  className="flex items-center justify-between rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2 text-sm tabular-nums"
                >
                  <span className="w-24 font-semibold text-zinc-300">৳ {noteVal} ×</span>
                  <input
                    type="number"
                    min="0"
                    value={notesCount[noteVal] || 0}
                    onChange={(e) => {
                      setManualActualCash('');
                      setNotesCount((prev) => ({
                        ...prev,
                        [noteVal]: Math.max(0, Number(e.target.value) || 0),
                      }));
                    }}
                    className="w-24 rounded-lg border border-[#26262B] bg-[#141417] px-2.5 py-1 text-center font-bold text-white"
                  />
                  <span className="w-28 text-right font-semibold text-zinc-200">
                    {fmtTk(noteVal * (notesCount[noteVal] || 0) * 100, false)}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#A1A1AA]">
                Or Enter Counted Total Directly (Overrides Notes)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={manualActualCash}
                onChange={(e) => setManualActualCash(e.target.value)}
                placeholder={countedFromNotes.toFixed(2)}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2.5 text-sm font-bold text-white tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-4 lg:col-span-6">
            <div className="space-y-4 rounded-2xl border border-[#26262B] bg-[#141417] p-5">
              <h2 className="text-sm font-bold text-white">{t('expectedVsPhysical')}</h2>
              <div className="space-y-2.5 rounded-xl bg-[#0A0A0B] p-4 text-sm tabular-nums">
                <div className="flex justify-between text-[#A1A1AA]">
                  <span>{t('openingCash')}</span>
                  <span className="font-semibold text-white">
                    {fmtTk(expectedData?.openingCashPaisa)}
                  </span>
                </div>
                <div className="flex justify-between text-[#A1A1AA]">
                  <span>+ Cash In Today (Sales &amp; Adoy)</span>
                  <span className="font-semibold text-[#10B981]">
                    {fmtTk(expectedData?.cashInTotalPaisa)}
                  </span>
                </div>
                <div className="flex justify-between text-[#A1A1AA]">
                  <span>- Cash Out Today (Expenses &amp; Purchases)</span>
                  <span className="font-semibold text-[#F43F5E]">
                    {fmtTk(expectedData?.cashOutTotalPaisa)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#26262B] pt-2.5 font-bold text-white">
                  <span>{t('expectedInBox')}</span>
                  <span>{fmtTk(expectedData?.expectedCashPaisa)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#3B82F6]">
                  <span>{t('physicalCounted')}</span>
                  <span>{fmtTk(actualCashFinal * 100)}</span>
                </div>
              </div>

              <div
                className={`rounded-xl border p-4 text-center ${
                  cashDiff === 0
                    ? 'border-[#0D4D39] bg-[#062B20] text-[#10B981]'
                    : cashDiff < 0
                      ? 'border-[#5A1627] bg-[#310B15] text-[#F43F5E]'
                      : 'border-[#573C0C] bg-[#2B1E06] text-[#F59E0B]'
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-wider">
                  {cashDiff === 0
                    ? 'Exact Match ✓'
                    : cashDiff < 0
                      ? 'Cash Shortage (Ghatti)'
                      : 'Cash Surplus (Barti)'}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {cashDiff > 0 ? '+' : ''}
                  {fmtTk(cashDiff * 100)}
                </div>
              </div>

              <input
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
                placeholder="Optional closing note..."
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-xs text-white"
              />

              <button
                onClick={submitDayClose}
                className="w-full rounded-xl bg-[#3B82F6] py-3 text-sm font-semibold text-white hover:bg-blue-500"
              >
                {t('confirmDayClose')}
              </button>
            </div>

            {expectedData?.history?.length > 0 && (
              <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-5">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#A1A1AA]">
                  Recent Closed Days
                </h3>
                <div className="space-y-2 text-xs tabular-nums">
                  {expectedData.history.map((h) => (
                    <div
                      key={h.id}
                      className="flex justify-between rounded-lg bg-[#0A0A0B] px-3 py-2"
                    >
                      <span className="text-zinc-300">{fmtDate(h.closingDate)}</span>
                      <span className="font-semibold text-white">
                        Actual: {fmtTk(h.actualCashPaisa, false)}
                      </span>
                      <span
                        className={
                          h.discrepancyPaisa === 0
                            ? 'text-[#10B981]'
                            : h.discrepancyPaisa < 0
                              ? 'text-[#F43F5E]'
                              : 'text-[#F59E0B]'
                        }
                      >
                        {h.discrepancyPaisa === 0
                          ? 'Match'
                          : `${h.discrepancyPaisa > 0 ? '+' : ''}${fmtTk(h.discrepancyPaisa, false)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stock Damage / Return Adjustment Modal */}
      {adjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Adjust Stock: {adjustProduct.name}</h3>
              <button onClick={() => setAdjustProduct(null)} className="text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitStockAdjust} className="space-y-3 text-xs">
              <select
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
              >
                <option value="DAMAGE">Damage / Loss (Stock -)</option>
                <option value="RETURN_IN">Customer Return (Stock +)</option>
                <option value="RETURN_OUT">Supplier Return (Stock -)</option>
                <option value="MANUAL_ADJUST">Manual Audit (+/-)</option>
              </select>
              <input
                type="number"
                required
                step="any"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="Quantity"
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white tabular-nums"
              />
              <input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Reason note..."
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white"
              >
                Apply Stock Adjustment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement Audit History Modal */}
      {movementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Stock Audit Log: {movementModal.product.name}
              </h3>
              <button onClick={() => setMovementModal(null)} className="text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto text-xs">
              {movementModal.movements.length === 0 ? (
                <p className="text-zinc-500">No stock movements logged yet.</p>
              ) : (
                movementModal.movements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg bg-[#0A0A0B] px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold text-white">{m.reason}</div>
                      <div className="text-[11px] text-[#A1A1AA]">
                        {fmtDate(m.createdAt)} {m.note ? `• ${m.note}` : ''}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div
                        className={`font-bold ${
                          m.quantityChange > 0 ? 'text-[#10B981]' : 'text-[#F43F5E]'
                        }`}
                      >
                        {m.quantityChange > 0 ? '+' : ''}
                        {m.quantityChange}
                      </div>
                      <div className="text-[10px] text-zinc-500">Bal: {m.balanceAfter}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
