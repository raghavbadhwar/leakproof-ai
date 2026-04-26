import { z } from 'zod';
import { humanReviewFindingStatusSchema } from './status';

export const uuidSchema = z.string().uuid();
export const organizationRoleSchema = z.enum(['owner', 'admin', 'reviewer', 'member', 'viewer']);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

export const createWorkspaceSchema = z.object({
  organization_id: uuidSchema,
  name: z.string().trim().min(2).max(160)
});

export const uploadMetadataSchema = z.object({
  organization_id: uuidSchema,
  workspace_id: uuidSchema,
  document_type: z.enum(['contract', 'invoice_csv', 'usage_csv', 'customer_csv']),
  customer_id: uuidSchema.optional(),
  customer_external_id: z.string().trim().min(1).max(160).optional(),
  customer_name: z.string().trim().min(1).max(240).optional(),
  domain: z.string().trim().min(1).max(253).optional()
});

export const customerQuerySchema = z.object({
  organization_id: uuidSchema
});

export const createCustomerSchema = z.object({
  organization_id: uuidSchema,
  customer_external_id: z.string().trim().min(1).max(160).optional(),
  customer_name: z.string().trim().min(1).max(240),
  domain: z.string().trim().min(1).max(253).optional()
});

export const assignDocumentCustomerSchema = z.object({
  organization_id: uuidSchema,
  customer_id: uuidSchema.optional(),
  customer_external_id: z.string().trim().min(1).max(160).optional(),
  customer_name: z.string().trim().min(1).max(240).optional(),
  domain: z.string().trim().min(1).max(253).optional()
});

export const runExtractionSchema = z.object({
  organization_id: uuidSchema,
  workspace_id: uuidSchema,
  source_document_id: uuidSchema
});

export const runReconciliationSchema = z.object({
  organization_id: uuidSchema,
  workspace_id: uuidSchema
});

export const workspaceScopedBodySchema = z.object({
  organization_id: uuidSchema
});

export const organizationScopedBodySchema = z.object({
  organization_id: uuidSchema
});

export const updateMemberRoleSchema = z.object({
  organization_id: uuidSchema,
  role: organizationRoleSchema
});

export const createInviteSchema = z.object({
  organization_id: uuidSchema,
  email: z.string().trim().email().max(320),
  role: z.enum(['admin', 'reviewer', 'member', 'viewer'])
});

export const cancelInviteSchema = z.object({
  organization_id: uuidSchema
});

export const acceptInviteSchema = z.object({
  token: z.string().trim().uuid()
});

export const updateTermSchema = z.object({
  organization_id: uuidSchema,
  term_value: z.unknown().optional(),
  review_status: z.enum(['approved', 'edited', 'needs_review', 'rejected']),
  reviewer_note: z.string().trim().max(1000).optional()
});

export const semanticSearchSchema = z.object({
  organization_id: uuidSchema,
  query: z.string().trim().min(2).max(500),
  limit: z.number().int().min(1).max(20).optional().default(8)
});

export const reportExportSchema = z.object({
  organization_id: uuidSchema,
  format: z.enum(['print_pdf', 'json', 'clipboard']).default('print_pdf')
});

export const findingStatusUpdateSchema = z.object({
  status: humanReviewFindingStatusSchema,
  note: z.string().trim().max(1000).optional()
}).superRefine((value, ctx) => {
  if (['dismissed', 'not_recoverable'].includes(value.status) && !value.note) {
    ctx.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'A reason is required for this status.'
    });
  }
});

export const findingAssignmentSchema = z.object({
  organization_id: uuidSchema,
  reviewer_user_id: uuidSchema.nullable()
});

export const evidenceCandidateActionSchema = z.object({
  organization_id: uuidSchema,
  note: z.string().trim().max(1000).optional()
});

export function workspaceQuery(searchParams: URLSearchParams): { organization_id: string; workspace_id: string } {
  return z
    .object({
      organization_id: uuidSchema,
      workspace_id: uuidSchema
    })
    .parse({
      organization_id: searchParams.get('organization_id'),
      workspace_id: searchParams.get('workspace_id')
    });
}
