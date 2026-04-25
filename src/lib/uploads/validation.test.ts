import { describe, expect, it } from 'vitest';
import { buildTenantStoragePath, validateUpload } from './validation';

describe('upload validation', () => {
  it('accepts supported contract and CSV uploads under the size limit', () => {
    expect(
      validateUpload({
        documentType: 'contract',
        fileName: 'Alpha Contract.txt',
        mimeType: 'text/plain',
        sizeBytes: 1024
      }).ok
    ).toBe(true);

    expect(
      validateUpload({
        documentType: 'invoice_csv',
        fileName: 'invoices.csv',
        mimeType: 'text/csv',
        sizeBytes: 2048
      }).ok
    ).toBe(true);

    expect(
      validateUpload({
        documentType: 'contract',
        fileName: 'scanned-contract.png',
        mimeType: 'image/png',
        sizeBytes: 4096
      }).ok
    ).toBe(true);
  });

  it('rejects executable files and oversize uploads', () => {
    expect(
      validateUpload({
        documentType: 'contract',
        fileName: 'malware.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 100
      }).ok
    ).toBe(false);

    expect(
      validateUpload({
        documentType: 'usage_csv',
        fileName: 'usage.csv',
        mimeType: 'text/csv',
        sizeBytes: 26 * 1024 * 1024
      }).ok
    ).toBe(false);
  });

  it('builds org-scoped storage paths with sanitized file names', () => {
    expect(
      buildTenantStoragePath({
        organizationId: 'org_123',
        workspaceId: 'workspace_456',
        documentType: 'contract',
        fileName: '../../Alpha Contract (Final).txt'
      })
    ).toBe('org/org_123/workspace/workspace_456/contract/alpha-contract-final.txt');
  });
});
