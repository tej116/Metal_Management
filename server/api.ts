import { Router, type Request, type Response } from 'express';
import { PaymentMode, Prisma, TransactionType } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../src/lib/prisma.ts';
import {
  calculateSplitMetrics,
  createCustomerSchema,
  createMetalSplitSchema,
  createMoneyTransactionSchema,
  reverseRecordSchema,
  updateCustomerSchema,
  updateRatesSchema,
} from '../src/lib/validation.ts';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const router = Router();

async function getNextSequence(
  tx: Prisma.TransactionClient,
  key: 'METAL_SPLIT' | 'MONEY_TRANSACTION',
  prefix: string
): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await tx.sequenceCounter.upsert({
    where: { key },
    update: { nextValue: { increment: 1 } },
    create: { key, nextValue: 2 },
  });
  const issued = counter.nextValue - 1;
  return `${prefix}-${year}-${String(issued).padStart(4, '0')}`;
}

async function ensureDefaultRates() {
  return prisma.metalRate.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      goldRatePerGram: null,
      silverRatePerGram: null,
      currencySymbol: '₹',
      locale: 'en-IN',
      businessName: 'AurumLedger',
      businessAddress: '',
      businessPhone: '',
    },
  });
}

async function recalculateCustomerLedger(tx: Prisma.TransactionClient, customerId: string) {
  const txs = await tx.moneyTransaction.findMany({
    where: { customerId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let running = new Decimal(0);
  for (const item of txs) {
    const before = running;
    const amt = new Decimal(item.amount.toString());
    const after =
      item.type === TransactionType.WITHDRAW
        ? before.minus(amt).toDecimalPlaces(2)
        : before.plus(amt).toDecimalPlaces(2);

    if (
      !before.eq(item.balanceBefore.toString()) ||
      !after.eq(item.balanceAfter.toString())
    ) {
      await tx.moneyTransaction.update({
        where: { id: item.id },
        data: {
          balanceBefore: before.toFixed(2),
          balanceAfter: after.toFixed(2),
        },
      });
    }
    running = after;
  }

  await tx.customer.update({
    where: { id: customerId },
    data: { currentBalance: running.toFixed(2) },
  });

  return running;
}

function serializeDecimal(val: Prisma.Decimal | Decimal | null | undefined, places = 2): string {
  if (val === null || val === undefined) return '0.00';
  return new Decimal(val.toString()).toFixed(places);
}

function formatCustomer(c: any) {
  return {
    ...c,
    currentBalance: serializeDecimal(c.currentBalance, 2),
  };
}

function formatMetalSplit(s: any) {
  return {
    ...s,
    grossProductWeight: s.grossProductWeight !== null && s.grossProductWeight !== undefined ? serializeDecimal(s.grossProductWeight, 3) : null,
    goldWeight: serializeDecimal(s.goldWeight, 3),
    goldPurity: serializeDecimal(s.goldPurity, 2),
    goldFineWeight: serializeDecimal(s.goldFineWeight, 4),
    goldRatePerGram: serializeDecimal(s.goldRatePerGram, 2),
    goldAmount: serializeDecimal(s.goldAmount, 2),
    silverWeight: serializeDecimal(s.silverWeight, 3),
    silverPurity: serializeDecimal(s.silverPurity, 2),
    silverFineWeight: serializeDecimal(s.silverFineWeight, 4),
    silverRatePerGram: serializeDecimal(s.silverRatePerGram, 2),
    silverAmount: serializeDecimal(s.silverAmount, 2),
    totalProducedAmount: serializeDecimal(s.totalProducedAmount, 2),
    amountGivenToCustomer: serializeDecimal(s.amountGivenToCustomer, 2),
    remainingBalanceAdded: serializeDecimal(s.remainingBalanceAdded, 2),
    customer: s.customer ? formatCustomer(s.customer) : undefined,
  };
}

function formatTransaction(t: any) {
  return {
    ...t,
    amount: serializeDecimal(t.amount, 2),
    balanceBefore: serializeDecimal(t.balanceBefore, 2),
    balanceAfter: serializeDecimal(t.balanceAfter, 2),
    customer: t.customer ? formatCustomer(t.customer) : undefined,
    metalSplit: t.metalSplit
      ? {
          id: t.metalSplit.id,
          receiptNumber: t.metalSplit.receiptNumber,
          itemsetName: t.metalSplit.itemsetName,
          status: t.metalSplit.status,
        }
      : null,
  };
}

function formatRates(r: any) {
  return {
    ...r,
    goldRatePerGram:
      r.goldRatePerGram !== null && r.goldRatePerGram !== undefined
        ? serializeDecimal(r.goldRatePerGram, 2)
        : null,
    silverRatePerGram:
      r.silverRatePerGram !== null && r.silverRatePerGram !== undefined
        ? serializeDecimal(r.silverRatePerGram, 2)
        : null,
  };
}

function parseDateRange(dateFrom?: string, dateTo?: string) {
  const filter: Prisma.DateTimeFilter = {};
  if (dateFrom && !Number.isNaN(Date.parse(dateFrom))) {
    const start = new Date(dateFrom);
    start.setHours(0, 0, 0, 0);
    filter.gte = start;
  }
  if (dateTo && !Number.isNaN(Date.parse(dateTo))) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

// Health
router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Dashboard KPIs & recent activity
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [rates, activeSplits, customers, withdrawTxs, depositTxs, recentSplits, recentTransactions] =
      await Promise.all([
        ensureDefaultRates(),
        prisma.metalSplit.findMany({
          where: { status: 'ACTIVE' },
          select: {
            goldWeight: true,
            goldFineWeight: true,
            silverWeight: true,
            silverFineWeight: true,
            totalProducedAmount: true,
            amountGivenToCustomer: true,
          },
        }),
        prisma.customer.findMany({
          where: { isArchived: false },
          select: { id: true, currentBalance: true },
        }),
        prisma.moneyTransaction.findMany({
          where: { type: 'WITHDRAW', isReversal: false },
          select: { amount: true },
        }),
        prisma.moneyTransaction.findMany({
          where: { type: 'DEPOSIT', isReversal: false },
          select: { amount: true },
        }),
        prisma.metalSplit.findMany({
          take: 6,
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { id: true, name: true, phone: true, currentBalance: true } } },
        }),
        prisma.moneyTransaction.findMany({
          take: 8,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { id: true, name: true, phone: true, currentBalance: true } },
            metalSplit: { select: { id: true, receiptNumber: true, itemsetName: true, status: true } },
          },
        }),
      ]);

    let totalGoldGross = new Decimal(0);
    let totalGoldFine = new Decimal(0);
    let totalSilverGross = new Decimal(0);
    let totalSilverFine = new Decimal(0);
    let totalValueProduced = new Decimal(0);

    for (const s of activeSplits) {
      totalGoldGross = totalGoldGross.plus(s.goldWeight.toString());
      totalGoldFine = totalGoldFine.plus(s.goldFineWeight.toString());
      totalSilverGross = totalSilverGross.plus(s.silverWeight.toString());
      totalSilverFine = totalSilverFine.plus(s.silverFineWeight.toString());
      totalValueProduced = totalValueProduced.plus(s.totalProducedAmount.toString());
    }

    let totalPaidToCustomers = new Decimal(0);
    for (const w of withdrawTxs) {
      totalPaidToCustomers = totalPaidToCustomers.plus(w.amount.toString());
    }

    let totalDepositsReceived = new Decimal(0);
    for (const d of depositTxs) {
      totalDepositsReceived = totalDepositsReceived.plus(d.amount.toString());
    }

    // Also include reversal adjustments accurately in net customer balances
    let totalPayable = new Decimal(0);
    let totalReceivable = new Decimal(0);
    for (const c of customers) {
      const bal = new Decimal(c.currentBalance.toString());
      if (bal.gt(0)) totalPayable = totalPayable.plus(bal);
      else if (bal.lt(0)) totalReceivable = totalReceivable.plus(bal.abs());
    }

    res.json({
      rates: formatRates(rates),
      kpis: {
        activeSplitCount: activeSplits.length,
        customerCount: customers.length,
        totalGoldGross: totalGoldGross.toFixed(3),
        totalGoldFine: totalGoldFine.toFixed(4),
        totalSilverGross: totalSilverGross.toFixed(3),
        totalSilverFine: totalSilverFine.toFixed(4),
        totalValueProduced: totalValueProduced.toFixed(2),
        totalPaidToCustomers: totalPaidToCustomers.toFixed(2),
        totalDepositsReceived: totalDepositsReceived.toFixed(2),
        totalPayable: totalPayable.toFixed(2),
        totalReceivable: totalReceivable.toFixed(2),
        netLiability: totalPayable.minus(totalReceivable).toFixed(2),
      },
      recentSplits: recentSplits.map(formatMetalSplit),
      recentTransactions: recentTransactions.map(formatTransaction),
    });
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
});

