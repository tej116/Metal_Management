import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  ArrowUpDown,
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { downloadCsv, formatCurrency, formatGrams } from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import type {
  CustomerSummaryItem,
  MetalRateSettings,
  PaginationInfo,
} from '../types/ledger.ts';
import {
  BalanceDisplay,
  PaginationBar,
  SkeletonRows,
} from '../components/ui/Primitives.tsx';
import { QuickCustomerModal } from '../components/QuickCustomerModal.tsx';

export function CustomersPage({
  settings,
  onOpenQuickTransaction,
  onRequestDeleteCustomer,
  onRequestDeleteAllRecords,
  refreshKey,
}: {
  settings: MetalRateSettings | null;
  onOpenQuickTransaction: (type?: 'DEPOSIT' | 'WITHDRAW', customerId?: string) => void;
  onRequestDeleteCustomer: (customer: CustomerSummaryItem) => void;
  onRequestDeleteAllRecords: () => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<CustomerSummaryItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'payable' | 'receivable' | 'settled'>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerSummaryItem | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        balanceFilter,
        includeArchived: String(includeArchived),
        sortBy,
        sortDir,
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest<{ items: CustomerSummaryItem[]; pagination: PaginationInfo }>(
        `/api/customers?${params.toString()}`
      );
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [page, balanceFilter, includeArchived, sortBy, sortDir, search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers, refreshKey]);

  function toggleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'currentBalance' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  async function handleToggleArchive(c: CustomerSummaryItem) {
    try {
      await apiRequest(`/api/customers/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: !c.isArchived }),
      });
      loadCustomers();
    } catch (err: any) {
      setError(err?.message || 'Failed to update customer status');
    }
  }

  async function handleExportCsv() {
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '200',
        balanceFilter,
        includeArchived: String(includeArchived),
        sortBy,
        sortDir,
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest<{ items: CustomerSummaryItem[] }>(`/api/customers?${params.toString()}`);

      downloadCsv(
        `customers-directory-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Customer Name',
          'Phone',
          'Address',
          'Active Splits',
          'Fine Gold (g)',
          'Fine Silver (g)',
          'Total Produced Value',
          'Current Net Balance',
          'Status',
        ],
        res.items.map((c) => [
          c.name,
          c.phone || '',
          c.address || '',
          c.splitCount ?? 0,
          c.totalGoldFine || '0.0000',
          c.totalSilverFine || '0.0000',
          c.totalProducedAmount || '0.00',
          c.currentBalance,
          c.isArchived ? 'Archived' : 'Active',
        ])
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to export customer CSV');
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
              placeholder="Search customer name, phone, or market address..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-amber-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pagination.total > 0 && (
              <button
                type="button"
                onClick={onRequestDeleteAllRecords}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete All Records</span>
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
              onClick={() => {
                setEditingCustomer(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>New Customer</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['all', 'All Accounts'],
                ['payable', 'Payable to Customer'],
                ['receivable', 'Advance / Owes Us'],
                ['settled', 'Settled (₹0)'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setBalanceFilter(key);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  balanceFilter === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => {
                setIncludeArchived(e.target.checked);
                setPage(1);
              }}
              className="rounded border-slate-300 text-slate-900 focus:ring-amber-600"
            />
            <span>Show archived accounts</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Directory Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Customer / Firm</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4">Contact & Address</th>
                <th className="py-3 px-4 text-right">Gold / Silver Fine</th>
                <th className="py-3 px-4 text-right">Total Metal Value</th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('currentBalance')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Net Balance</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={5} cols={6} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    No customers match your filter criteria.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      c.isArchived ? 'opacity-60 bg-slate-50' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/customers/${c.id}`}
                        className="font-semibold text-slate-900 hover:text-amber-800 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {c.splitCount ?? 0} splits · {c.transactionCount ?? 0} ledger entries
                        {c.isArchived ? ' · Archived' : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-mono text-xs">{c.phone || '—'}</div>
                      <div className="text-xs text-slate-500 max-w-[240px] truncate">
                        {c.address || '—'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      <div className="text-amber-900 font-medium">
                        {formatGrams(c.totalGoldFine || 0, 4)} Au
                      </div>
                      <div className="text-slate-600">
                        {formatGrams(c.totalSilverFine || 0, 4)} Ag
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-800 whitespace-nowrap">
                      {formatCurrency(c.totalProducedAmount || 0, settings)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <BalanceDisplay balance={c.currentBalance} settings={settings} />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          to={`/customers/${c.id}`}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Ledger
                        </Link>
                        {!c.isArchived && (
                          <button
                            type="button"
                            onClick={() => onOpenQuickTransaction('WITHDRAW', c.id)}
                            title="Record deposit or withdrawal"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            <span>Pay/Recv</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomer(c);
                            setModalOpen(true);
                          }}
                          title="Edit customer details"
                          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(c)}
                          title={c.isArchived ? 'Restore customer' : 'Archive customer'}
                          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDeleteCustomer(c)}
                          title="Delete customer and all records"
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
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

      <QuickCustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existingCustomer={editingCustomer}
        onSaved={() => loadCustomers()}
      />
    </div>
  );
}
