import Decimal from 'decimal.js';
import { z } from 'zod';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const decimalInputSchema = (options?: {
  min?: number;
  max?: number;
  allowZero?: boolean;
  label?: string;
}) =>
  z.union([z.number(), z.string()]).transform((val, ctx) => {
    const str = typeof val === 'number' ? String(val) : val.trim();
    if (!str) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${options?.label ?? 'Value'} is required`,
      });
      return z.NEVER;
    }
    try {
      const dec = new Decimal(str);
      if (!dec.isFinite()) {
        throw new Error('Not finite');
      }
      if (options?.min !== undefined && dec.lt(options.min)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options?.label ?? 'Value'} must be at least ${options.min}`,
        });
        return z.NEVER;
      }
      if (options?.allowZero === false && dec.lte(0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options?.label ?? 'Value'} must be greater than 0`,
        });
        return z.NEVER;
      }
      if (options?.max !== undefined && dec.gt(options.max)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options?.label ?? 'Value'} cannot exceed ${options.max}`,
        });
        return z.NEVER;
      }
      return dec.toString();
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${options?.label ?? 'Value'} must be a valid decimal number`,
      });
      return z.NEVER;
    }
  });

const optionalDecimalInputSchema = (options?: {
  min?: number;
  max?: number;
  label?: string;
}) =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val, ctx) => {
      if (val === null || val === undefined) return null;
      const str = typeof val === 'number' ? String(val) : val.trim();
      if (!str) return null;
      try {
        const dec = new Decimal(str);
        if (!dec.isFinite()) throw new Error('Not finite');
        if (options?.min !== undefined && dec.lt(options.min)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${options?.label ?? 'Value'} must be at least ${options.min}`,
          });
          return z.NEVER;
        }
        if (options?.max !== undefined && dec.gt(options.max)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${options?.label ?? 'Value'} cannot exceed ${options.max}`,
          });
          return z.NEVER;
        }
        return dec.toString();
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options?.label ?? 'Value'} must be a valid decimal number`,
        });
        return z.NEVER;
      }
    });

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(120).optional(),
  isArchived: z.boolean().optional(),
});

export const createMetalSplitSchema = z
  .object({
    customerId: z.string().trim().min(1, 'Customer is required'),
    itemsetName: z.string().trim().min(2, 'Itemset / product name is required').max(180),
    grossProductWeight: optionalDecimalInputSchema({ min: 0, label: 'Gross product weight' }),

    goldWeight: decimalInputSchema({ min: 0, label: 'Gold weight' }),
    goldPurity: decimalInputSchema({ min: 0, max: 100, label: 'Gold purity' }),
    goldRatePerGram: decimalInputSchema({ min: 0, label: 'Gold rate per gram' }),
    goldAmountOverride: optionalDecimalInputSchema({ min: 0, label: 'Gold amount override' }),
    goldAmountOverridden: z.boolean().optional().default(false),

    silverWeight: decimalInputSchema({ min: 0, label: 'Silver weight' }),
    silverPurity: decimalInputSchema({ min: 0, max: 100, label: 'Silver purity' }),
    silverRatePerGram: decimalInputSchema({ min: 0, label: 'Silver rate per gram' }),
    silverAmountOverride: optionalDecimalInputSchema({ min: 0, label: 'Silver amount override' }),
    silverAmountOverridden: z.boolean().optional().default(false),

    amountGivenToCustomer: decimalInputSchema({ min: 0, label: 'Immediate payout' }).optional().default('0'),
    paymentMode: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']).optional().default('CASH'),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const gw = new Decimal(data.goldWeight);
    const sw = new Decimal(data.silverWeight);
    const gr = new Decimal(data.goldRatePerGram);
    const sr = new Decimal(data.silverRatePerGram);
    if (gw.lte(0) && sw.lte(0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a weight greater than 0 for Gold or Silver.',
        path: ['goldWeight'],
      });
    }
    if (gw.gt(0) && gr.lte(0) && !data.goldAmountOverridden) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a Gold rate per gram greater than 0.',
        path: ['goldRatePerGram'],
      });
    }
    if (sw.gt(0) && sr.lte(0) && !data.silverAmountOverridden) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a Silver rate per gram greater than 0.',
        path: ['silverRatePerGram'],
      });
    }
  });