// Rates & Business Settings
router.get('/rates', async (_req: Request, res: Response) => {
  try {
    const rates = await ensureDefaultRates();
    res.json({ rates: formatRates(rates) });
  } catch (err) {
    console.error('GET /api/rates error:', err);
    res.status(500).json({ error: 'Failed to load metal rates' });
  }
});

router.put('/rates', async (req: Request, res: Response) => {
  try {
    const parsed = updateRatesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid rate settings', issues: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const goldVal =
      data.goldRatePerGram !== undefined
        ? data.goldRatePerGram !== null
          ? new Decimal(data.goldRatePerGram).toFixed(2)
          : null
        : undefined;
    const silverVal =
      data.silverRatePerGram !== undefined
        ? data.silverRatePerGram !== null
          ? new Decimal(data.silverRatePerGram).toFixed(2)
          : null
        : undefined;

    const updated = await prisma.metalRate.upsert({
      where: { id: 1 },
      update: {
        ...(goldVal !== undefined ? { goldRatePerGram: goldVal } : {}),
        ...(silverVal !== undefined ? { silverRatePerGram: silverVal } : {}),
        ...(data.currencySymbol ? { currencySymbol: data.currencySymbol } : {}),
        ...(data.locale ? { locale: data.locale } : {}),
        ...(data.businessName ? { businessName: data.businessName } : {}),
        ...(data.businessAddress !== undefined ? { businessAddress: data.businessAddress } : {}),
        ...(data.businessPhone !== undefined ? { businessPhone: data.businessPhone } : {}),
      },
      create: {
        id: 1,
        goldRatePerGram: goldVal ?? null,
        silverRatePerGram: silverVal ?? null,
        currencySymbol: data.currencySymbol ?? '₹',
        locale: data.locale ?? 'en-IN',
        businessName: data.businessName ?? 'AurumLedger',
        businessAddress: data.businessAddress ?? '',
        businessPhone: data.businessPhone ?? '',
      },
    });

    res.json({ rates: formatRates(updated) });
  } catch (err) {
    console.error('PUT /api/rates error:', err);
    res.status(500).json({ error: 'Failed to update metal rates' });
  }
});

