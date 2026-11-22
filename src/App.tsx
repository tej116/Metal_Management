import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Coins,
  LayoutDashboard,
  Menu,
  Plus,
  Scale,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest } from './lib/api.ts';
import { formatCurrency } from './lib/format.ts';
import { Link, RouterProvider, useRouter } from './lib/router.tsx';
import type {
  CustomerDetailResponse,
  CustomerSummaryItem,
  MetalRateSettings,
  MetalSplitItem,
  MoneyTransactionItem,
} from './types/ledger.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { SplitsListPage } from './pages/SplitsListPage.tsx';
import { NewSplitPage } from './pages/NewSplitPage.tsx';
import { TransactionsPage } from './pages/TransactionsPage.tsx';
import { CustomersPage } from './pages/CustomersPage.tsx';
import { CustomerDetailPage } from './pages/CustomerDetailPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { QuickTransactionModal } from './components/QuickTransactionModal.tsx';
import {
  PrintableCustomerStatementModal,
  PrintableSplitReceiptModal,
} from './components/PrintableReceiptModal.tsx';
import { ReversalModal } from './components/ReversalModal.tsx';
import { ConfirmDialog } from './components/ui/Primitives.tsx';

function WorkspaceApp() {
  const { pathname, navigate } = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<MetalRateSettings | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Quick Transaction Modal state
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txModalType, setTxModalType] = useState<'DEPOSIT' | 'WITHDRAW'>('WITHDRAW');
  const [txModalCustomerId, setTxModalCustomerId] = useState<string | undefined>(undefined);

  // Preselected customer when jumping from Customer Detail -> New Split
  const [preselectedSplitCustomerId, setPreselectedSplitCustomerId] = useState<string | undefined>(
    undefined
  );

  // Print receipt / statement modals
  const [printSplit, setPrintSplit] = useState<MetalSplitItem | null>(null);
  const [printStatement, setPrintStatement] = useState<CustomerDetailResponse | null>(null);

  // Audit reversal modal
  const [reversalTarget, setReversalTarget] = useState<{
    kind: 'split' | 'transaction';
    id: string;
    reference: string;
    summary: string;
  } | null>(null);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<{
    kind:
      | 'split'
      | 'transaction'
      | 'customer'
      | 'all_splits'
      | 'all_transactions'
      | 'all_records';
    id?: string;
    title: string;
    description: string;
    summaryRows: Array<{ label: string; value: string; highlight?: boolean }>;
    redirectTo?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiRequest<{ rates: MetalRateSettings }>('/api/rates');
      setSettings(res.rates);
    } catch {
      // Fallback handled gracefully by formatters
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const openQuickTransaction = useCallback(
    (type: 'DEPOSIT' | 'WITHDRAW' = 'WITHDRAW', customerId?: string) => {
      setTxModalType(type);
      setTxModalCustomerId(customerId);
      setTxModalOpen(true);
    },
    []
  );

  const openNewSplitForCustomer = useCallback(
    (customerId: string) => {
      setPreselectedSplitCustomerId(customerId);
      navigate('/splits/new');
    },
    [navigate]
  );

  const requestReverseSplit = useCallback((split: MetalSplitItem) => {
    setReversalTarget({
      kind: 'split',
      id: split.id,
      reference: split.receiptNumber,
      summary: `Reversing ${split.receiptNumber} (${split.itemsetName}) will mark the split REVERSED and post compensating ledger entries to restore the customer's balance.`,
    });
  }, []);

  const requestReverseTransaction = useCallback((tx: MoneyTransactionItem) => {
    setReversalTarget({
      kind: 'transaction',
      id: tx.id,
      reference: tx.voucherNumber,
      summary: `Reversing ${tx.voucherNumber} (${tx.type}) will post an equal and opposite audit entry so the customer's balance is restored without deleting history.`,
    });
  }, []);

  const requestDeleteSplit = useCallback(
    (split: MetalSplitItem) => {
      setDeleteTarget({
        kind: 'split',
        id: split.id,
        title: `Delete Metal Split · ${split.receiptNumber}`,
        description:
          'This will permanently delete this metal split record and its linked ledger transactions, and recalculate the customer balance.',
        summaryRows: [
          { label: 'Receipt #', value: split.receiptNumber },
          { label: 'Itemset', value: split.itemsetName },
          { label: 'Total Produced', value: formatCurrency(split.totalProducedAmount, settings), highlight: true },
        ],
      });
    },
    [settings]
  );

  const requestDeleteTransaction = useCallback(
    (tx: MoneyTransactionItem) => {
      setDeleteTarget({
        kind: 'transaction',
        id: tx.id,
        title: `Delete Transaction · ${tx.voucherNumber}`,
        description:
          'This will permanently remove this transaction from the ledger and recalculate the customer running balances.',
        summaryRows: [
          { label: 'Voucher #', value: tx.voucherNumber },
          { label: 'Type', value: tx.type },
          { label: 'Amount', value: formatCurrency(tx.amount, settings), highlight: true },
        ],
      });
    },
    [settings]
  );

  const requestDeleteCustomer = useCallback(
    (customer: CustomerSummaryItem, redirectAfter = false) => {
      setDeleteTarget({
        kind: 'customer',
        id: customer.id,
        title: `Delete Customer · ${customer.name}`,
        description:
          'This will permanently delete the customer account along with all of their metal split records and money transactions.',
        summaryRows: [
          { label: 'Customer', value: customer.name },
          { label: 'Current Balance', value: formatCurrency(customer.currentBalance, settings), highlight: true },
        ],
        redirectTo: redirectAfter ? '/customers' : undefined,
      });
    },
    [settings]
  );

  const requestDeleteAllSplits = useCallback(() => {
    setDeleteTarget({
      kind: 'all_splits',
      title: 'Delete All Metal Splits',
      description:
        'This will permanently delete every metal split record and its linked ledger transactions, and recalculate all customer balances.',
      summaryRows: [{ label: 'Scope', value: 'All Metal Split Records', highlight: true }],
    });
  }, []);

  const requestDeleteAllTransactions = useCallback(() => {
    setDeleteTarget({
      kind: 'all_transactions',
      title: 'Delete All Money Transactions',
      description:
        'This will permanently delete every money transaction in the ledger and reset all customer net balances to zero.',
      summaryRows: [{ label: 'Scope', value: 'All Money Ledger Transactions', highlight: true }],
    });
  }, []);

  const requestDeleteAllRecords = useCallback(() => {
    setDeleteTarget({
      kind: 'all_records',
      title: 'Delete All Ledger Records',
      description:
        'This will permanently delete all customers, metal split entries, and money transactions. Your configured metal rates and business profile will be kept.',
      summaryRows: [{ label: 'Scope', value: 'All Customers, Splits & Transactions', highlight: true }],
    });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      let url = '';
      if (deleteTarget.kind === 'split' && deleteTarget.id) {
        url = `/api/splits/${deleteTarget.id}`;
      } else if (deleteTarget.kind === 'transaction' && deleteTarget.id) {
        url = `/api/transactions/${deleteTarget.id}`;
      } else if (deleteTarget.kind === 'customer' && deleteTarget.id) {
        url = `/api/customers/${deleteTarget.id}`;
      } else if (deleteTarget.kind === 'all_splits') {
        url = '/api/splits';
      } else if (deleteTarget.kind === 'all_transactions') {
        url = '/api/transactions';
      } else if (deleteTarget.kind === 'all_records') {
        url = '/api/records/all';
      }

      if (url) {
        await apiRequest(url, { method: 'DELETE' });
      }
      const redirectTo = deleteTarget.redirectTo;
      setDeleteTarget(null);
      triggerRefresh();
      if (redirectTo) {
        navigate(redirectTo);
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete record(s)');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, navigate, triggerRefresh]);

  const customerDetailMatch = useMemo(() => {
    const match = pathname.match(/^\/customers\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const breadcrumb = useMemo(() => {
    if (pathname === '/') return 'Overview';
    if (pathname === '/splits') return 'Metal Splits / Refining Records';
    if (pathname === '/splits/new') return 'Metal Splits / New Assay Entry';
    if (pathname === '/transactions') return 'Money Ledger / Deposit & Withdraw';
    if (pathname === '/customers') return 'Customers / Directory';
    if (customerDetailMatch) return 'Customers / Account Ledger';
    if (pathname === '/settings') return 'Rates & Business Settings';
    return 'Overview';
  }, [pathname, customerDetailMatch]);

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, active: pathname === '/' },
    {
      to: '/splits',
      label: 'Metal Splits',
      icon: Scale,
      active: pathname === '/splits',
    },
    {
      to: '/splits/new',
      label: 'New Metal Split',
      icon: Coins,
      active: pathname === '/splits/new',
    },
    {
      to: '/transactions',
      label: 'Money Ledger',
      icon: ArrowLeftRight,
      active: pathname === '/transactions',
    },
    {
      to: '/customers',
      label: 'Customers',
      icon: Users,
      active: pathname === '/customers' || Boolean(customerDetailMatch),
    },
    {
      to: '/settings',
      label: 'Rates & Settings',
      icon: Settings,
      active: pathname === '/settings',
    },
  ];

  const renderPage = () => {
    if (pathname === '/') {
      return (
        <DashboardPage
          settings={settings}
          onSettingsUpdated={(rates) => {
            setSettings(rates);
            triggerRefresh();
          }}
          onOpenQuickTransaction={(t) => openQuickTransaction(t)}
          onPrintSplit={setPrintSplit}
          onRequestDeleteSplit={requestDeleteSplit}
          onRequestDeleteTransaction={requestDeleteTransaction}
          onRequestDeleteAllRecords={requestDeleteAllRecords}
          refreshKey={refreshKey}
        />
      );
    }
    if (pathname === '/splits') {
      return (
        <SplitsListPage
          settings={settings}
          onPrintSplit={setPrintSplit}
          onRequestReverseSplit={requestReverseSplit}
          onRequestDeleteSplit={requestDeleteSplit}
          onRequestDeleteAllSplits={requestDeleteAllSplits}
          refreshKey={refreshKey}
        />
      );
    }
    if (pathname === '/splits/new') {
      return (
        <NewSplitPage
          settings={settings}
          onCreated={triggerRefresh}
          onPrintSplit={setPrintSplit}
          initialCustomerId={preselectedSplitCustomerId}
        />
      );
    }
    if (pathname === '/transactions') {
      return (
        <TransactionsPage
          settings={settings}
          onOpenQuickTransaction={(t) => openQuickTransaction(t)}
          onRequestReverseTransaction={requestReverseTransaction}
          onRequestDeleteTransaction={requestDeleteTransaction}
          onRequestDeleteAllTransactions={requestDeleteAllTransactions}
          refreshKey={refreshKey}
        />
      );
    }
    if (pathname === '/customers') {
      return (
        <CustomersPage
          settings={settings}
          onOpenQuickTransaction={openQuickTransaction}
          onRequestDeleteCustomer={(c) => requestDeleteCustomer(c, false)}
          onRequestDeleteAllRecords={requestDeleteAllRecords}
          refreshKey={refreshKey}
        />
      );
    }
    if (customerDetailMatch) {
      return (
        <CustomerDetailPage
          customerId={customerDetailMatch}
          settings={settings}
          onOpenQuickTransaction={openQuickTransaction}
          onNewSplitForCustomer={openNewSplitForCustomer}
          onPrintSplit={setPrintSplit}
          onPrintStatement={setPrintStatement}
          onRequestReverseSplit={requestReverseSplit}
          onRequestReverseTransaction={requestReverseTransaction}
          onRequestDeleteSplit={requestDeleteSplit}
          onRequestDeleteTransaction={requestDeleteTransaction}
          onRequestDeleteCustomer={(c) => requestDeleteCustomer(c, true)}
          refreshKey={refreshKey}
        />
      );
    }
    if (pathname === '/settings') {
      return (
        <SettingsPage
          settings={settings}
          onSettingsUpdated={setSettings}
          onRequestDeleteAllRecords={requestDeleteAllRecords}
        />
      );
    }
    return (
      <DashboardPage
        settings={settings}
        onSettingsUpdated={(rates) => {
          setSettings(rates);
          triggerRefresh();
        }}
        onOpenQuickTransaction={(t) => openQuickTransaction(t)}
        onPrintSplit={setPrintSplit}
        onRequestDeleteSplit={requestDeleteSplit}
        onRequestDeleteTransaction={requestDeleteTransaction}
        onRequestDeleteAllRecords={requestDeleteAllRecords}
        refreshKey={refreshKey}
      />
    );
  };

  const isPrintPreviewOpen = Boolean(printSplit || printStatement);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden no-print"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (256px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 h-16 shrink-0">
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            AurumLedger
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => {
                  if (item.to === '/splits/new') setPreselectedSplitCustomerId(undefined);
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  item.active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Reference Assay Rates Summary in Sidebar Footer */}
        <div className="border-t border-slate-200 p-4 space-y-2 text-xs">
          <div className="font-medium text-slate-500">Your Assay Rates</div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Gold (Au) / g</span>
            <span className="font-mono tabular-nums font-semibold text-amber-900">
              {settings?.goldRatePerGram ? formatCurrency(settings.goldRatePerGram, settings) : 'Not set'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Silver (Ag) / g</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {settings?.silverRatePerGram ? formatCurrency(settings.silverRatePerGram, settings) : 'Not set'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden shrink-0"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-slate-900 truncate whitespace-nowrap">
              {breadcrumb}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => openQuickTransaction('WITHDRAW')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Wallet className="h-3.5 w-3.5" />
              <span>Deposit / Withdraw</span>
            </button>
            <Link
              to="/splits/new"
              onClick={() => setPreselectedSplitCustomerId(undefined)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Metal Split</span>
            </Link>
          </div>
        </header>

        <main
          className={`flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto ${
            isPrintPreviewOpen ? 'no-print' : ''
          }`}
        >
          {renderPage()}
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3.5 text-center text-xs text-slate-500 no-print">
          Powered by <span className="font-semibold text-slate-800">Tejas</span>
        </footer>
      </div>

      {/* Global Interactive Modals */}
      <QuickTransactionModal
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        onSuccess={triggerRefresh}
        settings={settings}
        initialType={txModalType}
        initialCustomerId={txModalCustomerId}
      />

      <PrintableSplitReceiptModal
        split={printSplit}
        settings={settings}
        onClose={() => setPrintSplit(null)}
      />

      <PrintableCustomerStatementModal
        detail={printStatement}
        settings={settings}
        onClose={() => setPrintStatement(null)}
      />

      <ReversalModal
        open={Boolean(reversalTarget)}
        onClose={() => setReversalTarget(null)}
        onSuccess={triggerRefresh}
        target={reversalTarget}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteError(null);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.title || 'Confirm Delete'}
        description={deleteTarget?.description || ''}
        summaryRows={deleteTarget?.summaryRows || []}
        confirmLabel="Permanently Delete"
        confirmTone="danger"
        isSubmitting={deleting}
        error={deleteError}
      />
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <WorkspaceApp />
    </RouterProvider>
  );
}
