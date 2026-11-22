import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Coins,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  formatCurrency,
  formatDateTime,
  formatGrams,
  formatPaymentMode,
  formatPurity,
} from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import type {
  DashboardResponse,
  MetalRateSettings,
  MetalSplitItem,
  MoneyTransactionItem,
} from '../types/ledger.ts';
import {
  SkeletonRows,
  SplitStatusTag,
  TransactionTypeTag,
} from '../components/ui/Primitives.tsx';

export function DashboardPage({
  settings,
  onSettingsUpdated,
  onOpenQuickTransaction,
  onPrintSplit,
  onRequestDeleteSplit,
  onRequestDeleteTransaction,
  onRequestDeleteAllRecords,
  refreshKey,
}: {
  settings: MetalRateSettings | null;
  onSettingsUpdated: (rates: MetalRateSettings) => void;
  onOpenQuickTransaction: (type?: 'DEPOSIT' | 'WITHDRAW') => void;
  onPrintSplit: (split: MetalSplitItem) => void;
  onRequestDeleteSplit: (split: MetalSplitItem) => void;
  onRequestDeleteTransaction: (tx: MoneyTransactionItem) => void;
  onRequestDeleteAllRecords: () => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick-edit daily rate widget state
  const [goldRate, setGoldRate] = useState('');
  const [silverRate, setSilverRate] = useState('');
  const [savingRates, setSavingRates] = useState(false);
  const [rateSavedNotice, setRateSavedNotice] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DashboardResponse>('/api/dashboard');
      setData(res);
      setGoldRate(res.rates.goldRatePerGram ?? '');
      setSilverRate(res.rates.silverRatePerGram ?? '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshKey]);

  async function handleSaveRates(e: React.FormEvent) {
    e.preventDefault();
    setSavingRates(true);
    setRateSavedNotice(false);
    setError(null);
    try {
      const res = await apiRequest<{ rates: MetalRateSettings }>('/api/rates', {
        method: 'PUT',
        body: JSON.stringify({
          goldRatePerGram: goldRate.trim() || null,
          silverRatePerGram: silverRate.trim() || null,
        }),
      });
      onSettingsUpdated(res.rates);
      setRateSavedNotice(true);
      setTimeout(() => setRateSavedNotice(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update daily rates');
    } finally {
      setSavingRates(false);
    }
  }

  const activeSettings = data?.rates ?? settings;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadDashboard}
            className="text-xs font-semibold underline hover:no-underline shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <section aria-label="Refining and Ledger Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Total Gold Produced (Fine)</div>
            <div className="mt-2 font-mono tabular-nums text-2xl font-bold text-amber-900">
              {loading ? '—' : formatGrams(data?.kpis.totalGoldFine, 4)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
              Gross: {loading ? '—' : formatGrams(data?.kpis.totalGoldGross, 3)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Total Silver Produced (Fine)</div>
            <div className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-800">
              {loading ? '—' : formatGrams(data?.kpis.totalSilverFine, 4)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
              Gross: {loading ? '—' : formatGrams(data?.kpis.totalSilverGross, 3)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Total Value Produced vs. Paid</div>
            <div className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-900">
              {loading ? '—' : formatCurrency(data?.kpis.totalValueProduced, activeSettings)}
            </div>
            <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
              Paid out: {loading ? '—' : formatCurrency(data?.kpis.totalPaidToCustomers, activeSettings)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Pending Payable / Receivable</div>
            <div className="mt-2 font-mono tabular-nums text-2xl font-bold text-emerald-800">
              {loading ? '—' : formatCurrency(data?.kpis.totalPayable, activeSettings)}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>Payable to customers</span>
              <span className="font-mono tabular-nums text-red-700 font-medium">
                Adv: {loading ? '—' : formatCurrency(data?.kpis.totalReceivable, activeSettings)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Daily Metal Rates Quick-Edit + Quick Operations */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <form
          onSubmit={handleSaveRates}
          className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Today&apos;s Assay Rates</h2>
              <p className="text-xs text-slate-500">
                Set your own per-gram Gold &amp; Silver rates to auto-fill new metal split entries.
              </p>
            </div>
            {rateSavedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                <span>Rates updated</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Gold Rate ({activeSettings?.currencySymbol || '₹'}/g)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={goldRate}
                onChange={(e) => setGoldRate(e.target.value)}
                placeholder="Enter Gold rate / g"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Silver Rate ({activeSettings?.currencySymbol || '₹'}/g)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={silverRate}
                onChange={(e) => setSilverRate(e.target.value)}
                placeholder="Enter Silver rate / g"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            <button
              type="submit"
              disabled={savingRates}
              className="rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              {savingRates ? 'Saving...' : 'Save My Rates'}
            </button>
          </div>
        </form>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Quick Ledger Operations</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {data ? `${data.kpis.activeSplitCount} active assays across ${data.kpis.customerCount} customers` : 'Record assays or cash settlements'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/splits/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>New Metal Split Entry</span>
            </Link>
            <button
              type="button"
              onClick={() => onOpenQuickTransaction('WITHDRAW')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ArrowUpRight className="h-4 w-4 text-red-700" />
              <span>Give Money</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickTransaction('DEPOSIT')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ArrowDownLeft className="h-4 w-4 text-emerald-700" />
              <span>Receive Deposit</span>
            </button>
            <button
              type="button"
              onClick={onRequestDeleteAllRecords}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete All Records</span>
            </button>
          </div>
        </div>
      </section>

      {/* Recent Metal Splits */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Metal Splits</h2>
            <p className="text-xs text-slate-500">Latest gold & silver refining batches with purity and payout summary</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
            <Link to="/splits" className="text-xs font-semibold text-amber-800 hover:underline whitespace-nowrap">
              View all splits
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Receipt & Date</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Itemset / Product</th>
                <th className="py-2.5 px-4 text-right">Gold (Fine / Purity)</th>
                <th className="py-2.5 px-4 text-right">Silver (Fine / Purity)</th>
                <th className="py-2.5 px-4 text-right">Total Value</th>
                <th className="py-2.5 px-4 text-right">Given Now</th>
                <th className="py-2.5 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={4} cols={8} />
              ) : !data || data.recentSplits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No metal split records logged yet.{' '}
                    <Link to="/splits/new" className="font-semibold text-amber-800 underline">
                      Log First Metal Split
                    </Link>
                  </td>
                </tr>
              ) : (
                data.recentSplits.map((split) => (
                  <tr key={split.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {split.receiptNumber}
                        </span>
                        {split.status === 'REVERSED' && <SplitStatusTag status={split.status} />}
                      </div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {formatDateTime(split.createdAt, activeSettings?.locale)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {split.customer ? (
                        <Link
                          to={`/customers/${split.customer.id}`}
                          className="font-medium text-slate-900 hover:text-amber-800 hover:underline"
                        >
                          {split.customer.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-[220px] truncate">{split.itemsetName}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-amber-900">{formatGrams(split.goldFineWeight, 4)}</div>
                      <div className="text-xs text-slate-500">{formatPurity(split.goldPurity)}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{formatGrams(split.silverFineWeight, 4)}</div>
                      <div className="text-xs text-slate-500">{formatPurity(split.silverPurity)}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(split.totalProducedAmount, activeSettings)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatCurrency(split.amountGivenToCustomer, activeSettings)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPrintSplit(split)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>Print</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDeleteSplit(split)}
                          title="Delete metal split"
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Money Transactions */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Money Ledger Activity</h2>
            <p className="text-xs text-slate-500">Every metal credit, withdrawal, and deposit with running balances</p>
          </div>
          <Link to="/transactions" className="text-xs font-semibold text-amber-800 hover:underline whitespace-nowrap">
            Open full money ledger
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Date & Voucher</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Linked Itemset / Notes</th>
                <th className="py-2.5 px-4">Mode</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                <th className="py-2.5 px-4 text-right">Balance After</th>
                <th className="py-2.5 px-4 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={5} cols={8} />
              ) : !data || data.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No money transactions recorded yet.
                  </td>
                </tr>
              ) : (
                data.recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono text-xs font-semibold text-slate-900">{tx.voucherNumber}</div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {formatDateTime(tx.createdAt, activeSettings?.locale)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {tx.customer ? (
                        <Link
                          to={`/customers/${tx.customer.id}`}
                          className="font-medium text-slate-900 hover:text-amber-800 hover:underline"
                        >
                          {tx.customer.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <TransactionTypeTag type={tx.type} isReversal={tx.isReversal} />
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[240px] truncate">
                      {tx.metalSplit ? `${tx.metalSplit.receiptNumber} · ${tx.metalSplit.itemsetName}` : tx.description || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {formatPaymentMode(tx.paymentMode)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                      <span className={tx.type === 'WITHDRAW' ? 'text-red-700' : 'text-emerald-800'}>
                        {tx.type === 'WITHDRAW' ? '-' : '+'}
                        {formatCurrency(tx.amount, activeSettings)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(tx.balanceAfter, activeSettings)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onRequestDeleteTransaction(tx)}
                        title="Delete transaction"
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
