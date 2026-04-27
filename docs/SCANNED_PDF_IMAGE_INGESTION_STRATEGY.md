# Scanned PDF and Image Ingestion Strategy

LeakProof AI treats text-based PDFs, DOCX files, TXT contracts, invoice CSVs, and usage CSVs as production-ready ingestion inputs after live verification.

Scanned PDFs and contract images use the selected production path: **Option B, Gemini file/multimodal ingestion**. This path is implemented server-side and still requires live verification with a real Gemini key, representative scanned contracts, and reviewer QA before production sign-off.

## Production Path

1. Store the original scanned PDF or image in the private `source-documents` bucket under `org/{org_id}/workspace/{workspace_id}/...`.
2. Run Gemini multimodal extraction server-side. Do not send raw image bytes to browser code.
3. Validate the structured extraction with Zod, including text, confidence, and page-level text when available.
4. If document-level scanned extraction confidence is below `0.55`, block the upload with a reviewer-safe message. Do not create chunks from weak extracted text.
5. Convert the result into text chunks with page numbers, confidence, and source labels.
   - Scanned PDFs with `pages[]` become chunks labeled `Page {page}, chunk {chunk}`.
   - Their `source_locator` includes `{ "page": page, "chunk": chunk, "confidence": confidence }` when confidence is available.
   - Contract images become chunks labeled `Image 1` or `Image 1, chunk {chunk}`.
   - Image `source_locator` includes `{ "image": 1, "chunk": chunk, "extraction": "Image extraction", "confidence": confidence }` when confidence is available.
   - Text-based PDFs or Gemini responses without a page map still fall back to paragraph labels so ingestion remains usable.
6. Store those chunks in `document_chunks` with `modality = 'pdf'` or `modality = 'image'`.
7. Generate embeddings for the extracted chunks through the existing workspace-scoped embedding route.
8. Pass page/image chunk labels into contract extraction. If Gemini cites a chunk ID, the normalizer preserves the stored source label on the saved term citation, for example `Page 4, chunk 2 - Section 8.2`.
9. Show extracted chunks as evidence candidates, not approved evidence.
10. Require a human reviewer to approve the candidate before it can support a finding or report.
11. Redact raw image text, model prompts, and model responses from logs and audit metadata.

## Launch Rule

If a PDF has no usable text layer, the app must fall back to Gemini multimodal extraction. If Gemini extraction fails, returns empty text, or returns document-level confidence below `0.55`, the app stops with a clear upload error. It must not guess commercial terms from an empty or weak scanned extraction.

Page-level confidence is stored for reviewer context when Gemini returns it. It is not treated as human approval and does not override term-level `needs_review`.

## Customer Expectation

For the first production audits, prefer text-based PDFs, DOCX files, TXT exports, invoice CSVs, and usage CSVs. Use scanned files only after the Gemini multimodal path above passes live verification with representative customer contracts. Known limitations: image uploads represent one source image, OCR confidence depends on Gemini output quality, and responses without page maps can only cite paragraph labels.
