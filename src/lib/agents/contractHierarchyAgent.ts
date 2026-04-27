import type { ContractHierarchyResolution } from '../ai/contractHierarchy';

export type HierarchyTermReviewState = {
  id: string;
  reviewStatus: 'extracted' | 'approved' | 'edited' | 'needs_review' | 'rejected' | string;
};

export type ContractHierarchyReviewPlan = {
  canCreateRecoverableLeakage: false;
  canOverrideApprovedTerms: false;
  canApproveEvidence: false;
  termsToMarkNeedsReview: string[];
  approvedTermsLeftUnchanged: string[];
  conflictCount: number;
  unresolvedCount: number;
  reviewerChecklist: string[];
};

export function planContractHierarchyReview(input: {
  resolution: ContractHierarchyResolution;
  terms: HierarchyTermReviewState[];
}): ContractHierarchyReviewPlan {
  const termById = new Map(input.terms.map((term) => [term.id, term]));
  const conflictingTermIds = new Set(input.resolution.conflicts.flatMap((conflict) => conflict.termIds));
  const unresolvedTermIds = new Set(input.resolution.unresolvedItems.flatMap((item) => item.termIds));
  const reviewTermIds = new Set([...conflictingTermIds, ...unresolvedTermIds]);
  const termsToMarkNeedsReview: string[] = [];
  const approvedTermsLeftUnchanged: string[] = [];

  for (const termId of reviewTermIds) {
    const term = termById.get(termId);
    if (!term || term.reviewStatus === 'rejected') continue;
    if (term.reviewStatus === 'approved' || term.reviewStatus === 'edited') {
      approvedTermsLeftUnchanged.push(termId);
      continue;
    }
    termsToMarkNeedsReview.push(termId);
  }

  return {
    canCreateRecoverableLeakage: false,
    canOverrideApprovedTerms: false,
    canApproveEvidence: false,
    termsToMarkNeedsReview,
    approvedTermsLeftUnchanged,
    conflictCount: input.resolution.conflicts.length,
    unresolvedCount: input.resolution.unresolvedItems.length,
    reviewerChecklist: input.resolution.reviewerChecklist
  };
}

export function hierarchyBlocksRecoverableLeakage(plan: ContractHierarchyReviewPlan): boolean {
  return plan.conflictCount > 0 || plan.unresolvedCount > 0;
}
