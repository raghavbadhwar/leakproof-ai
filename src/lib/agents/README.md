# AI Agent Layer

Gemini-facing extraction and audit workflow code lives here.

Rules:

- Use prompts in `prompts/`.
- Validate model output with schemas.
- Store citations and confidence.
- Do not calculate final leakage amounts with AI.
- Keep deterministic calculations in `src/lib/leakage/`.
- Keep Gemini provider details in `src/lib/ai/` and retrieval details in `src/lib/retrieval/`.

Suggested files to create:

- `auditAgent.ts`
- `contractExtractor.ts`
- `contractSchema.ts`
- `auditAgent.ts`
- `extractionEval.test.ts`
