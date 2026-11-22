import React from 'react';
import { Printer, X } from 'lucide-react';
import {
  describeBalanceState,
  formatCurrency,
  formatDateTime,
  formatGrams,
  formatPaymentMode,
  formatPurity,
} from '../lib/format.ts';
import type {
  CustomerDetailResponse,
  MetalRateSettings,
  MetalSplitItem,
} from '../types/ledger.ts';

export function PrintableSplitReceiptModal({
  split,
  settings,
  onClose,
}: {
  split: MetalSplitItem | null;
  settings: MetalRateSettings | null;
  onClose: () => void;
}) {
  if (!split) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto print:static print:bg-white print:p-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl print-only-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 no-print">
          <div className="text-sm font-semibold text-slate-900">
            Assay & Metal Split Receipt · {split.receiptNumber}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Receipt</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt preview"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6 text-slate-900">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-5">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {settings?.businessName || 'AurumLedger'}
              </h1>
              {settings?.businessAddress && (
                <p className="mt-1 text-xs text-slate-600">{settings.businessAddress}</p>
              )}
              {settings?.businessPhone && (
                <p className="text-xs text-slate-600">{settings.businessPhone}</p>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-slate-500">Assay Receipt Number</div>
              <div className="font-mono text-lg font-bold text-slate-900">{split.receiptNumber}</div>
              <div className="mt-1 text-xs text-slate-600">
                {formatDateTime(split.createdAt, settings?.locale)}
              </div>
              {split.status === 'REVERSED' && (
                <div className="mt-1 text-xs font-semibold text-red-700">
                  REVERSED · {split.reversalReason}
                </div>
              )}
            </div>
          </div>

          {/* Customer & Itemset */}
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs text-slate-500">Customer Account</div>
              <div className="mt-0.5 font-semibold text-slate-900">
                {split.customer?.name || 'Customer'}
              </div>
              {split.customer?.phone && (
                <div className="text-xs text-slate-600">{split.customer.phone}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Itemset / Product Batch</div>
              <div className="mt-0.5 font-semibold text-slate-900">{split.itemsetName}</div>
              {split.grossProductWeight && (
                <div className="text-xs text-slate-600 font-mono tabular-nums">
                  Gross Intake: {formatGrams(split.grossProductWeight, 3)}
                </div>
              )}
            </div>
          </div>

          {/* Metal Split Table */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs font-semibold text-slate-700">
                <th className="py-2.5 px-3">Metal</th>
                <th className="py-2.5 px-3 text-right">Produced Wt</th>
                <th className="py-2.5 px-3 text-right">Purity</th>
                <th className="py-2.5 px-3 text-right">Fine Wt</th>
                <th className="py-2.5 px-3 text-right">Rate / g</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              <tr>
                <td className="py-3 px-3 font-sans font-semibold text-amber-900">Gold (Au)</td>
                <td className="py-3 px-3 text-right">{formatGrams(split.goldWeight, 3)}</td>
                <td className="py-3 px-3 text-right">{formatPurity(split.goldPurity)}</td>
                <td className="py-3 px-3 text-right font-semibold">{formatGrams(split.goldFineWeight, 4)}</td>
                <td className="py-3 px-3 text-right">{formatCurrency(split.goldRatePerGram, settings)}</td>
                <td className="py-3 px-3 text-right font-semibold">
                  {formatCurrency(split.goldAmount, settings)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-sans font-semibold text-slate-700">Silver (Ag)</td>
                <td className="py-3 px-3 text-right">{formatGrams(split.silverWeight, 3)}</td>
                <td className="py-3 px-3 text-right">{formatPurity(split.silverPurity)}</td>
                <td className="py-3 px-3 text-right font-semibold">{formatGrams(split.silverFineWeight, 4)}</td>
                <td className="py-3 px-3 text-right">{formatCurrency(split.silverRatePerGram, settings)}</td>
                <td className="py-3 px-3 text-right font-semibold">
                  {formatCurrency(split.silverAmount, settings)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Settlement Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2 border-t border-slate-300 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Produced Value</span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatCurrency(split.totalProducedAmount, settings)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Immediate Payout Given</span>
                <span className="font-mono tabular-nums text-red-700">
                  -{formatCurrency(split.amountGivenToCustomer, settings)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                <span>Net Balance Credited</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(split.remainingBalanceAdded, settings)}
                </span>
              </div>
              {split.customer && (
                <div className="flex justify-between text-xs text-slate-600 pt-1">
                  <span>Current Account Balance</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatCurrency(split.customer.currentBalance, settings)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {split.notes && (
            <div className="border-t border-slate-200 pt-4 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Assay Notes: </span>
              {split.notes}
            </div>
          )}

          <div className="border-t border-slate-200 pt-6 flex justify-between text-xs text-slate-500">
            <span>Authorized Assayer Signature</span>
            <span>Customer Acknowledgement</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrintableCustomerStatementModal({
  detail,
  settings,
  onClose,
}: {
  detail: CustomerDetailResponse | null;
  settings: MetalRateSettings | null;
  onClose: () => void;
}) {
  if (!detail) return null;
  const balState = describeBalanceState(detail.customer.currentBalance);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto print:static print:bg-white print:p-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto print:max-h-none print:overflow-visible print-only-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 no-print">
          <div className="text-sm font-semibold text-slate-900">
            Customer Ledger Statement · {detail.customer.name}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Statement</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close statement preview"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6 text-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-5">
            <div>
              <h1 className="text-xl font-bold">{settings?.businessName || 'AurumLedger Bullion & Assay'}</h1>
              <p className="text-xs text-slate-600">{settings?.businessAddress}</p>
              <p className="text-xs text-slate-600">{settings?.businessPhone}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Customer Account Statement</div>
              <div className="text-base font-bold">{detail.customer.name}</div>
              <div className="text-xs text-slate-600">
                {detail.customer.phone || ''} {detail.customer.address ? `· ${detail.customer.address}` : ''}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Generated {formatDateTime(new Date(), settings?.locale)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm">
            <div>
              <div className="text-xs text-slate-500">Fine Gold Produced</div>
              <div className="font-mono tabular-nums font-semibold">
                {formatGrams(detail.summary.goldFine, 4)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Fine Silver Produced</div>
              <div className="font-mono tabular-nums font-semibold">
                {formatGrams(detail.summary.silverFine, 4)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Metal Value</div>
              <div className="font-mono tabular-nums font-semibold">
                {formatCurrency(detail.summary.totalProduced, settings)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Net Current Balance</div>
              <div className="font-mono tabular-nums font-bold text-base">
                {formatCurrency(detail.customer.currentBalance, settings)}
              </div>
              <div className="text-[11px] text-slate-600">{balState.label}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Chronological Money Ledger</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left font-semibold text-slate-700">
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Voucher</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2">Mode / Details</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                  <th className="py-2 px-2 text-right">Bal Before</th>
                  <th className="py-2 px-2 text-right">Bal After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {detail.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2 px-2 whitespace-nowrap font-mono tabular-nums">
                      {formatDateTime(tx.createdAt, settings?.locale)}
                    </td>
                    <td className="py-2 px-2 font-mono tabular-nums">{tx.voucherNumber}</td>
                    <td className="py-2 px-2 font-semibold">{tx.type}</td>
                    <td className="py-2 px-2">
                      {formatPaymentMode(tx.paymentMode)} · {tx.description || '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold">
                      {formatCurrency(tx.amount, settings)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
                      {formatCurrency(tx.balanceBefore, settings)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold">
                      {formatCurrency(tx.balanceAfter, settings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
