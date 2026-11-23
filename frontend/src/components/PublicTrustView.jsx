import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Flag, ShieldCheck } from 'lucide-react';
import { apiFetch, fmtDate, fmtTk } from '../lib/api';

export default function PublicTrustView({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [flagTxId, setFlagTxId] = useState(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadTrust = useCallback(async () => {
    try {
      const res = await apiFetch(`/public/trust/${token}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    loadTrust();
  }, [loadTrust]);

  async function verifyEntry(txId, status) {
    setBusyId(txId);
    try {
      await apiFetch(`/public/trust/${token}/transactions/${txId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          disputeNote: status === 'DISPUTED' ? disputeNote : undefined,
        }),
      });
      setFlagTxId(null);
      setDisputeNote('');
      await loadTrust();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] p-4">
        <div className="max-w-sm rounded-2xl border border-[#5A1627] bg-[#141417] p-6 text-center">
          <h1 className="text-base font-bold text-[#F43F5E]">Link Unavailable</h1>
          <p className="mt-2 text-xs text-[#A1A1AA]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] text-sm text-[#A1A1AA]">
        Loading verified live ledger...
      </div>
    );
  }

  const net = data.contact.netBalancePaisa;

  return (
    <div className="min-h-screen bg-[#0A0A0B] px-4 py-8 text-[#FAFAFA]">
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-[#1E3A6E] bg-[#0F1E3A] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3B82F6] text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              Verified Live Ledger by {data.ownerName}
            </div>
            <div className="text-xs text-[#A1A1AA]">Read-only • Real-time synced • No login needed</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-6 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA]">
            Current Net Balance for {data.contact.name}
          </div>
          <div className="mt-2 text-4xl font-bold text-white tabular-nums">
            {fmtTk(Math.abs(net))}
          </div>
          <div className="mt-3">
            <span
              className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
                net > 0
                  ? 'border-[#5A1627] bg-[#310B15] text-[#F43F5E]'
                  : net < 0
                    ? 'border-[#0D4D39] bg-[#062B20] text-[#10B981]'
                    : 'border-[#26262B] bg-[#1C1C21] text-zinc-300'
              }`}
            >
              {net > 0
                ? `You owe ${data.ownerName} ${fmtTk(net, false)}`
                : net < 0
                  ? `${data.ownerName} owes you ${fmtTk(-net, false)}`
                  : 'Fully Settled ✓'}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Transaction History ({data.transactions.length})
          </div>

          {data.transactions.map((tx) => (
            <div
              key={tx.id}
              className="space-y-3 rounded-2xl border border-[#26262B] bg-[#141417] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[#A1A1AA]">
                    {fmtDate(tx.transactionDate)}
                    {tx.wallet ? ` • ${tx.wallet.name}` : ''}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-white">{tx.note || tx.type}</div>
                </div>
                <div className="text-right text-base font-bold text-white tabular-nums">
                  {fmtTk(tx.amountPaisa)}
                </div>
              </div>

              {tx.stockOrder?.items?.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3 text-xs">
                  <div className="font-semibold text-[#3B82F6]">
                    Invoice #{tx.stockOrder.orderNumber}
                  </div>
                  {tx.stockOrder.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-zinc-300 tabular-nums">
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

              {tx.verificationStatus === 'PENDING' ? (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={busyId === tx.id}
                      onClick={() => verifyEntry(tx.id, 'CONFIRMED')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#10B981] py-2 text-xs font-bold text-[#062B20]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirm Entry
                    </button>
                    <button
                      disabled={busyId === tx.id}
                      onClick={() => setFlagTxId(flagTxId === tx.id ? null : tx.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#573C0C] bg-[#2B1E06] py-2 text-xs font-semibold text-[#F59E0B]"
                    >
                      <Flag className="h-3.5 w-3.5" />
                      Flag Issue
                    </button>
                  </div>

                  {flagTxId === tx.id && (
                    <div className="space-y-2 rounded-xl bg-[#0A0A0B] p-3">
                      <input
                        value={disputeNote}
                        onChange={(e) => setDisputeNote(e.target.value)}
                        placeholder="Write what looks incorrect..."
                        className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-3 py-2 text-xs text-white"
                      />
                      <button
                        disabled={!disputeNote.trim() || busyId === tx.id}
                        onClick={() => verifyEntry(tx.id, 'DISPUTED')}
                        className="w-full rounded-lg bg-[#F59E0B] py-2 text-xs font-bold text-black disabled:opacity-40"
                      >
                        Submit Flag Note
                      </button>
                    </div>
                  )}
                </div>
              ) : tx.verificationStatus === 'CONFIRMED' ? (
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#10B981]">
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmed by you
                </div>
              ) : (
                <div className="rounded-lg bg-[#2B1E06] px-3 py-2 text-xs text-[#F59E0B]">
                  Flagged: &ldquo;{tx.disputeNote}&rdquo;
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="pt-2 text-center text-[11px] text-zinc-500">
          Powered by HisabPro v2.0 • Zero-Dispute Ledger
        </p>
      </div>
    </div>
  );
}
