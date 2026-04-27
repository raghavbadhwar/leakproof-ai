import { createHash } from 'node:crypto';

export type DocumentChunk = {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  chunkIndex: number;
  modality: 'text' | 'pdf' | 'image' | 'csv_row' | 'table' | 'audio' | 'video' | 'mixed';
  content: string;
  sourceLabel: string;
  sourceLocator: Record<string, string | number>;
  contentHash: string;
  tokenEstimate: number;
};

export type PageMappedText = {
  page: number;
  text: string;
  confidence?: number;
};

export function chunkTextDocument(input: {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  text: string;
  modality?: DocumentChunk['modality'];
  pageMap?: PageMappedText[];
  extractionConfidence?: number;
  maxChunkCharacters?: number;
}): DocumentChunk[] {
  const maxChunkCharacters = input.maxChunkCharacters ?? 1400;
  const pageMap = input.pageMap?.filter((page) => Number.isInteger(page.page) && page.page > 0 && page.text.trim().length > 0) ?? [];

  if (input.modality === 'image') {
    return chunkImageTextDocument(input, maxChunkCharacters);
  }

  if (pageMap.length > 0) {
    return chunkPageMappedTextDocument(input, pageMap, maxChunkCharacters);
  }

  const chunks = splitTextIntoChunks(input.text, maxChunkCharacters);

  return chunks.map((content, index) =>
    buildChunk({
      ...input,
      chunkIndex: index,
      modality: input.modality ?? 'text',
      content,
      sourceLabel: `paragraph ${index + 1}`,
      sourceLocator: { paragraph: index + 1 }
    })
  );
}

function chunkPageMappedTextDocument(
  input: {
    organizationId: string;
    workspaceId: string;
    sourceDocumentId: string;
    modality?: DocumentChunk['modality'];
    extractionConfidence?: number;
  },
  pageMap: PageMappedText[],
  maxChunkCharacters: number
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const page of pageMap) {
    const pageChunks = splitTextIntoChunks(page.text, maxChunkCharacters);
    pageChunks.forEach((content, pageChunkIndex) => {
      const sourceLocator = compactLocator({
        page: page.page,
        chunk: pageChunkIndex + 1,
        confidence: page.confidence ?? input.extractionConfidence
      });

      chunks.push(
        buildChunk({
          ...input,
          chunkIndex: chunks.length,
          modality: input.modality ?? 'pdf',
          content,
          sourceLabel: `Page ${page.page}, chunk ${pageChunkIndex + 1}`,
          sourceLocator
        })
      );
    });
  }

  return chunks;
}

function chunkImageTextDocument(
  input: {
    organizationId: string;
    workspaceId: string;
    sourceDocumentId: string;
    text: string;
    extractionConfidence?: number;
  },
  maxChunkCharacters: number
): DocumentChunk[] {
  return splitTextIntoChunks(input.text, maxChunkCharacters).map((content, index) =>
    buildChunk({
      ...input,
      chunkIndex: index,
      modality: 'image',
      content,
      sourceLabel: index === 0 ? 'Image 1' : `Image 1, chunk ${index + 1}`,
      sourceLocator: compactLocator({
        image: 1,
        chunk: index + 1,
        extraction: 'Image extraction',
        confidence: input.extractionConfidence
      })
    })
  );
}

function splitTextIntoChunks(text: string, maxChunkCharacters: number): string[] {
  const paragraphs = text
    .split(/\n{2,}|\r?\n(?=(?:Section|Clause|Article)\s+\d)/i)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkCharacters) {
      chunks.push(paragraph);
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChunkCharacters) {
      const chunk = paragraph.slice(index, index + maxChunkCharacters).trim();
      if (chunk) chunks.push(chunk);
    }
  }

  return chunks;
}

export function chunkCsvRows(input: {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  csv: string;
  labelPrefix: string;
}): DocumentChunk[] {
  const { headers, rows } = parseCsvRows(input.csv);

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const content = headers.map((header) => `${header}: ${row[header] ?? ''}`).join('\n');

    return buildChunk({
      ...input,
      chunkIndex: index,
      modality: 'csv_row',
      content,
      sourceLabel: `${input.labelPrefix} row ${rowNumber}`,
      sourceLocator: { row: rowNumber }
    });
  });
}

function buildChunk(input: {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  chunkIndex: number;
  modality: DocumentChunk['modality'];
  content: string;
  sourceLabel: string;
  sourceLocator: Record<string, string | number>;
}): DocumentChunk {
  return {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    sourceDocumentId: input.sourceDocumentId,
    chunkIndex: input.chunkIndex,
    modality: input.modality,
    content: input.content,
    sourceLabel: input.sourceLabel,
    sourceLocator: input.sourceLocator,
    contentHash: hashContent(input.content),
    tokenEstimate: estimateTokens(input.content)
  };
}

function compactLocator(locator: Record<string, string | number | undefined>): Record<string, string | number> {
  return Object.fromEntries(Object.entries(locator).filter(([, value]) => value !== undefined)) as Record<string, string | number>;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content.trim().replace(/\s+/g, ' ')).digest('hex');
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function parseCsvRows(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headers = splitCsvLine(lines[0] ?? '').map((header) => header.trim());
  const rows = lines.slice(1).map((line, lineIndex) => {
    const values = splitCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${lineIndex + 2} has ${values.length} columns; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });

  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}
