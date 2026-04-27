import { describe, expect, it } from 'vitest';
import { parseCustomerCsv, parseInvoiceCsv, parseUsageCsv } from './csv';

describe('CSV ingestion', () => {
  it('parses invoice rows into integer minor-unit amounts with row citations', () => {
    const records = parseInvoiceCsv(
      [
        'customer_external_id,customer_name,segment,billing_model,contract_type,contract_value,renewal_date,owner_label,domain,invoice_id,invoice_date,line_item,quantity,unit_price,amount,currency,payment_terms_days,due_date,paid_at,product_label,team_label,service_period_start,service_period_end',
        'alpha,Alpha Retail Cloud Ltd.,Enterprise,Usage + minimum,Order form,120000.00,2026-12-31,Nina,alpha.example,INV-1001,2026-03-31,Monthly platform fee,1,8000.00,8000.00,USD,45,2026-05-15,2026-05-10,Core API,Finance Ops,2026-03-01,2026-03-31'
      ].join('\n'),
      { sourceDocumentId: 'doc_invoice', workspaceId: 'workspace_1' }
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      customerExternalId: 'alpha',
      customerName: 'Alpha Retail Cloud Ltd.',
      invoiceId: 'INV-1001',
      amountMinor: 800_000,
      currency: 'USD',
      customerSegment: 'Enterprise',
      billingModel: 'Usage + minimum',
      contractValueMinor: 12_000_000,
      renewalDate: '2026-12-31',
      paymentTermsDays: 45,
      dueDate: '2026-05-15',
      paidAt: '2026-05-10',
      productLabel: 'Core API',
      teamLabel: 'Finance Ops',
      servicePeriodStart: '2026-03-01',
      servicePeriodEnd: '2026-03-31'
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

  it('parses optional customer analytics metadata from customer CSVs', () => {
    const records = parseCustomerCsv(
      [
        'customer_external_id,customer_name,segment,billing_model,contract_type,contract_value,currency,renewal_date,owner_label,domain',
        'alpha,Alpha Retail Cloud Ltd.,Enterprise,Usage + minimum,Order form,120000.00,USD,2026-12-31,Nina,alpha.example'
      ].join('\n')
    );

    expect(records).toEqual([
      {
        customerExternalId: 'alpha',
        customerName: 'Alpha Retail Cloud Ltd.',
        customerSegment: 'Enterprise',
        billingModel: 'Usage + minimum',
        contractType: 'Order form',
        contractValueMinor: 12_000_000,
        currency: 'USD',
        renewalDate: '2026-12-31',
        ownerLabel: 'Nina',
        domain: 'alpha.example'
      }
    ]);
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

  it('rejects non-integer payment terms days', () => {
    expect(() =>
      parseInvoiceCsv(
        [
          'customer_external_id,customer_name,invoice_id,invoice_date,line_item,quantity,unit_price,amount,currency,payment_terms_days',
          'alpha,Alpha Retail Cloud Ltd.,INV-1001,2026-03-31,Monthly platform fee,1,8000.00,8000.00,USD,30.5'
        ].join('\n'),
        { sourceDocumentId: 'doc_invoice', workspaceId: 'workspace_1' }
      )
    ).toThrow(/payment_terms_days/i);
  });
});
