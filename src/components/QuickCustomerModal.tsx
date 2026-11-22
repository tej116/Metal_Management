import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.ts';
import type { CustomerSummaryItem } from '../types/ledger.ts';
import { Modal } from './ui/Primitives.tsx';

export function QuickCustomerModal({
  open,
  onClose,
  onSaved,
  existingCustomer,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (customer: CustomerSummaryItem) => void;
  existingCustomer?: CustomerSummaryItem | null;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(existingCustomer?.name ?? '');
    setPhone(existingCustomer?.phone ?? '');
    setAddress(existingCustomer?.address ?? '');
    setNotes(existingCustomer?.notes ?? '');
    setError(null);
  }, [open, existingCustomer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('Customer name must be at least 2 characters.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      };
      const res = existingCustomer
        ? await apiRequest<{ customer: CustomerSummaryItem }>(`/api/customers/${existingCustomer.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ customer: CustomerSummaryItem }>('/api/customers', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onSaved(res.customer);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existingCustomer ? 'Edit Customer Profile' : 'Create New Customer'}
      subtitle="Customer account balances and assay history are tracked automatically."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Customer / Firm Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Rajeshwari Jewellers"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g., +91 98201 44510"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Address / Market</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g., Zaveri Bazaar, Mumbai"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Settlement preferences or assay instructions..."
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
          />
        </div>

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
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : existingCustomer ? 'Update Customer' : 'Save Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
