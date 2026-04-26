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
        sizeBytes: 4096,
        signature: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
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

  it('rejects PDF and image uploads whose magic bytes do not match their claimed type', () => {
    expect(
      validateUpload({
        documentType: 'contract',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        signature: new TextEncoder().encode('<script>alert(1)</script>')
      }).ok
    ).toBe(false);

    expect(
      validateUpload({
        documentType: 'contract',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        signature: new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      }).ok
    ).toBe(false);

    expect(
      validateUpload({
        documentType: 'contract',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        signature: new TextEncoder().encode('%PDF-1.7')
      }).ok
    ).toBe(true);
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