// Customers List
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const balanceFilter = typeof req.query.balanceFilter === 'string' ? req.query.balanceFilter : 'all';
    const includeArchived = req.query.includeArchived === 'true';
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'name';
    const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '25'), 10) || 25));

    const where: Prisma.CustomerWhereInput = {
      ...(includeArchived ? {} : { isArchived: false }),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              { address: { contains: search } },
            ],
          }
        : {}),
      ...(balanceFilter === 'payable'
        ? { currentBalance: { gt: 0 } }
        : balanceFilter === 'receivable'
          ? { currentBalance: { lt: 0 } }
          : balanceFilter === 'settled'
            ? { currentBalance: 0 }
            : {}),
    };

    const orderBy: Prisma.CustomerOrderByWithRelationInput =
      sortBy === 'currentBalance'
        ? { currentBalance: sortDir }
        : sortBy === 'createdAt'
          ? { createdAt: sortDir }
          : { name: sortDir };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { metalSplits: true, transactions: true },
          },
          metalSplits: {
            where: { status: 'ACTIVE' },
            select: {
              goldFineWeight: true,
              silverFineWeight: true,
              totalProducedAmount: true,
            },
          },
        },
      }),
    ]);

    const items = customers.map((c) => {
      let goldFine = new Decimal(0);
      let silverFine = new Decimal(0);
      let totalProduced = new Decimal(0);
      for (const s of c.metalSplits) {
        goldFine = goldFine.plus(s.goldFineWeight.toString());
        silverFine = silverFine.plus(s.silverFineWeight.toString());
        totalProduced = totalProduced.plus(s.totalProducedAmount.toString());
      }
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        notes: c.notes,
        currentBalance: serializeDecimal(c.currentBalance, 2),
        isArchived: c.isArchived,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        splitCount: c._count.metalSplits,
        transactionCount: c._count.transactions,
        totalGoldFine: goldFine.toFixed(4),
        totalSilverFine: silverFine.toFixed(4),
        totalProducedAmount: totalProduced.toFixed(2),
      };
    });

    res.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    console.error('GET /api/customers error:', err);
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

// Create Customer
router.post('/customers', async (req: Request, res: Response) => {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid customer data', issues: parsed.error.issues });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        notes: parsed.data.notes || null,
      },
    });

    res.status(201).json({ customer: formatCustomer(customer) });
  } catch (err) {
    console.error('POST /api/customers error:', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Customer Detail + Ledger
router.get('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        metalSplits: {
          orderBy: { createdAt: 'desc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          include: {
            metalSplit: {
              select: { id: true, receiptNumber: true, itemsetName: true, status: true },
            },
          },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    let goldGross = new Decimal(0);
    let goldFine = new Decimal(0);
    let silverGross = new Decimal(0);
    let silverFine = new Decimal(0);
    let totalProduced = new Decimal(0);

    for (const s of customer.metalSplits) {
      if (s.status !== 'ACTIVE') continue;
      goldGross = goldGross.plus(s.goldWeight.toString());
      goldFine = goldFine.plus(s.goldFineWeight.toString());
      silverGross = silverGross.plus(s.silverWeight.toString());
      silverFine = silverFine.plus(s.silverFineWeight.toString());
      totalProduced = totalProduced.plus(s.totalProducedAmount.toString());
    }

    let totalWithdrawn = new Decimal(0);
    let totalDeposited = new Decimal(0);
    for (const t of customer.transactions) {
      if (t.isReversal) continue;
      if (t.type === 'WITHDRAW') totalWithdrawn = totalWithdrawn.plus(t.amount.toString());
      if (t.type === 'DEPOSIT') totalDeposited = totalDeposited.plus(t.amount.toString());
    }

    res.json({
      customer: formatCustomer(customer),
      summary: {
        activeSplitCount: customer.metalSplits.filter((s) => s.status === 'ACTIVE').length,
        goldGross: goldGross.toFixed(3),
        goldFine: goldFine.toFixed(4),
        silverGross: silverGross.toFixed(3),
        silverFine: silverFine.toFixed(4),
        totalProduced: totalProduced.toFixed(2),
        totalWithdrawn: totalWithdrawn.toFixed(2),
        totalDeposited: totalDeposited.toFixed(2),
      },
      metalSplits: customer.metalSplits.map(formatMetalSplit),
      transactions: customer.transactions.map(formatTransaction),
    });
  } catch (err) {
    console.error('GET /api/customers/:id error:', err);
    res.status(500).json({ error: 'Failed to load customer ledger' });
  }
});

