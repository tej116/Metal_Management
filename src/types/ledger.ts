export type TransactionType = 'DEPOSIT' | 'WITHDRAW' | 'METAL_CREDIT';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
export type MetalSplitStatus = 'ACTIVE' | 'REVERSED';

export interface MetalRateSettings {
  id: number;
  goldRatePerGram: string | null;
  silverRatePerGram: string | null;
  currencySymbol: string;
  locale: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  updatedAt: string;
}

export interface CustomerSummaryItem {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  currentBalance: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  splitCount?: number;
  transactionCount?: number;
  totalGoldFine?: string;
  totalSilverFine?: string;
  totalProducedAmount?: string;
}

export interface MetalSplitItem {
  id: string;
  receiptNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    address?: string | null;
    currentBalance: string;
  };
  itemsetName: string;
  grossProductWeight: string | null;
  goldWeight: string;
  goldPurity: string;
  goldFineWeight: string;
  goldRatePerGram: string;
  goldAmount: string;
  goldAmountOverridden: boolean;
  silverWeight: string;
  silverPurity: string;
  silverFineWeight: string;
  silverRatePerGram: string;
  silverAmount: string;
  silverAmountOverridden: boolean;
  totalProducedAmount: string;
  amountGivenToCustomer: string;
  remainingBalanceAdded: string;
  status: MetalSplitStatus;
  reversalReason: string | null;
  reversedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyTransactionItem {
  id: string;
  voucherNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    currentBalance: string;
  };
  metalSplitId: string | null;
  metalSplit?: {
    id: string;
    receiptNumber: string;
    itemsetName: string;
    status: MetalSplitStatus;
  } | null;
  type: TransactionType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  paymentMode: PaymentMode;
  description: string | null;
  isReversal: boolean;
  reversesTransactionId: string | null;
  createdAt: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DashboardResponse {
  rates: MetalRateSettings;
  kpis: {
    activeSplitCount: number;
    customerCount: number;
    totalGoldGross: string;
    totalGoldFine: string;
    totalSilverGross: string;
    totalSilverFine: string;
    totalValueProduced: string;
    totalPaidToCustomers: string;
    totalDepositsReceived: string;
    totalPayable: string;
    totalReceivable: string;
    netLiability: string;
  };
  recentSplits: MetalSplitItem[];
  recentTransactions: MoneyTransactionItem[];
}

export interface CustomerDetailResponse {
  customer: CustomerSummaryItem;
  summary: {
    activeSplitCount: number;
    goldGross: string;
    goldFine: string;
    silverGross: string;
    silverFine: string;
    totalProduced: string;
    totalWithdrawn: string;
    totalDeposited: string;
  };
  metalSplits: MetalSplitItem[];
  transactions: MoneyTransactionItem[];
}
