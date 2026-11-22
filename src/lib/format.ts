import Decimal from 'decimal.js';
import type { MetalRateSettings, PaymentMode } from '../types/ledger.ts';

export function formatCurrency(
  value: string | number | null | undefined,
  settings?: Pick<MetalRateSettings, 'locale' | 'currencySymbol'> | null,
  options?: { signed?: boolean }
): string {
  const locale = settings?.locale || 'en-IN';
  const symbol = settings?.currencySymbol || '₹';
  let dec: Decimal;
  try {
    dec = new Decimal(value ?? 0);
    if (!dec.isFinite()) dec = new Decimal(0);
  } catch {
    dec = new Decimal(0);
  }

  const absNum = dec.abs().toNumber();
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absNum);

  if (dec.isNegative()) {
    return `-${symbol}${formatted}`;
  }
  if (options?.signed && dec.gt(0)) {
    return `+${symbol}${formatted}`;
  }
  return `${symbol}${formatted}`;
}

export function formatGrams(value: string | number | null | undefined, places = 3): string {
  if (value === null || value === undefined || value === '') return '—';
  try {
    const dec = new Decimal(value);
    if (!dec.isFinite()) return '—';
    return `${dec.toFixed(places)} g`;
  } catch {
    return '—';
  }
}

export function formatPurity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  try {
    const dec = new Decimal(value);
    if (!dec.isFinite()) return '—';
    return `${dec.toFixed(2)}%`;
  } catch {
    return '—';
  }
}

export function formatDateTime(iso: string | Date, locale = 'en-IN'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateShort(iso: string | Date, locale = 'en-IN'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatPaymentMode(mode: PaymentMode | string): string {
  switch (mode) {
    case 'CASH':
      return 'Cash';
    case 'UPI':
      return 'UPI';
    case 'BANK_TRANSFER':
      return 'Bank Transfer';
    default:
      return 'Other';
  }
}

export function describeBalanceState(balanceStr: string): {
  label: string;
  tone: 'payable' | 'receivable' | 'settled';
} {
  const dec = new Decimal(balanceStr || 0);
  if (dec.gt(0)) {
    return { label: 'Payable to Customer', tone: 'payable' };
  }
  if (dec.lt(0)) {
    return { label: 'Advance / Customer Owes', tone: 'receivable' };
  }
  return { label: 'Settled', tone: 'settled' };
}

function escapeCsvCell(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return '""';
  let str = String(raw);
  // Protect spreadsheets from formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): void {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  // UTF-8 BOM ensures Excel opens INR symbol cleanly
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
