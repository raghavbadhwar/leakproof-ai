import { z } from 'zod';

export const findingStatusSchema = z.enum(['draft', 'needs_review', 'approved', 'dismissed', 'customer_ready', 'recovered', 'not_recoverable']);
export const humanReviewFindingStatusSchema = z.enum(['approved', 'dismissed', 'needs_review', 'customer_ready', 'recovered', 'not_recoverable']);

const allowedTransitions: Record<z.infer<typeof findingStatusSchema>, Array<z.infer<typeof findingStatusSchema>>> = {
  draft: ['needs_review', 'approved', 'dismissed'],
  needs_review: ['approved', 'dismissed', 'not_recoverable'],
  approved: ['customer_ready', 'needs_review', 'dismissed', 'not_recoverable'],
  dismissed: [],
  customer_ready: ['recovered', 'needs_review', 'not_recoverable'],
  recovered: [],
  not_recoverable: []
};

const findingStatusTransitionSchema = z
  .object({
    from: findingStatusSchema,
    to: findingStatusSchema
  })
  .superRefine((transition, ctx) => {
    if (transition.from === transition.to) {
      ctx.addIssue({
        code: 'custom',
        message: 'Status is already set.'
      });
    }

    if (!allowedTransitions[transition.from].includes(transition.to)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Finding status transition is not allowed.'
      });
    }
  });

export type FindingStatus = z.infer<typeof findingStatusSchema>;
export type HumanReviewFindingStatus = z.infer<typeof humanReviewFindingStatusSchema>;

export function assertValidFindingStatusTransition(from: string, to: string): { from: FindingStatus; to: FindingStatus } {
  const result = findingStatusTransitionSchema.safeParse({ from, to });
  if (!result.success) {
    throw new Error('invalid_status_transition');
  }

  return result.data;
}
