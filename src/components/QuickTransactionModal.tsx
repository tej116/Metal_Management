import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { describeBalanceState, formatCurrency, formatPaymentMode } from '../lib/format.ts';
import type { CustomerSummaryItem, MetalRateSettings, PaymentMode } from '../types/ledger.ts';
import { ConfirmDialog, CustomerCombobox, Modal } from './ui/Primitives.tsx';

export function QuickTransactionModal({
  open,
  onClose,
  onSuccess,
  settings,
  initialCustomerId,
  initialType = 'WITHDRAW',
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  settings: MetalRateSettings | null;
  initialCustomerId?: string;
  initialType?: 'DEPOSIT' | 'WITHDRAW';
}) {
  const [customers, setCustomers] = useState<CustomerSummaryItem[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW'>(initialType);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setCustomerId(initialCustomerId || '');
    setAmount('');
    setPaymentMode('CASH');
    setDescription('');
    setError(null);
    setConfirmOpen(false);

    apiRequest<{ items: CustomerSummaryItem[] }>('/api/customers?pageSize=200')
      .then((res) => setCustomers(res.items))
      .catch(() => {});
  }, [open, initialCustomerId, initialType]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId]
  );

  const preview = useMemo(() => {
    const before = new Decimal(selectedCustomer?.currentBalance || 0);
    let amt = new Decimal(0);
    try {
      if (amount.trim()) {
        const parsed = new Decimal(amount.trim());
        if (parsed.isFinite() && parsed.gt(0)) amt = parsed;
      }
    } catch {
      amt = new Decimal(0);
    }
    const after = type === 'DEPOSIT' ? before.plus(amt) : before.minus(amt);
    return {
      before: before.toFixed(2),
      amt: amt.toFixed(2),
      after: after.toFixed(2),
      validAmount: amt.gt(0),
    };
  }, [selectedCustomer, amount, type]);

  function handleValidateAndConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId) {
      setError('Please select a customer.');
      return;
    }
    if (!preview.validAmount) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }
    setConfirmOpen(true);
  }

  async function handleCommit() {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          type,
          amount: preview.amt,
          paymentMode,
          description: description.trim() || null,
        }),
      });
      setConfirmOpen(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setConfirmOpen(false);
      setError(err?.message || 'Failed to record transaction');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Record Deposit / Withdrawal"
        subtitle="Atomic double-entry ledger update with automatic before & after balances."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleValidateAndConfirm} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Segmented Mode Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Transaction Direction</label>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setType('WITHDRAW')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  type === 'WITHDRAW'
                    ? 'bg-white text-red-800 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                <span>Give Money (Withdraw)</span>
              </button>
              <button
                type="button"
                onClick={() => setType('DEPOSIT')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  type === 'DEPOSIT'
                    ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowDownLeft className="h-4 w-4" />
                <span>Receive Money (Deposit)</span>
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {type === 'WITHDRAW'
                ? 'Subtracts payout from customer balance (reduces payable or creates advance).'
                : 'Adds received cash/transfer to customer balance (increases credit or settles advance).'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer <span className="text-red-600">*</span>
            </label>
            <CustomerCombobox
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              settings={settings}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount ({settings?.currencySymbol || '₹'}) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer (RTGS / NEFT)</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks / Reference</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., RTGS UTR reference or cash settlement note..."
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          {selectedCustomer && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Current Balance</div>
                  <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-800">
                    {formatCurrency(preview.before, settings)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {describeBalanceState(preview.before).label}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Projected Balance After</div>
                  <div
                    className={`mt-0.5 font-mono tabular-nums font-semibold ${
                      new Decimal(preview.after).gt(0)
                        ? 'text-emerald-800'
                        : new Decimal(preview.after).lt(0)
                          ? 'text-red-700'
                          : 'text-slate-700'
                    }`}
                  >
                    {formatCurrency(preview.after, settings)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {describeBalanceState(preview.after).label}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Review & Confirm
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleCommit}
        isSubmitting={submitting}
        title={type === 'WITHDRAW' ? 'Confirm Customer Payout (Withdraw)' : 'Confirm Payment Receipt (Deposit)'}
        description="Please review the balance impact before committing this permanent ledger entry."
        confirmLabel={type === 'WITHDRAW' ? 'Confirm Payout' : 'Confirm Deposit'}
        summaryRows={[
          { label: 'Customer', value: selectedCustomer?.name || '' },
          { label: 'Type', value: type === 'WITHDRAW' ? 'WITHDRAW (Paid to Customer)' : 'DEPOSIT (Received)' },
          { label: 'Payment Mode', value: formatPaymentMode(paymentMode) },
          { label: 'Transaction Amount', value: formatCurrency(preview.amt, settings), highlight: true },
          { label: 'Balance Before', value: formatCurrency(preview.before, settings) },
          { label: 'Balance After', value: formatCurrency(preview.after, settings), highlight: true },
        ]}
      />
    </>
  );
}