// Update Customer (soft archive supported, never hard-delete)
router.patch('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid customer update', issues: parsed.error.issues });
      return;
    }

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
        ...(parsed.data.address !== undefined ? { address: parsed.data.address || null } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
        ...(parsed.data.isArchived !== undefined ? { isArchived: parsed.data.isArchived } : {}),
      },
    });

    res.json({ customer: formatCustomer(updated) });
  } catch (err) {
    console.error('PATCH /api/customers/:id error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Metal Splits List
router.get('/splits', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(500, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));

    const dateFilter = parseDateRange(dateFrom, dateTo);

    const where: Prisma.MetalSplitWhereInput = {
      ...(customerId ? { customerId } : {}),
      ...(status === 'ACTIVE' || status === 'REVERSED' ? { status } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      ...(search
        ? {
            OR: [
              { receiptNumber: { contains: search } },
              { itemsetName: { contains: search } },
              { notes: { contains: search } },
              { customer: { name: { contains: search } } },
            ],
          }
        : {}),
    };

    const allowedSortFields = new Set([
      'createdAt',
      'receiptNumber',
      'goldFineWeight',
      'silverFineWeight',
      'totalProducedAmount',
      'amountGivenToCustomer',
    ]);
    const orderBy: Prisma.MetalSplitOrderByWithRelationInput = allowedSortFields.has(sortBy)
      ? { [sortBy]: sortDir }
      : { createdAt: 'desc' };

    const [total, items] = await Promise.all([
      prisma.metalSplit.count({ where }),
      prisma.metalSplit.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, currentBalance: true },
          },
        },
      }),
    ]);

    res.json({
      items: items.map(formatMetalSplit),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    console.error('GET /api/splits error:', err);
    res.status(500).json({ error: 'Failed to load metal split records' });
  }
});

// Single Metal Split Detail
router.get('/splits/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const split = await prisma.metalSplit.findUnique({
      where: { id },
      include: {
        customer: true,
        transactions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!split) {
      res.status(404).json({ error: 'Metal split record not found' });
      return;
    }
    res.json({
      split: formatMetalSplit(split),
      transactions: split.transactions.map(formatTransaction),
    });
  } catch (err) {
    console.error('GET /api/splits/:id error:', err);
    res.status(500).json({ error: 'Failed to load metal split detail' });
  }
});

