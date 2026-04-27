import { describe, expect, it } from 'vitest';
import {
  DataMappingValidationError,
  applyCsvMappingToCanonicalCsv,
  parseMappedCsvPreview,
  validateConfirmedDataMapping
} from './csvMapping';
import { parseInvoiceCsv } from './csv';
import type { ConfirmedDataMapping } from '../ai/dataMappingSchema';

describe('CSV data mapping confirmation', () => {
  it('applies confirmed messy invoice mappings before deterministic parsing', () => {
    const csv = [
      'Client ID,Client,Invoice #,Bill Date,Line,Users,Total,Currency',
      'alpha,Alpha Retail,INV-1001,2026-03-31,Monthly platform,12,1200.00,USD'
    ].join('\n');
    const mapping: ConfirmedDataMapping = {
      document_type: 'invoice_csv',
      field_mappings: [
        map('Client ID', 'customer_external_id'),
        map('Client', 'customer_name'),
        map('Invoice #', 'invoice_id'),
        map('Bill Date', 'invoice_date'),
        map('Line', 'line_item'),
        map('Users', 'quantity'),
        map('Total', 'amount'),
        map('Currency', 'currency')
      ]
    };

    const mapped = applyCsvMappingToCanonicalCsv({ csv, documentType: 'invoice_csv', mapping });
    const records = parseInvoiceCsv(mapped.csv, { sourceDocumentId: 'doc_1', workspaceId: 'workspace_1' });

    expect(records[0]).toMatchObject({
      customerExternalId: 'alpha',
      customerName: 'Alpha Retail',
      invoiceId: 'INV-1001',
      quantity: 12,
      amountMinor: 120_000,
      currency: 'USD'
    });
  });

  it('rejects mapping a due date column as invoice_date', () => {
    const mapping: ConfirmedDataMapping = {
      document_type: 'invoice_csv',
      field_mappings: [
        map('Client ID', 'customer_external_id'),
        map('Client', 'customer_name'),
        map('Invoice #', 'invoice_id'),
        map('Due Date', 'invoice_date'),
        map('Line', 'line_item'),
        map('Total', 'amount'),
        map('Currency', 'currency')
      ]
    };

    expect(() =>
      validateConfirmedDataMapping({
        documentType: 'invoice_csv',
        csvHeaders: ['Client ID', 'Client', 'Invoice #', 'Due Date', 'Line', 'Total', 'Currency'],
        mapping
      })
    ).toThrow(DataMappingValidationError);
  });

  it('returns safe parse previews without raw customer or invoice values', () => {
    const preview = parseMappedCsvPreview({
      documentType: 'usage_csv',
      csv: [
        'Client ID,Client,Period From,Period To,Usage Type,Usage Qty',
        'alpha,Alpha Retail,2026-03-01,2026-03-31,api_calls,1200'
      ].join('\n'),
      mapping: {
        document_type: 'usage_csv',
        field_mappings: [
          map('Client ID', 'customer_external_id'),
          map('Client', 'customer_name'),
          map('Period From', 'period_start'),
          map('Period To', 'period_end'),
          map('Usage Type', 'metric_name'),
          map('Usage Qty', 'quantity')
        ]
      }
    });

    expect(preview.row_count).toBe(1);
    expect(JSON.stringify(preview.safe_preview)).not.toContain('Alpha Retail');
    expect(JSON.stringify(preview.safe_preview)).not.toContain('api_calls');
    expect(preview.safe_preview[0]).toMatchObject({
      customer_name: 'text present',
      metric_name: 'text present',
      quantity: 'number present'
    });
  });
});

function map(uploaded_column: string, mapped_field: NonNullable<ConfirmedDataMapping['field_mappings'][number]['mapped_field']>) {
  return {
    uploaded_column,
    mapped_field,
    confidence: 0.9
  };
}
