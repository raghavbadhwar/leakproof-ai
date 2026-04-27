import { z } from 'zod';

export const evidenceQualityLevelSchema = z.enum([
  'strong_evidence',
  'medium_evidence',
  'weak_evidence',
  'conflicting_evidence',
  'needs_more_evidence'
]);

export const evidenceQualityRecommendationSchema = z.enum([
  'ready_for_review',
  'needs_more_evidence',
  'do_not_approve_yet'
]);

const safeReviewTextSchema = z.string().trim().min(1).max(500);

export const evidenceQualityReviewSchema = z
  .object({
    quality: evidenceQualityLevelSchema,
    score: z.number().int().min(0).max(100),
    requiredEvidencePresent: z.boolean(),
    contractEvidencePresent: z.boolean(),
    invoiceOrUsageEvidencePresent: z.boolean(),
    formulaSupported: z.boolean(),
    missingEvidence: z.array(safeReviewTextSchema).max(12).default([]),
    conflictingSignals: z.array(safeReviewTextSchema).max(12).default([]),
    reviewerChecklist: z.array(safeReviewTextSchema).min(1).max(12),
    recommendation: evidenceQualityRecommendationSchema
  })
  .strict();

export type EvidenceQualityLevel = z.infer<typeof evidenceQualityLevelSchema>;
export type EvidenceQualityRecommendation = z.infer<typeof evidenceQualityRecommendationSchema>;
export type EvidenceQualityReview = z.infer<typeof evidenceQualityReviewSchema>;

export function parseEvidenceQualityReview(output: unknown): EvidenceQualityReview {
  return evidenceQualityReviewSchema.parse(output);
}
