import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extraction logging safety', () => {
  it('does not log raw prompts, contract text, or Gemini responses in extraction modules', () => {
    const root = process.cwd();
    const files = [
      'src/lib/agents/contractExtractor.ts',
      'src/lib/agents/contractExtractionNormalizer.ts',
      'src/lib/ai/geminiClient.ts',
      'src/app/api/extraction/run/route.ts'
    ];

    const combinedSource = files.map((file) => readFileSync(join(root, file), 'utf8')).join('\n');

    expect(combinedSource).not.toMatch(/console\.(log|info|debug|warn|error)\s*\(/);
  });

  it('does not cap extraction to the first eight stored chunks', () => {
    const routeSource = readFileSync(join(process.cwd(), 'src/app/api/extraction/run/route.ts'), 'utf8');

    expect(routeSource).not.toContain('.limit(8)');
    expect(routeSource).toContain(".order('chunk_index', { ascending: true })");
  });
});
