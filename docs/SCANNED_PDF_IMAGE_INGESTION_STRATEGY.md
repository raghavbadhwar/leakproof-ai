# Scanned PDF and Image Ingestion Strategy

LeakProof AI treats text-based PDFs, DOCX files, TXT contracts, invoice CSVs, and usage CSVs as production-ready ingestion inputs after live verification.

Scanned PDFs and contract images use the selected production path: **Option B, Gemini file/multimodal ingestion**. This path is implemented server-side and still requires live verification with a real Gemini key, representative scanned contracts, and reviewer QA before production sign-off.

## Production Path

1. Store the original scanned PDF or image in the private `source-documents` bucket under `org/{org_id}/workspace/{workspace_id}/...`.
2. Run Gemini multimodal extraction server-side. Do not send raw image bytes to browser code.
3. Validate the structured extraction with Zod, including text, confidence, and page-level text when available.
4. Convert the result into text chunks with page numbers, confidence, and source labels.
5. Store those chunks in `document_chunks` with `modality = 'pdf'` or `modality = 'image'`.
6. Generate embeddings for the extracted chunks through the existing workspace-scoped embedding route.
7. Show extracted chunks as evidence candidates, not approved evidence.
8. Require a human reviewer to approve the candidate before it can support a finding or report.
9. Redact raw image text, model prompts, and model responses from logs and audit metadata.

## Launch Rule

If a PDF has no usable text layer, the app must fall back to Gemini multimodal extraction. If Gemini extraction fails or returns low-confidence/empty text, the app must stop with a reviewable parse error. It must not guess commercial terms from an empty extraction.

## Customer Expectation

For the first production audits, prefer text-based PDFs, DOCX files, TXT exports, invoice CSVs, and usage CSVs. Use scanned files only after the Gemini multimodal path above passes live verification.
