import React, { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { MetalRateSettings } from '../types/ledger.ts';

export function SettingsPage({
  settings,
  onSettingsUpdated,
  onRequestDeleteAllRecords,
}: {
  settings: MetalRateSettings | null;
  onSettingsUpdated: (rates: MetalRateSettings) => void;
  onRequestDeleteAllRecords: () => void;
}) {
  const [goldRatePerGram, setGoldRatePerGram] = useState('');
  const [silverRatePerGram, setSilverRatePerGram] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [locale, setLocale] = useState('en-IN');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setGoldRatePerGram(settings.goldRatePerGram ?? '');
    setSilverRatePerGram(settings.silverRatePerGram ?? '');
    setCurrencySymbol(settings.currencySymbol);
    setLocale(settings.locale);
    setBusinessName(settings.businessName);
    setBusinessAddress(settings.businessAddress);
    setBusinessPhone(settings.businessPhone);
  }, [settings]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    setError(null);
    try {
      const res = await apiRequest<{ rates: MetalRateSettings }>('/api/rates', {
        method: 'PUT',
        body: JSON.stringify({
          goldRatePerGram: goldRatePerGram.trim() || null,
          silverRatePerGram: silverRatePerGram.trim() || null,
          currencySymbol,
          locale,
          businessName,
          businessAddress,
          businessPhone,
        }),
      });
      onSettingsUpdated(res.rates);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="border-b border-slate-200 pb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Assay Rates, Currency & Receipt Profile</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Set your own Gold &amp; Silver rates, INR formatting, and business details shown on printed receipts.
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Check className="h-4 w-4" />
              <span>Settings saved</span>
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Gold Rate ({currencySymbol}/g)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={goldRatePerGram}
              onChange={(e) => setGoldRatePerGram(e.target.value)}
              placeholder="Enter your Gold rate / g"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Silver Rate ({currencySymbol}/g)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={silverRatePerGram}
              onChange={(e) => setSilverRatePerGram(e.target.value)}
              placeholder="Enter your Silver rate / g"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono tabular-nums text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Currency Symbol</label>
            <input
              type="text"
              maxLength={6}
              required
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Number Formatting Locale</label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            >
              <option value="en-IN">en-IN (Indian Lakhs/Crores · 1,00,000.00)</option>
              <option value="en-US">en-US (International · 100,000.00)</option>
              <option value="en-GB">en-GB (UK · 100,000.00)</option>
              <option value="en-AE">en-AE (UAE · 100,000.00)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Printed Receipt & Statement Header</h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Business Address</label>
              <input
                type="text"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Business Phone</label>
              <input
                type="text"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Saving Settings...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-red-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Delete All Ledger Records</h3>
          <p className="text-xs text-slate-600 mt-1">
            Permanently remove all customers, metal split entries, and money transactions. Your rates and business profile remain intact.
          </p>
        </div>
        <button
          type="button"
          onClick={onRequestDeleteAllRecords}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete All Records</span>
        </button>
      </div>
    </div>
  );
}
