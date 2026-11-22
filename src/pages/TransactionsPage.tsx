import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Download,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  downloadCsv,
  formatCurrency,
  formatDateTime,
  formatPaymentMode,
} from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import type {
  CustomerSummaryItem,
  MetalRateSettings,
  MoneyTransactionItem,
  PaginationInfo,
} from '../types/ledger.ts';
import {
  PaginationBar,
  SkeletonRows,
  TransactionTypeTag,
} from '../components/ui/Primitives.tsx';

export function TransactionsPage({
  settings,
  onOpenQuickTransaction,
  onRequestReverseTransaction,
  onRequestDeleteTransaction,
  onRequestDeleteAllTransactions,
  refreshKey,
}: {
  settings: MetalRateSettings | null;
  onOpenQuickTransaction: (type?: 'DEPOSIT' | 'WITHDRAW') => void;
  onRequestReverseTransaction: (tx: MoneyTransactionItem) => void;
  onRequestDeleteTransaction: (tx: MoneyTransactionItem) => void;
  onRequestDeleteAllTransactions: () => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<MoneyTransactionItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [customers, setCustomers] = useState<CustomerSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAW' | 'METAL_CREDIT'>('ALL');
  const [paymentMode, setPaymentMode] = useState<'ALL' | 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiRequest<{ items: CustomerSummaryItem[] }>('/api/customers?pageSize=200')
      .then((res) => setCustomers(res.items))
      .catch(() => {});
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        sortBy,
        sortDir,
        type,
        paymentMode,
      });
      if (search.trim()) params.set('search', search.trim());
      if (customerId) params.set('customerId', customerId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await apiRequest<{ items: MoneyTransactionItem[]; pagination: PaginationInfo }>(
        `/api/transactions?${params.toString()}`
      );
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err?.message || 'Failed to load money ledger');
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, type, paymentMode, search, customerId, dateFrom, dateTo]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions, refreshKey]);

  function toggleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
    setPage(1);
  }

  async function handleExportCsv() {
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '500',
        sortBy,
        sortDir,
        type,
        paymentMode,
      });
      if (search.trim()) params.set('search', search.trim());
      if (customerId) params.set('customerId', customerId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await apiRequest<{ items: MoneyTransactionItem[] }>(
        `/api/transactions?${params.toString()}`
      );

      downloadCsv(
        `money-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Date/Time',
          'Voucher #',
          'Customer',
          'Type',
          'Reversal Entry',
          'Linked Receipt',
          'Linked Itemset',
          'Payment Mode',
          'Amount',
          'Balance Before',
          'Balance After',
          'Remarks',
        ],
        res.items.map((t) => [
          formatDateTime(t.createdAt, settings?.locale),
          t.voucherNumber,
          t.customer?.name || '',
          t.type,
          t.isReversal ? 'YES' : 'NO',
          t.metalSplit?.receiptNumber || '',
          t.metalSplit?.itemsetName || '',
          formatPaymentMode(t.paymentMode),
          t.amount,
          t.balanceBefore,
          t.balanceAfter,
          t.description || '',
        ])
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to export CSV');
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search voucher #, customer, itemset, or remarks..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-amber-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pagination.total > 0 && (
              <button
                type="button"
                onClick={onRequestDeleteAllTransactions}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete All Transactions</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickTransaction('WITHDRAW')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ArrowUpRight className="h-4 w-4 text-red-700" />
              <span>Give Money (Withdraw)</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickTransaction('DEPOSIT')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>Receive Money (Deposit)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as 'ALL' | 'DEPOSIT' | 'WITHDRAW' | 'METAL_CREDIT');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-700 focus:outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="DEPOSIT">DEPOSIT (Received)</option>
            <option value="WITHDRAW">WITHDRAW (Paid Out)</option>
            <option value="METAL_CREDIT">METAL CREDIT (Assay)</option>
          </select>

          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-700 focus:outline-none"
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={paymentMode}
            onChange={(e) => {
              setPaymentMode(e.target.value as 'ALL' | 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-700 focus:outline-none"
          >
            <option value="ALL">All Payment Modes</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="OTHER">Other</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            aria-label="From date"
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-700 focus:outline-none"
          />

          <input
            type="date"
            value={dateTo}
            aria-label="To date"
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-700 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Chronological Ledger Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => toggleSort('createdAt')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Date & Voucher</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Linked Itemset / Remarks</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('amount')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Amount</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">Balance Before</th>
                <th className="py-3 px-4 text-right">Balance After</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={6} cols={9} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                    No ledger transactions match your filters.
                  </td>
                </tr>
              ) : (
                items.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono text-xs font-semibold text-slate-900">
                        {tx.voucherNumber}
                      </div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {formatDateTime(tx.createdAt, settings?.locale)}
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
                            title="Reverse transaction with audit entry"
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

        <PaginationBar pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
