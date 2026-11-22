import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { ArrowLeft, CheckCircle2, Printer, RotateCcw } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { describeBalanceState, formatCurrency, formatGrams, formatPaymentMode } from '../lib/format.ts';
import { Link, useRouter } from '../lib/router.tsx';
import { calculateSplitMetrics } from '../lib/validation.ts';
import type {
  CustomerSummaryItem,
  MetalRateSettings,
  MetalSplitItem,
  PaymentMode,
} from '../types/ledger.ts';
import { ConfirmDialog, CustomerCombobox } from '../components/ui/Primitives.tsx';
import { QuickCustomerModal } from '../components/QuickCustomerModal.tsx';

export function NewSplitPage({
  settings,
  onCreated,
  onPrintSplit,
  initialCustomerId,
}: {
  settings: MetalRateSettings | null;
  onCreated: () => void;
  onPrintSplit: (split: MetalSplitItem) => void;
  initialCustomerId?: string;
}) {
  const { navigate } = useRouter();
  const [customers, setCustomers] = useState<CustomerSummaryItem[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);

  const [itemsetName, setItemsetName] = useState('');
  const [grossProductWeight, setGrossProductWeight] = useState('');

  // Gold fields (user-defined rates, auto-filled only if user saved rates in settings)
  const [goldWeight, setGoldWeight] = useState('');
  const [goldPurity, setGoldPurity] = useState('');
  const [goldRatePerGram, setGoldRatePerGram] = useState(settings?.goldRatePerGram ?? '');
  const [goldAmountOverridden, setGoldAmountOverridden] = useState(false);
  const [goldAmountOverride, setGoldAmountOverride] = useState('');

  // Silver fields
  const [silverWeight, setSilverWeight] = useState('');
  const [silverPurity, setSilverPurity] = useState('');
  const [silverRatePerGram, setSilverRatePerGram] = useState(settings?.silverRatePerGram ?? '');
  const [silverAmountOverridden, setSilverAmountOverridden] = useState(false);
  const [silverAmountOverride, setSilverAmountOverride] = useState('');

  // Immediate payout & notes
  const [amountGivenToCustomer, setAmountGivenToCustomer] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedSplit, setSavedSplit] = useState<MetalSplitItem | null>(null);

  useEffect(() => {
    apiRequest<{ items: CustomerSummaryItem[] }>('/api/customers?pageSize=200')
      .then((res) => setCustomers(res.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (settings) {
      setGoldRatePerGram((prev) => (!prev && settings.goldRatePerGram ? settings.goldRatePerGram : prev));
      setSilverRatePerGram((prev) =>
        !prev && settings.silverRatePerGram ? settings.silverRatePerGram : prev
      );
    }
  }, [settings]);

  useEffect(() => {
    if (initialCustomerId) setCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId]
  );

  const calc = useMemo(
    () =>
      calculateSplitMetrics({
        goldWeight,
        goldPurity,
        goldRatePerGram,
        goldAmountOverridden,
        goldAmountOverride,
        silverWeight,
        silverPurity,
        silverRatePerGram,
        silverAmountOverridden,
        silverAmountOverride,
        amountGivenToCustomer,
      }),
    [
      goldWeight,
      goldPurity,
      goldRatePerGram,
      goldAmountOverridden,
      goldAmountOverride,
      silverWeight,
      silverPurity,
      silverRatePerGram,
      silverAmountOverridden,
      silverAmountOverride,
      amountGivenToCustomer,
    ]
  );

  const projectedBalance = useMemo(() => {
    const current = new Decimal(selectedCustomer?.currentBalance || 0);
    return current.plus(calc.remainingBalanceAdded).toFixed(2);
  }, [selectedCustomer, calc.remainingBalanceAdded]);

  function handleValidateAndReview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError('Please select or create a customer before saving.');
      return;
    }
    if (itemsetName.trim().length < 2) {
      setError('Please enter an Itemset / Product name (e.g., Old Mixed Necklace Set).');
      return;
    }

    const gw = new Decimal(goldWeight || 0);
    const sw = new Decimal(silverWeight || 0);
    const gp = new Decimal(goldPurity || 0);
    const sp = new Decimal(silverPurity || 0);
    const gr = new Decimal(goldRatePerGram || 0);
    const sr = new Decimal(silverRatePerGram || 0);

    if (gw.lte(0) && sw.lte(0)) {
      setError('Enter a weight greater than 0 for Gold or Silver.');
      return;
    }
    if (gp.lt(0) || gp.gt(100) || sp.lt(0) || sp.gt(100)) {
      setError('Purity percentage must be between 0 and 100.');
      return;
    }
    if (gw.gt(0) && gp.lte(0)) {
      setError('Enter a Gold purity percentage greater than 0.');
      return;
    }
    if (gw.gt(0) && !goldAmountOverridden && gr.lte(0)) {
      setError('Enter the Gold rate per gram.');
      return;
    }
    if (sw.gt(0) && sp.lte(0)) {
      setError('Enter a Silver purity percentage greater than 0.');
      return;
    }
    if (sw.gt(0) && !silverAmountOverridden && sr.lte(0)) {
      setError('Enter the Silver rate per gram.');
      return;
    }
    if (new Decimal(amountGivenToCustomer || 0).lt(0)) {
      setError('Immediate payout amount cannot be negative.');
      return;
    }

    setConfirmOpen(true);
  }

  async function handleCommitSplit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<{ split: MetalSplitItem; customer: CustomerSummaryItem }>('/api/splits', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          itemsetName: itemsetName.trim(),
          grossProductWeight: grossProductWeight.trim() || null,
          goldWeight: goldWeight.trim() || '0',
          goldPurity: goldPurity.trim() || '0',
          goldRatePerGram: goldRatePerGram.trim() || '0',
          goldAmountOverridden,
          goldAmountOverride: goldAmountOverridden ? goldAmountOverride : null,
          silverWeight: silverWeight.trim() || '0',
          silverPurity: silverPurity.trim() || '0',
          silverRatePerGram: silverRatePerGram.trim() || '0',
          silverAmountOverridden,
          silverAmountOverride: silverAmountOverridden ? silverAmountOverride : null,
          amountGivenToCustomer: amountGivenToCustomer.trim() || '0',
          paymentMode,
          notes: notes.trim() || null,
        }),
      });
      setConfirmOpen(false);
      setSavedSplit(res.split);
      setCustomers((prev) => prev.map((c) => (c.id === res.customer.id ? { ...c, ...res.customer } : c)));
      onCreated();
    } catch (err: any) {
      setConfirmOpen(false);
      setError(err?.message || 'Failed to save metal split entry');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForAnotherEntry() {
    setSavedSplit(null);
    setItemsetName('');
    setGrossProductWeight('');
    setGoldWeight('');
    setGoldPurity('');
    setSilverWeight('');
    setSilverPurity('');
    setGoldAmountOverridden(false);
    setGoldAmountOverride('');
    setSilverAmountOverridden(false);
    setSilverAmountOverride('');
    setAmountGivenToCustomer('');
    setNotes('');
    setError(null);
  }

  if (savedSplit) {
    return (
      <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white p-8 space-y-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Metal Split Saved · {savedSplit.receiptNumber}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Metal credit and payout ledger entries were recorded atomically for{' '}
              <span className="font-semibold text-slate-900">{savedSplit.customer?.name}</span>.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-600">Itemset</span>
            <span className="font-medium text-slate-900">{savedSplit.itemsetName}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-600">Fine Gold / Silver</span>
            <span className="font-mono tabular-nums font-medium text-slate-900">
              {formatGrams(savedSplit.goldFineWeight, 4)} Au · {formatGrams(savedSplit.silverFineWeight, 4)} Ag
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-600">Total Produced Value</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {formatCurrency(savedSplit.totalProducedAmount, settings)}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-600">Immediate Payout</span>
            <span className="font-mono tabular-nums text-red-700">
              -{formatCurrency(savedSplit.amountGivenToCustomer, settings)}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-600">Net Balance Added</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-800">
              {formatCurrency(savedSplit.remainingBalanceAdded, settings)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onPrintSplit(savedSplit)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            <span>Print Assay Receipt</span>
          </button>
          <button
            type="button"
            onClick={resetForAnotherEntry}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            + Log Another Split
          </button>
          {savedSplit.customer && (
            <button
              type="button"
              onClick={() => navigate(`/customers/${savedSplit.customer!.id}`)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open Customer Ledger
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/splits"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Metal Splits</span>
        </Link>
      </div>

      <form onSubmit={handleValidateAndReview} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Section 1: Customer & Itemset */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">1. Customer & Itemset Intake</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Select Customer <span className="text-red-600">*</span>
            </label>
            <CustomerCombobox
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              onQuickCreate={() => setQuickCustomerOpen(true)}
              settings={settings}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Itemset / Product Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={itemsetName}
                onChange={(e) => setItemsetName(e.target.value)}
                placeholder="e.g., Old Mixed Necklace Set, Scrap Ornament Batch 1"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Gross Intake Weight (g)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={grossProductWeight}
                onChange={(e) => setGrossProductWeight(e.target.value)}
                placeholder="Optional e.g. 142.500"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Side-by-Side Gold & Silver Split Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* GOLD CARD */}
          <div className="rounded-xl border border-amber-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-amber-950">Gold Recovery (Au)</h3>
                <p className="text-xs text-slate-500">Extracted gold weight, purity %, and rate per fine gram</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">Fine Gold</div>
                <div className="font-mono tabular-nums text-base font-bold text-amber-900">
                  {calc.goldFineWeight} g
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gold Weight (g)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={goldWeight}
                  onChange={(e) => setGoldWeight(e.target.value)}
                  placeholder="0.000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Purity (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={goldPurity}
                  onChange={(e) => setGoldPurity(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rate ({settings?.currencySymbol || '₹'}/g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={goldRatePerGram}
                  onChange={(e) => setGoldRatePerGram(e.target.value)}
                  placeholder="Enter rate / g"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>
            </div>

            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Formula: {goldWeight || '0'} g × ({goldPurity || '0'}% / 100)</span>
                <span className="font-mono tabular-nums font-medium text-slate-800">
                  {calc.goldFineWeight} g fine
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Gold Value</span>
                <span className="font-mono tabular-nums text-lg font-bold text-amber-950">
                  {formatCurrency(calc.goldAmount, settings)}
                </span>
              </div>
              <div className="pt-1 flex items-center justify-between gap-2 border-t border-amber-100">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={goldAmountOverridden}
                    onChange={(e) => {
                      setGoldAmountOverridden(e.target.checked);
                      if (e.target.checked && !goldAmountOverride) {
                        setGoldAmountOverride(calc.calculatedGoldAmount);
                      }
                    }}
                    className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                  />
                  <span>Override calculated amount</span>
                </label>
                {goldAmountOverridden && (
                  <button
                    type="button"
                    onClick={() => {
                      setGoldAmountOverridden(false);
                      setGoldAmountOverride('');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-amber-800 hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              {goldAmountOverridden && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={goldAmountOverride}
                  onChange={(e) => setGoldAmountOverride(e.target.value)}
                  placeholder="Enter custom gold amount"
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* SILVER CARD */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Silver Recovery (Ag)</h3>
                <p className="text-xs text-slate-500">Extracted silver weight, purity %, and rate per fine gram</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">Fine Silver</div>
                <div className="font-mono tabular-nums text-base font-bold text-slate-800">
                  {calc.silverFineWeight} g
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Silver Weight (g)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={silverWeight}
                  onChange={(e) => setSilverWeight(e.target.value)}
                  placeholder="0.000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Purity (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={silverPurity}
                  onChange={(e) => setSilverPurity(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rate ({settings?.currencySymbol || '₹'}/g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={silverRatePerGram}
                  onChange={(e) => setSilverRatePerGram(e.target.value)}
                  placeholder="Enter rate / g"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Formula: {silverWeight || '0'} g × ({silverPurity || '0'}% / 100)</span>
                <span className="font-mono tabular-nums font-medium text-slate-800">
                  {calc.silverFineWeight} g fine
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Silver Value</span>
                <span className="font-mono tabular-nums text-lg font-bold text-slate-900">
                  {formatCurrency(calc.silverAmount, settings)}
                </span>
              </div>
              <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-200">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={silverAmountOverridden}
                    onChange={(e) => {
                      setSilverAmountOverridden(e.target.checked);
                      if (e.target.checked && !silverAmountOverride) {
                        setSilverAmountOverride(calc.calculatedSilverAmount);
                      }
                    }}
                    className="rounded border-slate-300 text-slate-800 focus:ring-slate-600"
                  />
                  <span>Override calculated amount</span>
                </label>
                {silverAmountOverridden && (
                  <button
                    type="button"
                    onClick={() => {
                      setSilverAmountOverridden(false);
                      setSilverAmountOverride('');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-slate-700 hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              {silverAmountOverridden && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={silverAmountOverride}
                  onChange={(e) => setSilverAmountOverride(e.target.value)}
                  placeholder="Enter custom silver amount"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none"
                />
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Settlement & Immediate Payout */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">3. Valuation Summary & Immediate Payout</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount Given Now ({settings?.currencySymbol || '₹'})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountGivenToCustomer}
                onChange={(e) => setAmountGivenToCustomer(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payout Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assay Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., XRF tested, stones removed..."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="text-xs text-slate-500">Total Produced Value</div>
              <div className="mt-0.5 font-mono tabular-nums text-lg font-bold text-slate-900">
                {formatCurrency(calc.totalProducedAmount, settings)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Immediate Payout</div>
              <div className="mt-0.5 font-mono tabular-nums text-lg font-semibold text-red-700">
                -{formatCurrency(calc.amountGivenToCustomer, settings)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Remaining Added to Ledger</div>
              <div className="mt-0.5 font-mono tabular-nums text-lg font-bold text-emerald-800">
                {formatCurrency(calc.remainingBalanceAdded, settings, { signed: true })}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">
                {selectedCustomer ? `${selectedCustomer.name} New Balance` : 'Projected Customer Balance'}
              </div>
              <div className="mt-0.5 font-mono tabular-nums text-lg font-bold text-slate-900">
                {selectedCustomer ? formatCurrency(projectedBalance, settings) : '—'}
              </div>
              {selectedCustomer && (
                <div className="text-[11px] text-slate-500">
                  {describeBalanceState(projectedBalance).label}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <Link
              to="/splits"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Review & Commit Metal Split
            </button>
          </div>
        </div>
      </form>

      <QuickCustomerModal
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        onSaved={(newCust) => {
          setCustomers((prev) => [newCust, ...prev]);
          setCustomerId(newCust.id);
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleCommitSplit}
        isSubmitting={submitting}
        title="Confirm Metal Split & Ledger Posting"
        description="This will atomically create the assay record, post a METAL_CREDIT ledger entry, and record any immediate payout."
        confirmLabel="Confirm & Save Entry"
        summaryRows={[
          { label: 'Customer', value: selectedCustomer?.name || '' },
          { label: 'Itemset', value: itemsetName.trim() },
          { label: 'Fine Gold (Au)', value: `${calc.goldFineWeight} g · ${formatCurrency(calc.goldAmount, settings)}` },
          { label: 'Fine Silver (Ag)', value: `${calc.silverFineWeight} g · ${formatCurrency(calc.silverAmount, settings)}` },
          { label: 'Total Produced Amount', value: formatCurrency(calc.totalProducedAmount, settings), highlight: true },
          {
            label: `Immediate Payout (${formatPaymentMode(paymentMode)})`,
            value: formatCurrency(calc.amountGivenToCustomer, settings),
          },
          {
            label: 'Net Ledger Credit Added',
            value: formatCurrency(calc.remainingBalanceAdded, settings),
            highlight: true,
          },
          {
            label: 'New Customer Balance',
            value: formatCurrency(projectedBalance, settings),
            highlight: true,
          },
        ]}
      />
    </div>
  );
}