// Create Metal Split (atomic $transaction)
router.post('/splits', async (req: Request, res: Response) => {
  try {
    const parsed = createMetalSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid metal split payload',
        issues: parsed.error.issues,
      });
      return;
    }

    const d = parsed.data;
    const calc = calculateSplitMetrics({
      goldWeight: d.goldWeight,
      goldPurity: d.goldPurity,
      goldRatePerGram: d.goldRatePerGram,
      goldAmountOverridden: d.goldAmountOverridden,
      goldAmountOverride: d.goldAmountOverride,
      silverWeight: d.silverWeight,
      silverPurity: d.silverPurity,
      silverRatePerGram: d.silverRatePerGram,
      silverAmountOverridden: d.silverAmountOverridden,
      silverAmountOverride: d.silverAmountOverride,
      amountGivenToCustomer: d.amountGivenToCustomer,
    });

    const totalProduced = new Decimal(calc.totalProducedAmount);
    const amountGiven = new Decimal(calc.amountGivenToCustomer);
    const remainingAdded = new Decimal(calc.remainingBalanceAdded);

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: d.customerId },
      });
      if (!customer || customer.isArchived) {
        throw new Error('CUSTOMER_NOT_FOUND');
      }

      const receiptNumber = await getNextSequence(tx, 'METAL_SPLIT', 'MS');

      const split = await tx.metalSplit.create({
        data: {
          receiptNumber,
          customerId: customer.id,
          itemsetName: d.itemsetName,
          grossProductWeight: d.grossProductWeight ? new Decimal(d.grossProductWeight).toFixed(3) : null,
          goldWeight: new Decimal(d.goldWeight).toFixed(3),
          goldPurity: new Decimal(d.goldPurity).toFixed(2),
          goldFineWeight: calc.goldFineWeight,
          goldRatePerGram: new Decimal(d.goldRatePerGram).toFixed(2),
          goldAmount: calc.goldAmount,
          goldAmountOverridden: d.goldAmountOverridden,
          silverWeight: new Decimal(d.silverWeight).toFixed(3),
          silverPurity: new Decimal(d.silverPurity).toFixed(2),
          silverFineWeight: calc.silverFineWeight,
          silverRatePerGram: new Decimal(d.silverRatePerGram).toFixed(2),
          silverAmount: calc.silverAmount,
          silverAmountOverridden: d.silverAmountOverridden,
          totalProducedAmount: calc.totalProducedAmount,
          amountGivenToCustomer: calc.amountGivenToCustomer,
          remainingBalanceAdded: calc.remainingBalanceAdded,
          notes: d.notes || null,
        },
      });

      const balanceBeforeCredit = new Decimal(customer.currentBalance.toString());
      let runningBalance = balanceBeforeCredit;

      if (totalProduced.gt(0)) {
        const creditVoucher = await getNextSequence(tx, 'MONEY_TRANSACTION', 'TX');
        const balanceAfterCredit = runningBalance.plus(totalProduced).toDecimalPlaces(2);
        await tx.moneyTransaction.create({
          data: {
            voucherNumber: creditVoucher,
            customerId: customer.id,
            metalSplitId: split.id,
            type: TransactionType.METAL_CREDIT,
            amount: totalProduced.toFixed(2),
            balanceBefore: runningBalance.toFixed(2),
            balanceAfter: balanceAfterCredit.toFixed(2),
            paymentMode: PaymentMode.OTHER,
            description: `Refining credit for ${receiptNumber} (${d.itemsetName})`,
          },
        });
        runningBalance = balanceAfterCredit;
      }

      if (amountGiven.gt(0)) {
        const payoutVoucher = await getNextSequence(tx, 'MONEY_TRANSACTION', 'TX');
        const balanceAfterPayout = runningBalance.minus(amountGiven).toDecimalPlaces(2);
        await tx.moneyTransaction.create({
          data: {
            voucherNumber: payoutVoucher,
            customerId: customer.id,
            metalSplitId: split.id,
            type: TransactionType.WITHDRAW,
            amount: amountGiven.toFixed(2),
            balanceBefore: runningBalance.toFixed(2),
            balanceAfter: balanceAfterPayout.toFixed(2),
            paymentMode: d.paymentMode as PaymentMode,
            description: `Immediate payout on ${receiptNumber}`,
            createdAt: new Date(Date.now() + 10),
          },
        });
        runningBalance = balanceAfterPayout;
      }

      const expectedNewBalance = balanceBeforeCredit.plus(remainingAdded).toDecimalPlaces(2);
      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: { currentBalance: expectedNewBalance.toFixed(2) },
      });

      const fullSplit = await tx.metalSplit.findUniqueOrThrow({
        where: { id: split.id },
        include: {
          customer: true,
          transactions: { orderBy: { createdAt: 'asc' } },
        },
      });

      return { split: fullSplit, customer: updatedCustomer };
    });

    res.status(201).json({
      split: formatMetalSplit(result.split),
      transactions: result.split.transactions.map(formatTransaction),
      customer: formatCustomer(result.customer),
    });
  } catch (err: any) {
    if (err?.message === 'CUSTOMER_NOT_FOUND') {
      res.status(404).json({ error: 'Selected customer was not found or is archived' });
      return;
    }
    console.error('POST /api/splits error:', err);
    res.status(500).json({ error: 'Failed to save metal split entry' });
  }
});

