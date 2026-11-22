import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  downloadCsv,
  formatCurrency,
  formatDateTime,
  formatGrams,
  formatPurity,
} from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import type {
  CustomerSummaryItem,
  MetalRateSettings,
  MetalSplitItem,
  PaginationInfo,
} from '../types/ledger.ts';
import {
  PaginationBar,
  SkeletonRows,
  SplitStatusTag,
} from '../components/ui/Primitives.tsx';

export function SplitsListPage({
  settings,
  onPrintSplit,
  onRequestReverseSplit,
  onRequestDeleteSplit,
  onRequestDeleteAllSplits,
  refreshKey,
}: {
  settings: MetalRateSettings | null;
  onPrintSplit: (split: MetalSplitItem) => void;
  onRequestReverseSplit: (split: MetalSplitItem) => void;
  onRequestDeleteSplit: (split: MetalSplitItem) => void;
  onRequestDeleteAllSplits: () => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<MetalSplitItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 15,
    total: 0,
    totalPages: 1,
  });
  const [customers, setCustomers] = useState<CustomerSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'REVERSED'>('ALL');
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

  const loadSplits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '15',
        sortBy,
        sortDir,
        status,
      });
      if (search.trim()) params.set('search', search.trim());
      if (customerId) params.set('customerId', customerId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await apiRequest<{ items: MetalSplitItem[]; pagination: PaginationInfo }>(
        `/api/splits?${params.toString()}`
      );
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err?.message || 'Failed to load metal split records');
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, status, search, customerId, dateFrom, dateTo]);

  useEffect(() => {
    loadSplits();
  }, [loadSplits, refreshKey]);

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
        status,
      });
      if (search.trim()) params.set('search', search.trim());
      if (customerId) params.set('customerId', customerId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await apiRequest<{ items: MetalSplitItem[] }>(`/api/splits?${params.toString()}`);
      downloadCsv(
        `metal-splits-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Receipt #',
          'Date',
          'Status',
          'Customer',
          'Itemset',
          'Gross Intake (g)',
          'Gold Wt (g)',
          'Gold Purity (%)',
          'Gold Fine (g)',
          'Gold Rate',
          'Gold Amount',
          'Silver Wt (g)',
          'Silver Purity (%)',
          'Silver Fine (g)',
          'Silver Rate',
          'Silver Amount',
          'Total Produced',
          'Paid Now',
          'Net Added',
          'Notes',
        ],
        res.items.map((s) => [
          s.receiptNumber,
          formatDateTime(s.createdAt, settings?.locale),
          s.status,
          s.customer?.name || '',
          s.itemsetName,
          s.grossProductWeight || '',
          s.goldWeight,
          s.goldPurity,
          s.goldFineWeight,
          s.goldRatePerGram,
          s.goldAmount,
          s.silverWeight,
          s.silverPurity,
          s.silverFineWeight,
          s.silverRatePerGram,
          s.silverAmount,
          s.totalProducedAmount,
          s.amountGivenToCustomer,
          s.remainingBalanceAdded,
          s.notes || '',
        ])
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to export CSV');
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar & Filters */}
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
              placeholder="Search receipt #, itemset, customer, or notes..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-amber-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pagination.total > 0 && (
              <button
                type="button"
                onClick={onRequestDeleteAllSplits}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete All Splits</span>
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
            <Link
              to="/splits/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>New Metal Split</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
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
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as 'ALL' | 'ACTIVE' | 'REVERSED');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-700 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Records Only</option>
            <option value="REVERSED">Reversed Records Only</option>
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

      {/* Table */}
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
                    <span>Receipt / Date</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Itemset</th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('goldFineWeight')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Gold Fine</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('silverFineWeight')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Silver Fine</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('totalProducedAmount')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Total Value</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">Paid / Added</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={6} cols={8} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                    No metal split records match your current filters.
                  </td>
                </tr>
              ) : (
                items.map((split) => (
                  <tr
                    key={split.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      split.status === 'REVERSED' ? 'opacity-65 bg-red-50/20' : ''
                    }`}
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
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800 max-w-[220px] truncate">
                        {split.itemsetName}
                      </div>
                      {split.grossProductWeight && (
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          Gross: {formatGrams(split.grossProductWeight, 3)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-amber-900">{formatGrams(split.goldFineWeight, 4)}</div>
                      <div className="text-xs text-slate-500">
                        {formatGrams(split.goldWeight, 3)} · {formatPurity(split.goldPurity)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{formatGrams(split.silverFineWeight, 4)}</div>
                      <div className="text-xs text-slate-500">
                        {formatGrams(split.silverWeight, 3)} · {formatPurity(split.silverPurity)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      <div>{formatCurrency(split.totalProducedAmount, settings)}</div>
                      <div className="text-[11px] font-normal text-slate-500">
                        Au {formatCurrency(split.goldAmount, settings)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-xs text-red-700">
                        Paid: {formatCurrency(split.amountGivenToCustomer, settings)}
                      </div>
                      <div className="text-xs font-semibold text-emerald-800">
                        Net: {formatCurrency(split.remainingBalanceAdded, settings, { signed: true })}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPrintSplit(split)}
                          title="Print assay receipt"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>Print</span>
                        </button>
                        {split.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => onRequestReverseSplit(split)}
                            title="Reverse entry with audit trail"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reverse</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRequestDeleteSplit(split)}
                          title="Delete metal split record"
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

        <PaginationBar pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
