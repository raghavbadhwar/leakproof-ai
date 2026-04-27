import { afterEach, describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

describe('data mapping confirmation route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects viewers before parsing or loading CSV data', async () => {
    const createSupabaseServiceClient = vi.fn(() => {
      throw new Error('service client should not be created for viewer confirmation');
    });
    const requireWorkspaceRole = vi.fn(async (_request: Request, _organizationId: string, _workspaceId: string, roles: readonly string[]) => {
      expect(roles).not.toContain('viewer');
      throw new Error('forbidden');
    });

    vi.doMock('@/lib/api/rateLimit', () => ({ enforceRateLimit: vi.fn() }));
    vi.doMock('@/lib/ai/dataMappingSchema', () => ({
      dataMappingConfirmRequestSchema: {
        parse: (value: unknown) => value
      },
      fieldsForDocumentType: vi.fn()
    }));
    vi.doMock('@/lib/api/responses', () => ({
      jsonError: (message: string, status = 400) => Response.json({ error: message }, { status }),
      handleApiError: (error: unknown) => {
        if (error instanceof Error && error.message === 'forbidden') {
          return Response.json({ error: 'You do not have access to this organization.' }, { status: 403 });
        }
        return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
    }));
    vi.doMock('@/lib/db/auth', () => ({ requireWorkspaceRole }));
    vi.doMock('@/lib/db/roles', () => ({ REVIEWER_WRITE_ROLES: ['owner', 'admin', 'reviewer'] }));
    vi.doMock('@/lib/db/supabaseServer', () => ({ createSupabaseServiceClient }));
    vi.doMock('@/lib/ingest/csvMapping', () => ({
      DataMappingValidationError: class DataMappingValidationError extends Error {},
      parseMappedCsvPreview: vi.fn()
    }));

    const route = await import('./route');
    const response = await route.POST(jsonRequest(), { params: Promise.resolve({ workspaceId }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'You do not have access to this organization.' });
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });
});

function jsonRequest(): Request {
  return new Request(`https://leakproof.test/api/workspaces/${workspaceId}/data-mapping/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      organization_id: organizationId,
      document_type: 'invoice_csv',
      file_name: 'invoices.csv',
      csv_text: 'Client ID,Client,Invoice #,Bill Date,Line,Total,Currency\nalpha,Alpha,INV-1,2026-03-31,Platform,100,USD',
      confirmed_mapping: {
        document_type: 'invoice_csv',
        field_mappings: [
          { uploaded_column: 'Client ID', mapped_field: 'customer_external_id', confidence: 0.9 },
          { uploaded_column: 'Client', mapped_field: 'customer_name', confidence: 0.9 },
          { uploaded_column: 'Invoice #', mapped_field: 'invoice_id', confidence: 0.9 },
          { uploaded_column: 'Bill Date', mapped_field: 'invoice_date', confidence: 0.9 },
          { uploaded_column: 'Line', mapped_field: 'line_item', confidence: 0.9 },
          { uploaded_column: 'Total', mapped_field: 'amount', confidence: 0.9 },
          { uploaded_column: 'Currency', mapped_field: 'currency', confidence: 0.9 }
        ]
      }
    })
  });
}
