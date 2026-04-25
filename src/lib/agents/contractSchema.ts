import { z } from 'zod';

const citationSchema = z.object({
  sourceType: z.enum(['contract', 'invoice', 'usage', 'calculation']),
  sourceId: z.string().min(1),
  label: z.string().min(1),
  excerpt: z.string().optional()
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
  'payment_terms',
  'special_billing_note'
]);

export const extractedContractTermSchema = z.object({
  term_type: contractTermTypeSchema,
  value: z.unknown(),
  normalized_value: z.unknown(),
  currency: z.string().optional(),
  period: z.string().optional(),
  citation: citationSchema,
  source_excerpt: z.string().min(1).max(700),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  reasoning_summary: z.string().min(1).max(700)
});

export const contractExtractionSchema = z.object({
  terms: z.array(extractedContractTermSchema)
});

export type ContractExtraction = z.infer<typeof contractExtractionSchema>;
