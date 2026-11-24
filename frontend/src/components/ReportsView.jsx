import React, { useCallback, useEffect, useState } from 'react';
import { FileJson, FileSpreadsheet, Printer } from 'lucide-react';
import { API_BASE, apiFetch, fmtTk } from '../lib/api';
import { useI18n } from '../context/I18nContext';

export default function ReportsView({ activeBookId, notify }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [exporting, setExporting] = useState(null);

  const loadReports = useCallback(async () => {
    try {
      const res = await apiFetch(`/reports/summary?bookId=${encodeURIComponent(activeBookId)}`);
      setData(res);
    } catch (err) {
      notify(err.message, true);
    }
  }, [activeBookId, notify]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function downloadExport(format) {
    setExporting(format);
    try {
      const res = await fetch(
        `${API_BASE}/reports/export?format=${format}&bookId=${encodeURIComponent(activeBookId)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download =
        format === 'json' ? `hisabpro-backup-${today}.json` : `hisabpro-statement-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify(`Downloaded ${format.toUpperCase()} export.`);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setExporting(null);
    }
  }

  const maxCat = Math.max(1, ...(data?.categoryBreakdown?.map((c) => c.amountPaisa) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{t('reportsTitle')}</h1>
          <p className="text-xs text-[#A1A1AA]">
            {data?.monthLabel || 'Current Month'} financial breakdown &amp; exports
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            disabled={exporting === 'csv'}
            onClick={() => downloadExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3B82F6] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('exportCsv')}
          </button>
          <button
            disabled={exporting === 'json'}
            onClick={() => downloadExport('json')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#26262B] bg-[#141417] px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-[#10B981] disabled:opacity-50"
          >
            <FileJson className="h-4 w-4 text-[#10B981]" />
            {t('fullJsonBackup')}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#26262B] bg-[#141417] px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-[#3B82F6]"
          >
            <Printer className="h-4 w-4" />
            {t('printPdf')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
          <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('monthIncome')}</div>
          <div className="mt-1 text-xl font-bold text-[#10B981] tabular-nums">
            {fmtTk(data?.kpis?.monthIncomePaisa)}
          </div>
        </div>
        <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
          <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('monthExpense')}</div>
          <div className="mt-1 text-xl font-bold text-[#F43F5E] tabular-nums">
            {fmtTk(data?.kpis?.monthExpensePaisa)}
          </div>
        </div>
        <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
          <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">
            Store Sales ({data?.kpis?.monthOrderCount || 0} orders)
          </div>
          <div className="mt-1 text-xl font-bold text-white tabular-nums">
            {fmtTk(data?.kpis?.monthStoreSalesPaisa)}
          </div>
        </div>
        <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
          <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('storeProfit')}</div>
          <div className="mt-1 text-xl font-bold text-[#3B82F6] tabular-nums">
            {fmtTk(data?.kpis?.monthStoreProfitPaisa)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-5">
          <h2 className="mb-4 text-sm font-bold text-white">{t('expenseByCategory')}</h2>
          {!data?.categoryBreakdown?.length ? (
            <p className="text-xs text-zinc-500">No categorized expenses recorded this month.</p>
          ) : (
            <div className="space-y-3">
              {data.categoryBreakdown.map((cat) => (
                <div key={cat.name}>
                  <div className="mb-1 flex justify-between text-xs tabular-nums">
                    <span className="font-medium text-zinc-200">{cat.name}</span>
                    <span className="text-[#A1A1AA]">{fmtTk(cat.amountPaisa)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#0A0A0B]">
                    <div
                      className="h-full rounded-full bg-[#3B82F6]"
                      style={{ width: `${Math.max(6, (cat.amountPaisa / maxCat) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-5">
          <h2 className="mb-4 text-sm font-bold text-white">{t('tagSpend')}</h2>
          {!data?.tagBreakdown?.length ? (
            <p className="text-xs text-zinc-500">
              Add hashtags like #hangout or #trip in transactions to track project or event totals.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.tagBreakdown.map((t) => (
                <div
                  key={t.name}
                  className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2 text-xs tabular-nums"
                >
                  <span className="font-semibold text-[#3B82F6]">#{t.name}</span>
                  <span className="ml-2 font-bold text-white">{fmtTk(t.amountPaisa, false)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
