import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type {
  CustomerSummaryItem,
  MetalRateSettings,
  MetalSplitStatus,
  PaginationInfo,
  TransactionType,
} from '../../types/ledger.ts';
import { describeBalanceState, formatCurrency } from '../../lib/format.ts';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} rounded-xl border border-slate-200 bg-white shadow-xl max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 leading-snug">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  summaryRows,
  confirmLabel = 'Confirm & Save',
  confirmTone = 'primary',
  isSubmitting = false,
  error = null,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  summaryRows: Array<{ label: string; value: string; highlight?: boolean }>;
  confirmLabel?: string;
  confirmTone?: 'primary' | 'danger';
  isSubmitting?: boolean;
  error?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </div>
      )}

      {summaryRows.length > 0 && (
        <div className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
          {summaryRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="text-slate-600">{row.label}</span>
              <span
                className={`font-mono tabular-nums text-right ${
                  row.highlight ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
            confirmTone === 'danger'
              ? 'bg-red-700 hover:bg-red-800'
              : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          {isSubmitting ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function TransactionTypeTag({
  type,
  isReversal,
}: {
  type: TransactionType;
  isReversal?: boolean;
}) {
  if (type === 'DEPOSIT') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 whitespace-nowrap">
        <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" />
        <span>{isReversal ? 'DEPOSIT (REV)' : 'DEPOSIT'}</span>
      </span>
    );
  }
  if (type === 'WITHDRAW') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 whitespace-nowrap">
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        <span>{isReversal ? 'WITHDRAW (REV)' : 'WITHDRAW'}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 whitespace-nowrap">
      <Coins className="h-3.5 w-3.5 shrink-0" />
      <span>METAL CREDIT</span>
    </span>
  );
}

export function SplitStatusTag({ status }: { status: MetalSplitStatus }) {
  if (status === 'REVERSED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 whitespace-nowrap">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span>Reversed</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap">
      <span>Active</span>
    </span>
  );
}

export function BalanceDisplay({
  balance,
  settings,
  align = 'right',
}: {
  balance: string;
  settings?: Pick<MetalRateSettings, 'locale' | 'currencySymbol'> | null;
  align?: 'left' | 'right';
}) {
  const state = describeBalanceState(balance);
  const colorClass =
    state.tone === 'payable'
      ? 'text-emerald-800'
      : state.tone === 'receivable'
        ? 'text-red-700'
        : 'text-slate-600';

  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <div className={`font-mono tabular-nums font-semibold ${colorClass}`}>
        {formatCurrency(balance, settings)}
      </div>
      <div className="text-[11px] text-slate-500">{state.label}</div>
    </div>
  );
}

export function PaginationBar({
  pagination,
  onPageChange,
}: {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}) {
  if (pagination.total === 0) return null;
  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <div className="font-mono tabular-nums text-xs text-slate-500">
        Showing {start}–{end} of {pagination.total} records
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={pagination.page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Previous</span>
        </button>
        <span className="font-mono tabular-nums text-xs text-slate-700 px-2">
          Page {pagination.page} / {pagination.totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={pagination.page >= pagination.totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <span>Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="border-b border-slate-100">
          {Array.from({ length: cols }).map((__, cIdx) => (
            <td key={cIdx} className="px-4 py-3">
              <div className="h-4 w-full max-w-[140px] animate-pulse rounded bg-slate-200/70" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function CustomerCombobox({
  customers,
  value,
  onChange,
  onQuickCreate,
  settings,
  placeholder = 'Search customer by name or phone...',
}: {
  customers: CustomerSummaryItem[];
  value: string;
  onChange: (customerId: string) => void;
  onQuickCreate?: () => void;
  settings?: Pick<MetalRateSettings, 'locale' | 'currencySymbol'> | null;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => customers.find((c) => c.id === value) ?? null,
    [customers, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }, [customers, query]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-600/20 focus:border-amber-700"
        >
          {selected ? (
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 truncate">{selected.name}</div>
              <div className="text-xs text-slate-500 truncate">
                {selected.phone || 'No phone'} · Balance:{' '}
                <span className="font-mono tabular-nums font-medium text-slate-700">
                  {formatCurrency(selected.currentBalance, settings)}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
        </button>

        {onQuickCreate && (
          <button
            type="button"
            onClick={onQuickCreate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>New Customer</span>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type customer name or phone..."
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-900 focus:border-amber-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-center text-sm text-slate-500">
                No matching customers found.
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 ${
                      isSelected ? 'bg-amber-50/60' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <span className="truncate">{c.name}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-amber-700 shrink-0" />}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {c.phone || 'No phone'} {c.address ? `· ${c.address}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums text-xs font-semibold text-slate-800">
                        {formatCurrency(c.currentBalance, settings)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {describeBalanceState(c.currentBalance).label}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