// Non-destructive reversal of MetalSplit (audit trail preserved)
router.post('/splits/:id/reverse', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const parsed = reverseRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Audit reason is required' });
      return;
    }

    const reason = parsed.data.reason;

    const result = await prisma.$transaction(async (tx) => {
      const split = await tx.metalSplit.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (!split) throw new Error('SPLIT_NOT_FOUND');
      if (split.status === 'REVERSED') throw new Error('ALREADY_REVERSED');

      let runningBalance = new Decimal(split.customer.currentBalance.toString());
      const totalProduced = new Decimal(split.totalProducedAmount.toString());
      const amountGiven = new Decimal(split.amountGivenToCustomer.toString());

      // Reverse the METAL_CREDIT with a compensating WITHDRAW reversal entry
      if (totalProduced.gt(0)) {
        const v1 = await getNextSequence(tx, 'MONEY_TRANSACTION', 'TX');
        const after1 = runningBalance.minus(totalProduced).toDecimalPlaces(2);
        await tx.moneyTransaction.create({
          data: {
            voucherNumber: v1,
            customerId: split.customerId,
            metalSplitId: split.id,
            type: TransactionType.WITHDRAW,
            amount: totalProduced.toFixed(2),
            balanceBefore: runningBalance.toFixed(2),
            balanceAfter: after1.toFixed(2),
            paymentMode: PaymentMode.OTHER,
            description: `Reversal of metal credit ${split.receiptNumber}: ${reason}`,
            isReversal: true,
          },
        });
        runningBalance = after1;
      }

      // Reverse any immediate payout with a compensating DEPOSIT reversal entry
      if (amountGiven.gt(0)) {
        const v2 = await getNextSequence(tx, 'MONEY_TRANSACTION', 'TX');
        const after2 = runningBalance.plus(amountGiven).toDecimalPlaces(2);
        await tx.moneyTransaction.create({
          data: {
            voucherNumber: v2,
            customerId: split.customerId,
            metalSplitId: split.id,
            type: TransactionType.DEPOSIT,
            amount: amountGiven.toFixed(2),
            balanceBefore: runningBalance.toFixed(2),
            balanceAfter: after2.toFixed(2),
            paymentMode: PaymentMode.OTHER,
            description: `Reversal of immediate payout ${split.receiptNumber}: ${reason}`,
            isReversal: true,
            createdAt: new Date(Date.now() + 10),
          },
        });
        runningBalance = after2;
      }

      const updatedSplit = await tx.metalSplit.update({
        where: { id: split.id },
        data: {
          status: 'REVERSED',
          reversalReason: reason,
          reversedAt: new Date(),
        },
        include: { customer: true },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id: split.customerId },
        data: { currentBalance: runningBalance.toFixed(2) },
      });

      return { split: updatedSplit, customer: updatedCustomer };
    });

    res.json({
      split: formatMetalSplit(result.split),
      customer: formatCustomer(result.customer),
    });
  } catch (err: any) {
    if (err?.message === 'SPLIT_NOT_FOUND') {
      res.status(404).json({ error: 'Metal split record not found' });
      return;
    }
    if (err?.message === 'ALREADY_REVERSED') {
      res.status(409).json({ error: 'This metal split record has already been reversed' });
      return;
    }
    console.error('POST /api/splits/:id/reverse error:', err);
    res.status(500).json({ error: 'Failed to reverse metal split record' });
  }
});

// Money Transactions Ledger
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : 'ALL';
    const paymentMode = typeof req.query.paymentMode === 'string' ? req.query.paymentMode : 'ALL';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(500, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '25'), 10) || 25));

    const dateFilter = parseDateRange(dateFrom, dateTo);

    const where: Prisma.MoneyTransactionWhereInput = {
      ...(customerId ? { customerId } : {}),
      ...(type === 'DEPOSIT' || type === 'WITHDRAW' || type === 'METAL_CREDIT' ? { type } : {}),
      ...(paymentMode === 'CASH' || paymentMode === 'UPI' || paymentMode === 'BANK_TRANSFER' || paymentMode === 'OTHER'
        ? { paymentMode }
        : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      ...(search
        ? {
            OR: [
              { voucherNumber: { contains: search } },
              { description: { contains: search } },
              { customer: { name: { contains: search } } },
              { metalSplit: { itemsetName: { contains: search } } },
              { metalSplit: { receiptNumber: { contains: search } } },
            ],
          }
        : {}),
    };

    const allowedSortFields = new Set(['createdAt', 'voucherNumber', 'amount', 'balanceAfter', 'type']);
    const orderBy: Prisma.MoneyTransactionOrderByWithRelationInput = allowedSortFields.has(sortBy)
      ? { [sortBy]: sortDir }
      : { createdAt: 'desc' };

    const [total, items] = await Promise.all([
      prisma.moneyTransaction.count({ where }),
      prisma.moneyTransaction.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, currentBalance: true },
          },
          metalSplit: {
            select: { id: true, receiptNumber: true, itemsetName: true, status: true },
          },
        },
      }),
    ]);

    res.json({
      items: items.map(formatTransaction),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    console.error('GET /api/transactions error:', err);
    res.status(500).json({ error: 'Failed to load money transactions' });
  }
});

