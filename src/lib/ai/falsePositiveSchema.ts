import { z } from 'zod';
import { evidenceQualityRecommendationSchema } from './evidenceQualitySchema';

export const falsePositiveRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

const safeReviewTextSchema = z.string().trim().min(1).max(600);

export const falsePositiveReviewSchema = z
  .object({
    riskLevel: falsePositiveRiskLevelSchema,
    riskReasons: z.array(safeReviewTextSchema).max(12).default([]),
    suggestedChecks: z.array(safeReviewTextSchema).min(1).max(12),
    blockingIssues: z.array(safeReviewTextSchema).max(12).default([]),
    recommendation: evidenceQualityRecommendationSchema
  })
  .strict();

export type FalsePositiveRiskLevel = z.infer<typeof falsePositiveRiskLevelSchema>;
export type FalsePositiveReview = z.infer<typeof falsePositiveReviewSchema>;

export function parseFalsePositiveReview(output: unknown): FalsePositiveReview {
  return falsePositiveReviewSchema.parse(output);
}
