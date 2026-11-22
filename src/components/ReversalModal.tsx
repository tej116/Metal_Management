import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.ts';
import { Modal } from './ui/Primitives.tsx';

export function ReversalModal({
  open,
  onClose,
  onSuccess,
  target,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  target: {
    kind: 'split' | 'transaction';
    id: string;
    reference: string;
    summary: string;
  } | null;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
  }, [open, target]);

  if (!target) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    if (reason.trim().length < 3) {
      setError('Please provide an audit reason (at least 3 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint =
        target.kind === 'split'
          ? `/api/splits/${target.id}/reverse`
          : `/api/transactions/${target.id}/reverse`;
      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to post reversal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Audit Reversal · ${target.reference}`}
      subtitle="Original records are never deleted. Reversing creates compensating ledger entries."
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950">
          {target.summary}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Audit Reason for Reversal <span className="text-red-600">*</span>
          </label>
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Assay purity re-tested at 91.20%; re-entering corrected batch."
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {submitting ? 'Posting Reversal...' : 'Post Audit Reversal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
