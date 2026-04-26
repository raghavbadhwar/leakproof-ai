import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO date format YYYY-MM-DD.');

const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter ISO currency code.');

const billingPeriodSchema = z.enum(['monthly', 'quarterly', 'annual', 'one_time']);

const durationUnitSchema = z.enum(['days', 'months', 'years']);

const unresolvedValueSchema = z
  .object({
    kind: z.literal('unresolved'),
    rawText: z.string().min(1).max(700),
    reason: z.string().min(1).max(300)
  })
  .strict();

const textValueSchema = z
  .object({
    text: z.string().min(1).max(700)
  })
  .strict();

const moneyValueSchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: currencySchema,
    period: billingPeriodSchema.optional()
  })
  .strict();

const usageValueSchema = z
  .object({
    metricName: z.string().min(1).max(80),
    quantity: z.number().nonnegative(),
    period: billingPeriodSchema.optional()
  })
  .strict();

const overageValueSchema = moneyValueSchema
  .extend({
    metricName: z.string().min(1).max(80)
  })
  .strict();

const quantityValueSchema = z
  .object({
    quantity: z.number().nonnegative()
  })
  .strict();

const percentValueSchema = z
  .object({
    percent: z.number().min(0).max(100)
  })
  .strict();

const dateValueSchema = z
  .object({
    date: isoDateSchema
  })
  .strict();

const durationValueSchema = z
  .object({
    quantity: z.number().int().positive(),
    unit: durationUnitSchema
  })
  .strict();

const paymentTermsValueSchema = z
  .object({
    dueDays: z.number().int().nonnegative()
  })
  .strict();

const billingFrequencyValueSchema = z
  .object({
    frequency: billingPeriodSchema
  })
  .strict();

const amendmentValueSchema = z
  .object({
    text: z.string().min(1).max(700),
    effectiveDate: isoDateSchema.optional(),
    supersedes: z.string().min(1).max(160).optional()
  })
  .strict();

const conflictValueSchema = z
  .object({
    text: z.string().min(1).max(700),
    conflictsWith: z.array(z.string().min(1).max(160)).min(1).max(10)
  })
  .strict();

const reviewable = <Schema extends z.ZodTypeAny>(schema: Schema) => z.union([schema, unresolvedValueSchema]);

export const citationSchema = z.object({
  sourceType: z.enum(['contract', 'invoice', 'usage', 'calculation']),
  sourceId: z.string().min(1),
  label: z.string().min(1),
  excerpt: z.string().min(1).max(700)
});

export const contractTermTypeSchema = z.enum([
  'customer_name',
  'supplier_name',
  'contract_start_date',
  'contract_end_date',
  'renewal_term',
  'notice_period',
  'base_fee',
  'billing_frequency',
  'committed_seats',
  'seat_price',
  'usage_allowance',
  'overage_price',
  'minimum_commitment',
  'discount',
  'discount_expiry',
  'annual_uplift',
  'amendment',
  'conflict',
  'payment_terms',
  'special_billing_note'
]);

const extractedTermBaseSchema = z.object({
  value: z.unknown(),
  currency: z.string().optional(),
  period: z.string().optional(),
  citation: citationSchema,
  source_excerpt: z.string().min(1).max(700),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  reasoning_summary: z.string().min(1).max(700)
});

function termSchema<TermType extends z.infer<typeof contractTermTypeSchema>, ValueSchema extends z.ZodTypeAny>(
  termType: TermType,
  normalizedValueSchema: ValueSchema
) {
  return extractedTermBaseSchema.extend({
    term_type: z.literal(termType),
    normalized_value: normalizedValueSchema
  });
}

const extractedContractTermUnionSchema = z.discriminatedUnion('term_type', [
  termSchema('customer_name', reviewable(textValueSchema)),
  termSchema('supplier_name', reviewable(textValueSchema)),
  termSchema('contract_start_date', reviewable(dateValueSchema)),
  termSchema('contract_end_date', reviewable(dateValueSchema)),
  termSchema('renewal_term', reviewable(durationValueSchema)),
  termSchema('notice_period', reviewable(durationValueSchema)),
  termSchema('base_fee', reviewable(moneyValueSchema)),
  termSchema('billing_frequency', reviewable(billingFrequencyValueSchema)),
  termSchema('committed_seats', reviewable(quantityValueSchema)),
  termSchema('seat_price', reviewable(moneyValueSchema)),
  termSchema('usage_allowance', reviewable(usageValueSchema)),
  termSchema('overage_price', reviewable(overageValueSchema)),
  termSchema('minimum_commitment', reviewable(moneyValueSchema)),
  termSchema('discount', reviewable(percentValueSchema)),
  termSchema('discount_expiry', reviewable(dateValueSchema)),
  termSchema('annual_uplift', reviewable(percentValueSchema)),
  termSchema('amendment', reviewable(amendmentValueSchema)),
  termSchema('conflict', reviewable(conflictValueSchema)),
  termSchema('payment_terms', reviewable(paymentTermsValueSchema)),
  termSchema('special_billing_note', reviewable(textValueSchema))
]);

export const extractedContractTermSchema = extractedContractTermUnionSchema.superRefine((term, ctx) => {
  if (
    isRecord(term.normalized_value) &&
    'kind' in term.normalized_value &&
    term.normalized_value.kind === 'unresolved' &&
    !term.needs_review
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['needs_review'],
      message: 'Unresolved normalized values must be marked needs_review.'
    });
  }
});

export const contractExtractionSchema = z.object({
  terms: z.array(extractedContractTermSchema)
});

export type ContractExtraction = z.infer<typeof contractExtractionSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
