import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Download,
  Edit3,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  describeBalanceState,
  downloadCsv,
  formatCurrency,
  formatDateTime,
  formatGrams,
  formatPaymentMode,
  formatPurity,
} from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import type {
  CustomerDetailResponse,
  CustomerSummaryItem,
  MetalRateSettings,
  MetalSplitItem,
  MoneyTransactionItem,
} from '../types/ledger.ts';
import {
  SplitStatusTag,
  TransactionTypeTag,
} from '../components/ui/Primitives.tsx';
import { QuickCustomerModal } from '../components/QuickCustomerModal.tsx';

export function CustomerDetailPage({
  customerId,
  settings,
  onOpenQuickTransaction,
  onNewSplitForCustomer,
  onPrintSplit,
  onPrintStatement,
  onRequestReverseSplit,
  onRequestReverseTransaction,
  onRequestDeleteSplit,
  onRequestDeleteTransaction,
  onRequestDeleteCustomer,
  refreshKey,
}: {
  customerId: string;
  settings: MetalRateSettings | null;
  onOpenQuickTransaction: (type: 'DEPOSIT' | 'WITHDRAW', customerId: string) => void;
  onNewSplitForCustomer: (customerId: string) => void;
  onPrintSplit: (split: MetalSplitItem) => void;
  onPrintStatement: (detail: CustomerDetailResponse) => void;
  onRequestReverseSplit: (split: MetalSplitItem) => void;
  onRequestReverseTransaction: (tx: MoneyTransactionItem) => void;
  onRequestDeleteSplit: (split: MetalSplitItem) => void;
  onRequestDeleteTransaction: (tx: MoneyTransactionItem) => void;
  onRequestDeleteCustomer: (customer: CustomerSummaryItem) => void;
  refreshKey: number;
}) {
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'splits' | 'transactions'>('splits');
  const [editOpen, setEditOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<CustomerDetailResponse>(`/api/customers/${customerId}`);
      setDetail(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customer ledger');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail, refreshKey]);

  function handleExportLedgerCsv() {
    if (!detail) return;
    downloadCsv(
      `${detail.customer.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-ledger.csv`,
      [
        'Date/Time',
        'Voucher #',
        'Type',
        'Reversal',
        'Linked Receipt',
        'Linked Itemset',
        'Payment Mode',
        'Amount',
        'Balance Before',
        'Balance After',
        'Description',
      ],
      detail.transactions.map((tx) => [
        formatDateTime(tx.createdAt, settings?.locale),
        tx.voucherNumber,
        tx.type,
        tx.isReversal ? 'YES' : 'NO',
        tx.metalSplit?.receiptNumber || '',
        tx.metalSplit?.itemsetName || '',
        formatPaymentMode(tx.paymentMode),
        tx.amount,
        tx.balanceBefore,
        tx.balanceAfter,
        tx.description || '',
      ])
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-36 w-full animate-pulse rounded-xl bg-slate-200" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Customers</span>
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {error || 'Customer not found'}
        </div>
      </div>
    );
  }

  const balState = describeBalanceState(detail.customer.currentBalance);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/customers"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Customers</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportLedgerCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Export Ledger (CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => onPrintStatement(detail)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            <span>Print Statement</span>
          </button>
          <button
            type="button"
            onClick={() => onRequestDeleteCustomer(detail.customer)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Customer</span>
          </button>
        </div>
      </div>

      {/* Customer Identity & Balance Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900">{detail.customer.name}</h1>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                title="Edit customer info"
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="text-sm text-slate-600">
              {detail.customer.phone || 'No phone'}
              {detail.customer.address ? ` · ${detail.customer.address}` : ''}
            </div>
            {detail.customer.notes && (
              <p className="text-xs text-slate-500 pt-1">{detail.customer.notes}</p>
            )}
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs font-medium text-slate-500">Current Net Balance</div>
            <div
              className={`mt-1 font-mono tabular-nums text-3xl font-bold ${
                balState.tone === 'payable'
                  ? 'text-emerald-800'
                  : balState.tone === 'receivable'
                    ? 'text-red-700'
                    : 'text-slate-800'
              }`}
            >
              {formatCurrency(detail.customer.currentBalance, settings)}
            </div>
            <div className="text-xs font-medium text-slate-600">{balState.label}</div>
          </div>
        </div>

        {/* Metrics & Quick Customer Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 border-t border-slate-200 pt-5">
          <div>
            <div className="text-xs text-slate-500">Gold Produced (Fine)</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-amber-900">
              {formatGrams(detail.summary.goldFine, 4)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              Gross: {formatGrams(detail.summary.goldGross, 3)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Silver Produced (Fine)</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-800">
              {formatGrams(detail.summary.silverFine, 4)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              Gross: {formatGrams(detail.summary.silverGross, 3)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Metal Value</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
              {formatCurrency(detail.summary.totalProduced, settings)}
            </div>
            <div className="text-[11px] text-slate-500">
              {detail.summary.activeSplitCount} active splits
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Paid Out</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-red-700">
              {formatCurrency(detail.summary.totalWithdrawn, settings)}
            </div>
            <div className="text-[11px] text-slate-500">
              Deposits: {formatCurrency(detail.summary.totalDeposited, settings)}
            </div>
          </div>
          <div className="col-span-2 lg:col-span-1 flex flex-wrap lg:flex-col items-stretch justify-end gap-2">
            <button
              type="button"
              onClick={() => onNewSplitForCustomer(detail.customer.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Metal Split</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onOpenQuickTransaction('WITHDRAW', detail.customer.id)}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <ArrowUpRight className="h-3.5 w-3.5 text-red-700" />
                <span>Give</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenQuickTransaction('DEPOSIT', detail.customer.id)}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-700" />
                <span>Receive</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: Metal Splits vs Money Ledger History */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 pt-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('splits')}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'splits'
                  ? 'border-amber-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Metal Split Records ({detail.metalSplits.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'transactions'
                  ? 'border-amber-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Deposit & Withdraw History ({detail.transactions.length})
            </button>
          </div>
        </div>

        {activeTab === 'splits' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Receipt & Date</th>
                  <th className="py-2.5 px-4">Itemset / Product</th>
                  <th className="py-2.5 px-4 text-right">Gold (Fine / Purity)</th>
                  <th className="py-2.5 px-4 text-right">Silver (Fine / Purity)</th>
                  <th className="py-2.5 px-4 text-right">Total Produced</th>
                  <th className="py-2.5 px-4 text-right">Paid Now</th>
                  <th className="py-2.5 px-4 text-right">Net Added</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.metalSplits.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No metal splits recorded for this customer yet.
                    </td>
                  </tr>
                ) : (
                  detail.metalSplits.map((split) => (
                    <tr
                      key={split.id}
                      className={`hover:bg-slate-50/70 ${split.status === 'REVERSED' ? 'opacity-65' : ''}`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900">
                            {split.receiptNumber}
                          </span>
                          <SplitStatusTag status={split.status} />
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          {formatDateTime(split.createdAt, settings?.locale)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{split.itemsetName}</div>
                        {split.notes && <div className="text-xs text-slate-500">{split.notes}</div>}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-amber-900">
                          {formatGrams(split.goldFineWeight, 4)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatGrams(split.goldWeight, 3)} · {formatPurity(split.goldPurity)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {formatGrams(split.silverFineWeight, 4)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatGrams(split.silverWeight, 3)} · {formatPurity(split.silverPurity)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(split.totalProducedAmount, settings)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                        {formatCurrency(split.amountGivenToCustomer, settings)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-800 whitespace-nowrap">
                        {formatCurrency(split.remainingBalanceAdded, settings, { signed: true })}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onPrintSplit({
                                ...split,
                                customer: {
                                  id: detail.customer.id,
                                  name: detail.customer.name,
                                  phone: detail.customer.phone,
                                  address: detail.customer.address,
                                  currentBalance: detail.customer.currentBalance,
                                },
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>Receipt</span>
                          </button>
                          {split.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => onRequestReverseSplit(split)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reverse</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRequestDeleteSplit(split)}
                            title="Delete metal split"
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Date & Voucher</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Linked Itemset / Remarks</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Balance Before</th>
                  <th className="py-2.5 px-4 text-right">Balance After</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No money transactions recorded for this customer yet.
                    </td>
                  </tr>
                ) : (
                  detail.transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-slate-900">
                          {tx.voucherNumber}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          {formatDateTime(tx.createdAt, settings?.locale)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <TransactionTypeTag type={tx.type} isReversal={tx.isReversal} />
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        {tx.metalSplit && (
                          <div className="text-xs font-medium text-slate-800 truncate">
                            {tx.metalSplit.receiptNumber} · {tx.metalSplit.itemsetName}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 truncate">{tx.description || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatPaymentMode(tx.paymentMode)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                        <span className={tx.type === 'WITHDRAW' ? 'text-red-700' : 'text-emerald-800'}>
                          {tx.type === 'WITHDRAW' ? '-' : '+'}
                          {formatCurrency(tx.amount, settings)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatCurrency(tx.balanceBefore, settings)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(tx.balanceAfter, settings)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!tx.isReversal && tx.type !== 'METAL_CREDIT' && (
                            <button
                              type="button"
                              onClick={() => onRequestReverseTransaction(tx)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reverse</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRequestDeleteTransaction(tx)}
                            title="Delete transaction"
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
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
        )}
      </div>

      <QuickCustomerModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        existingCustomer={detail.customer}
        onSaved={() => loadDetail()}
      />
    </div>
  );
}