export const createMoneyTransactionSchema = z.object({
  customerId: z.string().trim().min(1, 'Customer is required'),
  type: z.enum(['DEPOSIT', 'WITHDRAW']),
  amount: decimalInputSchema({ min: 0.01, allowZero: false, label: 'Amount' }),
  paymentMode: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']).default('CASH'),
  description: z.string().trim().max(400).optional().nullable(),
  metalSplitId: z.string().trim().optional().nullable(),
});

export const reverseRecordSchema = z.object({
  reason: z.string().trim().min(3, 'A clear audit reason is required (min 3 characters)').max(300),
});

export const updateRatesSchema = z.object({
  goldRatePerGram: optionalDecimalInputSchema({ min: 0.01, label: 'Gold rate per gram' }),
  silverRatePerGram: optionalDecimalInputSchema({ min: 0.01, label: 'Silver rate per gram' }),
  currencySymbol: z.string().trim().min(1).max(6).optional(),
  locale: z.enum(['en-IN', 'en-US', 'en-GB', 'en-AE']).optional(),
  businessName: z.string().trim().min(2).max(120).optional(),
  businessAddress: z.string().trim().max(240).optional(),
  businessPhone: z.string().trim().max(40).optional(),
});

export function calculateSplitMetrics(input: {
  goldWeight: string | number;
  goldPurity: string | number;
  goldRatePerGram: string | number;
  goldAmountOverridden?: boolean;
  goldAmountOverride?: string | number | null;
  silverWeight: string | number;
  silverPurity: string | number;
  silverRatePerGram: string | number;
  silverAmountOverridden?: boolean;
  silverAmountOverride?: string | number | null;
  amountGivenToCustomer?: string | number | null;
}) {
  const safeDec = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === '') return new Decimal(0);
    try {
      const d = new Decimal(v);
      return d.isFinite() ? d : new Decimal(0);
    } catch {
      return new Decimal(0);
    }
  };

  const gw = safeDec(input.goldWeight);
  const gp = safeDec(input.goldPurity);
  const gr = safeDec(input.goldRatePerGram);
  const goldFineWeight = gw.mul(gp).div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const calculatedGoldAmount = goldFineWeight.mul(gr).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const goldAmount =
    input.goldAmountOverridden && input.goldAmountOverride !== null && input.goldAmountOverride !== undefined && input.goldAmountOverride !== ''
      ? safeDec(input.goldAmountOverride).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : calculatedGoldAmount;

  const sw = safeDec(input.silverWeight);
  const sp = safeDec(input.silverPurity);
  const sr = safeDec(input.silverRatePerGram);
  const silverFineWeight = sw.mul(sp).div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const calculatedSilverAmount = silverFineWeight.mul(sr).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const silverAmount =
    input.silverAmountOverridden && input.silverAmountOverride !== null && input.silverAmountOverride !== undefined && input.silverAmountOverride !== ''
      ? safeDec(input.silverAmountOverride).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : calculatedSilverAmount;

  const totalProducedAmount = goldAmount.plus(silverAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const amountGivenToCustomer = safeDec(input.amountGivenToCustomer).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const remainingBalanceAdded = totalProducedAmount
    .minus(amountGivenToCustomer)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    goldFineWeight: goldFineWeight.toFixed(4),
    calculatedGoldAmount: calculatedGoldAmount.toFixed(2),
    goldAmount: goldAmount.toFixed(2),
    silverFineWeight: silverFineWeight.toFixed(4),
    calculatedSilverAmount: calculatedSilverAmount.toFixed(2),
    silverAmount: silverAmount.toFixed(2),
    totalProducedAmount: totalProducedAmount.toFixed(2),
    amountGivenToCustomer: amountGivenToCustomer.toFixed(2),
    remainingBalanceAdded: remainingBalanceAdded.toFixed(2),
  };
}
