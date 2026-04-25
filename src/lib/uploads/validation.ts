export type DocumentType = 'contract' | 'invoice_csv' | 'usage_csv' | 'customer_csv';

export type UploadValidationInput = {
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<DocumentType, Set<string>> = {
  contract: new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]),
  invoice_csv: new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']),
  usage_csv: new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']),
  customer_csv: new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel'])
};

const ALLOWED_EXTENSIONS: Record<DocumentType, Set<string>> = {
  contract: new Set(['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg']),
  invoice_csv: new Set(['csv']),
  usage_csv: new Set(['csv']),
  customer_csv: new Set(['csv'])
};

export function validateUpload(input: UploadValidationInput): UploadValidationResult {
  if (input.sizeBytes <= 0) {
    return { ok: false, reason: 'The selected file is empty.' };
  }

  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'Files must be 25 MB or smaller.' };
  }

  const extension = getExtension(input.fileName);
  if (!ALLOWED_EXTENSIONS[input.documentType].has(extension)) {
    return { ok: false, reason: `.${extension || 'unknown'} files are not supported for ${input.documentType}.` };
  }

  if (!ALLOWED_MIME_TYPES[input.documentType].has(input.mimeType)) {
    return { ok: false, reason: `${input.mimeType || 'Unknown file type'} is not allowed.` };
  }

  return { ok: true };
}

export function buildTenantStoragePath(input: {
  organizationId: string;
  workspaceId: string;
  documentType: DocumentType;
  fileName: string;
}): string {
  return [
    'org',
    input.organizationId,
    'workspace',
    input.workspaceId,
    input.documentType,
    sanitizeFileName(input.fileName)
  ].join('/');
}

function getExtension(fileName: string): string {
  const leafName = fileName.split(/[\\/]/).pop() ?? '';
  const extension = leafName.includes('.') ? leafName.split('.').pop() : '';
  return (extension ?? '').toLowerCase();
}

function sanitizeFileName(fileName: string): string {
  const leafName = fileName.split(/[\\/]/).pop() ?? 'upload';
  const extension = getExtension(leafName);
  const base = leafName
    .replace(new RegExp(`\\.${extension}$`, 'i'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${base || 'upload'}${extension ? `.${extension}` : ''}`;
}
