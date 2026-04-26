export const customerFacingFindingStatuses = ['approved', 'customer_ready', 'recovered'] as const;
export const internalPipelineFindingStatuses = ['draft', 'needs_review'] as const;
export const closedReviewFindingStatuses = ['dismissed', 'not_recoverable'] as const;

export type FindingStatus =
  | 'draft'
  | 'needs_review'
  | 'approved'
  | 'dismissed'
  | 'customer_ready'
  | 'recovered'
  | 'not_recoverable'
  | string;

export function isCustomerFacingFindingStatus(status: string): boolean {
  return customerFacingFindingStatuses.includes(status as (typeof customerFacingFindingStatuses)[number]);
}

export function isInternalPipelineFindingStatus(status: string): boolean {
  return internalPipelineFindingStatuses.includes(status as (typeof internalPipelineFindingStatuses)[number]);
}

export function isClosedReviewFindingStatus(status: string): boolean {
  return closedReviewFindingStatuses.includes(status as (typeof closedReviewFindingStatuses)[number]);
}

export function statusGroupFor(status: string): 'customer_facing' | 'internal_pipeline' | 'review_closed' | 'other' {
  if (isCustomerFacingFindingStatus(status)) return 'customer_facing';
  if (isInternalPipelineFindingStatus(status)) return 'internal_pipeline';
  if (isClosedReviewFindingStatus(status)) return 'review_closed';
  return 'other';
}

export function labelizeStatus(status: string): string {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
