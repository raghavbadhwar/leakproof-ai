import { z } from 'zod';

export const ROOT_CAUSE_PROMPT_VERSION = 'root-cause-classifier-v1';

export const rootCauseCategoryValues = [
  'expired_discount_not_removed',
  'annual_uplift_not_configured',
  'usage_overage_not_billed',
  'seat_count_not_synced',
  'minimum_commitment_not_monitored',
  'amendment_not_reflected',
  'contract_term_not_visible',
  'manual_invoice_error',
  'customer_master_data_mismatch',
  'missing_usage_feed',
  'renewal_notice_missed',
  'payment_terms_setup_error',
  'unclear_contract_language',
  'unknown'
] as const;

export const rootCauseCategorySchema = z.enum(rootCauseCategoryValues);
export type RootCauseCategory = z.infer<typeof rootCauseCategorySchema>;

const safeTextSchema = z.string().trim().min(1).max(1200);
const safeShortTextSchema = z.string().trim().min(1).max(500);

export const rootCauseSupportingEvidenceSchema = z.object({
  type: z.enum(['finding_type', 'calculation_signal', 'evidence_reference', 'status_context', 'customer_metadata']),
  reference: z.string().trim().min(1).max(220),
  note: safeShortTextSchema
}).strict();

export const rootCauseSafetySchema = z.object({
  canCalculateFinalLeakage: z.literal(false),
  canApproveFindings: z.literal(false),
  canApproveEvidence: z.literal(false),
  canMarkCustomerReady: z.literal(false),
  canExportReports: z.literal(false),
  canSendEmail: z.literal(false),
  canCreateInvoice: z.literal(false),
  storesRawEvidence: z.literal(false)
}).strict();

export const rootCauseOutputSchema = z.object({
  primaryRootCause: rootCauseCategorySchema,
  secondaryRootCauses: z.array(rootCauseCategorySchema).max(5).default([]),
  confidence: z.number().min(0).max(1),
  preventionRecommendation: safeTextSchema,
  operationalOwnerSuggestion: z.string().trim().min(1).max(220),
  supportingEvidence: z.array(rootCauseSupportingEvidenceSchema).max(10).default([]),
  caveats: z.array(safeShortTextSchema).max(8).default([]),
  safety: rootCauseSafetySchema
}).strict().superRefine((value, ctx) => {
  if (value.secondaryRootCauses.includes(value.primaryRootCause)) {
    ctx.addIssue({
      code: 'custom',
      path: ['secondaryRootCauses'],
      message: 'Secondary root causes must not repeat the primary root cause.'
    });
  }
});

export type RootCauseOutput = z.infer<typeof rootCauseOutputSchema>;
export type RootCauseSupportingEvidence = z.infer<typeof rootCauseSupportingEvidenceSchema>;

export const ROOT_CAUSE_SAFETY: RootCauseOutput['safety'] = {
  canCalculateFinalLeakage: false,
  canApproveFindings: false,
  canApproveEvidence: false,
  canMarkCustomerReady: false,
  canExportReports: false,
  canSendEmail: false,
  canCreateInvoice: false,
  storesRawEvidence: false
};
