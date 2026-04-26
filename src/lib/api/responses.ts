import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return jsonError('Invalid request. Check the submitted fields and try again.', 400);
  }

  if (error instanceof Error) {
    if (error.message === 'unauthorized') {
      return jsonError('Authentication is required.', 401);
    }

    if (error.message === 'forbidden') {
      return jsonError('You do not have access to this organization.', 403);
    }

    if (error.message === 'last_owner') {
      return jsonError('Every organization must keep at least one owner.', 409);
    }

    if (error.message === 'invalid_status_transition') {
      return jsonError('That finding status change is not allowed.', 409);
    }

    if (error.message === 'approved_evidence_required') {
      return jsonError('Approve at least one attached evidence item before exporting this finding.', 409);
    }

    if (error.message === 'invalid_last_owner') {
      return jsonError('Every organization must keep at least one owner.', 409);
    }

    if (
      error.message === 'unsupported_document_parser' ||
      error.message === 'document_parse_failed' ||
      error.message === 'empty_document_text'
    ) {
      return jsonError('This document could not be parsed safely. Upload a text-based PDF, DOCX, or TXT contract.', 422);
    }

    if (error.message === 'scanned_document_requires_ocr') {
      return jsonError('This looks like a scanned PDF or image-only document. Use the OCR/multimodal ingestion path from the scanned-document strategy before extraction.', 422);
    }
  }

  return jsonError('Something went wrong. Please try again.', 500);
}
