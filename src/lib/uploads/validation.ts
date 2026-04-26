export type DocumentType = 'contract' | 'invoice_csv' | 'usage_csv' | 'customer_csv';

export type UploadValidationInput = {
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  signature?: Uint8Array;
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

  const signatureResult = validateFileSignature(input);
  if (!signatureResult.ok) {
    return signatureResult;
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

function validateFileSignature(input: UploadValidationInput): UploadValidationResult {
  if (!input.signature?.length) {
    return { ok: true };
  }

  const extension = getExtension(input.fileName);
  const bytes = Array.from(input.signature.slice(0, 16));

  if (extension === 'pdf' || input.mimeType === 'application/pdf') {
    return startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
      ? { ok: true }
      : { ok: false, reason: 'The uploaded PDF signature is invalid.' };
  }

  if (extension === 'png' || input.mimeType === 'image/png') {
    return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ? { ok: true }
      : { ok: false, reason: 'The uploaded PNG signature is invalid.' };
  }

  if (extension === 'jpg' || extension === 'jpeg' || input.mimeType === 'image/jpeg') {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff])
      ? { ok: true }
      : { ok: false, reason: 'The uploaded JPEG signature is invalid.' };
  }

  if (extension === 'docx' || input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08])
      ? { ok: true }
      : { ok: false, reason: 'The uploaded DOCX signature is invalid.' };
  }

  return { ok: true };
}

function startsWithBytes(bytes: number[], expected: number[]): boolean {
  return expected.every((byte, index) => bytes[index] === byte);
}
