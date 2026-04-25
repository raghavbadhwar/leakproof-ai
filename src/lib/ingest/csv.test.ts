import { describe, expect, it } from 'vitest';
import { parseInvoiceCsv, parseUsageCsv } from './csv';

describe('CSV ingestion', () => {
  it('parses invoice rows into integer minor-unit amounts with row citations', () => {
    const records = parseInvoiceCsv(
      [
        'customer_external_id,customer_name,invoice_id,invoice_date,line_item,quantity,unit_price,amount,currency',
        'alpha,Alpha Retail Cloud Ltd.,INV-1001,2026-03-31,Monthly platform fee,1,8000.00,8000.00,USD'
      ].join('\n'),
      { sourceDocumentId: 'doc_invoice', workspaceId: 'workspace_1' }
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      customerExternalId: 'alpha',
      customerName: 'Alpha Retail Cloud Ltd.',
      invoiceId: 'INV-1001',
      amountMinor: 800_000,
      currency: 'USD'
    });
    expect(records[0]?.citation.label).toBe('invoices.csv row 2');
  });

  it('parses usage rows with row citations', () => {
    const records = parseUsageCsv(
      [
        'customer_external_id,customer_name,period_start,period_end,metric_name,quantity',
        'alpha,Alpha Retail Cloud Ltd.,2026-03-01,2026-03-31,api_calls,125000'
      ].join('\n'),
      { sourceDocumentId: 'doc_usage', workspaceId: 'workspace_1' }
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      customerExternalId: 'alpha',
      customerName: 'Alpha Retail Cloud Ltd.',
      metricName: 'api_calls',
      quantity: 125_000
    });
    expect(records[0]?.citation.sourceType).toBe('usage');
  });

  it('rejects rows with invalid money instead of silently coercing them', () => {
    expect(() =>
      parseInvoiceCsv(
        [
          'customer_external_id,customer_name,invoice_id,invoice_date,line_item,quantity,unit_price,amount,currency',
          'alpha,Alpha Retail Cloud Ltd.,INV-1001,2026-03-31,Monthly platform fee,1,8000.00,not-money,USD'
        ].join('\n'),
        { sourceDocumentId: 'doc_invoice', workspaceId: 'workspace_1' }
      )
    ).toThrow(/amount/i);
  });
});