// Record Standalone Deposit or Withdraw (atomic $transaction)
router.post('/transactions', async (req: Request, res: Response) => {
  try {
    const parsed = createMoneyTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid transaction payload',
        issues: parsed.error.issues,
      });
      return;
    }

    const d = parsed.data;
    const amount = new Decimal(d.amount).toDecimalPlaces(2);

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: d.customerId } });
      if (!customer || customer.isArchived) {
        throw new Error('CUSTOMER_NOT_FOUND');
      }

      if (d.metalSplitId) {
        const split = await tx.metalSplit.findUnique({ where: { id: d.metalSplitId } });
        if (!split || split.customerId !== customer.id) {
          throw new Error('SPLIT_NOT_FOUND');
        }
      }

      const balanceBefore = new Decimal(customer.currentBalance.toString());
      const balanceAfter =
        d.type === 'DEPOSIT'
          ? balanceBefore.plus(amount).toDecimalPlaces(2)
          : balanceBefore.minus(amount).toDecimalPlaces(2);

      const voucherNumber = await getNextSequence(tx, 'MONEY_TRANSACTION', 'TX');

      const transaction = await tx.moneyTransaction.create({
        data: {
          voucherNumber,
          customerId: customer.id,
          metalSplitId: d.metalSplitId || null,
          type: d.type,
          amount: amount.toFixed(2),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceAfter.toFixed(2),
          paymentMode: d.paymentMode as PaymentMode,
          description:
            d.description ||
            (d.type === 'DEPOSIT' ? 'Payment received / deposited from customer' : 'Payout given to customer'),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, currentBalance: true } },
          metalSplit: { select: { id: true, receiptNumber: true, itemsetName: true, status: true } },
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: { currentBalance: balanceAfter.toFixed(2) },
      });

      return { transaction, customer: updatedCustomer };
    });

    res.status(201).json({
      transaction: formatTransaction(result.transaction),
      customer: formatCustomer(result.customer),
    });
  } catch (err: any) {
    if (err?.message === 'CUSTOMER_NOT_FOUND') {
      res.status(404).json({ error: 'Selected customer was not found or is archived' });
      return;
    }
    if (err?.message === 'SPLIT_NOT_FOUND') {
      res.status(404).json({ error: 'Linked metal split record not found for this customer' });
      return;
    }
    console.error('POST /api/transactions error:', err);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

// Non-destructive reversal of standalone DEPOSIT or WITHDRAW transaction
router.post('/transactions/:id/reverse', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const parsed = reverseRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Audit reason is required' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const original = await tx.moneyTransaction.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (!original) throw new Error('TX_NOT_FOUND');
      if (original.isReversal) throw new Error('CANNOT_REVERSE_REVERSAL');
      if (original.type === 'METAL_CREDIT') throw new Error('REVERSE_SPLIT_INSTEAD');

      const alreadyReversed = await tx.moneyTransaction.findFirst({
        where: { reversesTransactionId: original.id },
      });
      if (alreadyReversed) throw new Error('ALREADY_REVERSED');

      const balanceBefore = new Decimal(original.customer.currentBalance.toString());
      const amt = new Decimal(original.amount.toString());
      // Reversing a DEPOSIT subtracts via WITHDRAW; reversing a WITHDRAW adds back via DEPOSIT
      const counterType = original.type === 'DEPOSIT' ? TransactionType.WITHDRAW : TransactionType.DEPOSIT;
      const balanceAfter =
        counterType === TransactionType.DEPOSIT
          ? balanceBefore.plus(amt).toDecimalPlaces(2)
          : balanceBefore.minus(amt).toDecimalPlaces(2);

      const voucherNumber = await getNextSequence(tx, 'MONEY_TRANSACTION', 'TX');

      const reversalTx = await tx.moneyTransaction.create({
        data: {
          voucherNumber,
          customerId: original.customerId,
          metalSplitId: original.metalSplitId,
          type: counterType,
          amount: amt.toFixed(2),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceAfter.toFixed(2),
          paymentMode: original.paymentMode,
          description: `Reversal of ${original.voucherNumber}: ${parsed.data.reason}`,
          isReversal: true,
          reversesTransactionId: original.id,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, currentBalance: true } },
          metalSplit: { select: { id: true, receiptNumber: true, itemsetName: true, status: true } },
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id: original.customerId },
        data: { currentBalance: balanceAfter.toFixed(2) },
      });

      return { transaction: reversalTx, customer: updatedCustomer };
    });

    res.status(201).json({
      transaction: formatTransaction(result.transaction),
      customer: formatCustomer(result.customer),
    });
  } catch (err: any) {
    if (err?.message === 'TX_NOT_FOUND') {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    if (err?.message === 'CANNOT_REVERSE_REVERSAL') {
      res.status(400).json({ error: 'Reversal audit entries cannot be reversed again' });
      return;
    }
    if (err?.message === 'REVERSE_SPLIT_INSTEAD') {
      res.status(400).json({ error: 'Metal credit entries must be reversed from the Metal Split record' });
      return;
    }
    if (err?.message === 'ALREADY_REVERSED') {
      res.status(409).json({ error: 'This transaction has already been reversed' });
      return;
    }
    console.error('POST /api/transactions/:id/reverse error:', err);
    res.status(500).json({ error: 'Failed to reverse transaction' });
  }
});

