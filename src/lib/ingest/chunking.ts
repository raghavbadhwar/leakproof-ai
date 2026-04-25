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

export function chunkTextDocument(input: {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  text: string;
  modality?: DocumentChunk['modality'];
  maxChunkCharacters?: number;
}): DocumentChunk[] {
  const paragraphs = input.text
    .split(/\n{2,}|\r?\n(?=(?:Section|Clause|Article)\s+\d)/i)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const maxChunkCharacters = input.maxChunkCharacters ?? 1400;
  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkCharacters) {
      chunks.push(paragraph);
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChunkCharacters) {
      chunks.push(paragraph.slice(index, index + maxChunkCharacters).trim());
    }
  }

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