// Delete single Metal Split (and its linked ledger entries, recalculating customer balances)
router.delete('/splits/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.$transaction(async (tx) => {
      const split = await tx.metalSplit.findUnique({ where: { id } });
      if (!split) throw new Error('SPLIT_NOT_FOUND');

      await tx.moneyTransaction.deleteMany({ where: { metalSplitId: id } });
      await tx.metalSplit.delete({ where: { id } });
      await recalculateCustomerLedger(tx, split.customerId);
    });
    res.json({ deleted: true });
  } catch (err: any) {
    if (err?.message === 'SPLIT_NOT_FOUND') {
      res.status(404).json({ error: 'Metal split record not found' });
      return;
    }
    console.error('DELETE /api/splits/:id error:', err);
    res.status(500).json({ error: 'Failed to delete metal split record' });
  }
});

// Delete all Metal Splits (and linked ledger entries, recalculating all customer balances)
router.delete('/splits', async (_req: Request, res: Response) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.moneyTransaction.deleteMany({ where: { metalSplitId: { not: null } } });
      await tx.metalSplit.deleteMany({});
      const customers = await tx.customer.findMany({ select: { id: true } });
      for (const c of customers) {
        await recalculateCustomerLedger(tx, c.id);
      }
      await tx.sequenceCounter.upsert({
        where: { key: 'METAL_SPLIT' },
        update: { nextValue: 1 },
        create: { key: 'METAL_SPLIT', nextValue: 1 },
      });
    });
    res.json({ deletedAll: true });
  } catch (err) {
    console.error('DELETE /api/splits error:', err);
    res.status(500).json({ error: 'Failed to delete all metal split records' });
  }
});

// Delete single Money Transaction (recalculating customer running balances)
router.delete('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.moneyTransaction.findUnique({ where: { id } });
      if (!existing) throw new Error('TX_NOT_FOUND');

      await tx.moneyTransaction.updateMany({
        where: { reversesTransactionId: id },
        data: { reversesTransactionId: null },
      });
      await tx.moneyTransaction.delete({ where: { id } });
      await recalculateCustomerLedger(tx, existing.customerId);
    });
    res.json({ deleted: true });
  } catch (err: any) {
    if (err?.message === 'TX_NOT_FOUND') {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    console.error('DELETE /api/transactions/:id error:', err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// Delete all Money Transactions (resetting all customer balances to 0)
router.delete('/transactions', async (_req: Request, res: Response) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.moneyTransaction.deleteMany({});
      await tx.customer.updateMany({ data: { currentBalance: '0.00' } });
      await tx.sequenceCounter.upsert({
        where: { key: 'MONEY_TRANSACTION' },
        update: { nextValue: 1 },
        create: { key: 'MONEY_TRANSACTION', nextValue: 1 },
      });
    });
    res.json({ deletedAll: true });
  } catch (err) {
    console.error('DELETE /api/transactions error:', err);
    res.status(500).json({ error: 'Failed to delete all transactions' });
  }
});

// Delete single Customer and all their associated splits and transactions
router.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new Error('CUSTOMER_NOT_FOUND');

      await tx.moneyTransaction.deleteMany({ where: { customerId: id } });
      await tx.metalSplit.deleteMany({ where: { customerId: id } });
      await tx.customer.delete({ where: { id } });
    });
    res.json({ deleted: true });
  } catch (err: any) {
    if (err?.message === 'CUSTOMER_NOT_FOUND') {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    console.error('DELETE /api/customers/:id error:', err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Delete all Customers and all associated records
router.delete('/customers', async (_req: Request, res: Response) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.moneyTransaction.deleteMany({});
      await tx.metalSplit.deleteMany({});
      await tx.customer.deleteMany({});
      await tx.sequenceCounter.upsert({
        where: { key: 'METAL_SPLIT' },
        update: { nextValue: 1 },
        create: { key: 'METAL_SPLIT', nextValue: 1 },
      });
      await tx.sequenceCounter.upsert({
        where: { key: 'MONEY_TRANSACTION' },
        update: { nextValue: 1 },
        create: { key: 'MONEY_TRANSACTION', nextValue: 1 },
      });
    });
    res.json({ deletedAll: true });
  } catch (err) {
    console.error('DELETE /api/customers error:', err);
    res.status(500).json({ error: 'Failed to delete all customers' });
  }
});

// Delete ALL ledger records (transactions, metal splits, customers; keeps user rate settings)
router.delete('/records/all', async (_req: Request, res: Response) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.moneyTransaction.deleteMany({});
      await tx.metalSplit.deleteMany({});
      await tx.customer.deleteMany({});
      await tx.sequenceCounter.upsert({
        where: { key: 'METAL_SPLIT' },
        update: { nextValue: 1 },
        create: { key: 'METAL_SPLIT', nextValue: 1 },
      });
      await tx.sequenceCounter.upsert({
        where: { key: 'MONEY_TRANSACTION' },
        update: { nextValue: 1 },
        create: { key: 'MONEY_TRANSACTION', nextValue: 1 },
      });
    });
    res.json({ deletedAll: true });
  } catch (err) {
    console.error('DELETE /api/records/all error:', err);
    res.status(500).json({ error: 'Failed to delete all records' });
  }
});

export default router;
