import { describe, expect, it } from 'vitest';
import {
  buildDataMappingPrompt,
  suggestDataMapping,
  suggestDataMappingDeterministic
} from './dataMapping';
import type { DataMappingSuggestRequest } from './dataMappingSchema';

const organizationId = '11111111-1111-4111-8111-111111111111';

describe('AI data mapping assistant', () => {
  it('maps messy invoice headers to canonical invoice fields', () => {
    const suggestion = suggestDataMappingDeterministic({
      organization_id: organizationId,
      document_type: 'invoice_csv',
      file_name: 'messy-invoices.csv',
      csv_headers: ['Client ID', 'Client', 'Invoice #', 'Bill Date', 'Line', 'Users', 'Total', 'Currency'],
      sample_rows: [{
        'Client ID': 'text:9',
        Client: 'text:18',
        'Invoice #': 'text:8',
        'Bill Date': 'date',
        Line: 'text:20',
        Users: 'number',
        Total: 'money',
        Currency: 'currency'
      }]
    });

    expect(mappedField(suggestion, 'Client ID')).toBe('customer_external_id');
    expect(mappedField(suggestion, 'Client')).toBe('customer_name');
    expect(mappedField(suggestion, 'Invoice #')).toBe('invoice_id');
    expect(mappedField(suggestion, 'Bill Date')).toBe('invoice_date');
    expect(mappedField(suggestion, 'Users')).toBe('quantity');
    expect(mappedField(suggestion, 'Total')).toBe('amount');
    expect(suggestion.required_missing_fields).toEqual([]);
  });

  it('maps messy usage headers to canonical usage fields', () => {
    const suggestion = suggestDataMappingDeterministic({
      organization_id: organizationId,
      document_type: 'usage_csv',
      file_name: 'usage-export.csv',
      csv_headers: ['Client ID', 'Client', 'Period From', 'Period To', 'Usage Type', 'Usage Qty', 'Product'],
      sample_rows: [{
        'Client ID': 'text:9',
        Client: 'text:18',
        'Period From': 'date',
        'Period To': 'date',
        'Usage Type': 'text:9',
        'Usage Qty': 'number',
        Product: 'text:8'
      }]
    });

    expect(mappedField(suggestion, 'Client ID')).toBe('customer_external_id');
    expect(mappedField(suggestion, 'Client')).toBe('customer_name');
    expect(mappedField(suggestion, 'Period From')).toBe('period_start');
    expect(mappedField(suggestion, 'Period To')).toBe('period_end');
    expect(mappedField(suggestion, 'Usage Type')).toBe('metric_name');
    expect(mappedField(suggestion, 'Usage Qty')).toBe('quantity');
    expect(suggestion.required_missing_fields).toEqual([]);
  });

  it('flags missing invoice amount instead of inventing one', () => {
    const suggestion = suggestDataMappingDeterministic({
      organization_id: organizationId,
      document_type: 'invoice_csv',
      file_name: 'missing-amount.csv',
      csv_headers: ['Client ID', 'Client', 'Invoice #', 'Bill Date', 'Line', 'Currency'],
      sample_rows: []
    });

    expect(suggestion.required_missing_fields).toContain('amount');
    expect(suggestion.warnings.join(' ')).toMatch(/missing required fields/i);
  });

  it('flags missing customer identifier fields', () => {
    const suggestion = suggestDataMappingDeterministic({
      organization_id: organizationId,
      document_type: 'invoice_csv',
      file_name: 'anonymous-invoices.csv',
      csv_headers: ['Invoice #', 'Bill Date', 'Line', 'Total', 'Currency'],
      sample_rows: []
    });

    expect(suggestion.required_missing_fields).toEqual(expect.arrayContaining(['customer_external_id', 'customer_name']));
    expect(suggestion.warnings.join(' ')).toMatch(/customer identifier/i);
  });

  it('falls back safely when Gemini returns invalid output', async () => {
    const input: DataMappingSuggestRequest = {
      organization_id: organizationId,
      document_type: 'invoice_csv',
      file_name: 'messy-invoices.csv',
      csv_headers: ['Client ID', 'Client', 'Invoice #', 'Bill Date', 'Line', 'Total', 'Currency'],
      sample_rows: []
    };

    const suggestion = await suggestDataMapping(input, async () => ({ unsafe: true }));

    expect(suggestion.mapping_source).toBe('deterministic_fallback');
    expect(suggestion.warnings[0]).toMatch(/deterministic fuzzy mapping/i);
    expect(mappedField(suggestion, 'Total')).toBe('amount');
  });

  it('does not include raw CSV values in the Gemini prompt', () => {
    const prompt = buildDataMappingPrompt({
      organization_id: organizationId,
      document_type: 'customer_csv',
      file_name: 'Acme Secret Incorporated customers.csv',
      csv_headers: ['Client', 'ARR', 'Owner Email'],
      sample_rows: [{
        Client: 'Acme Secret Incorporated',
        ARR: '123456.78',
        'Owner Email': 'founder@example.com'
      }]
    });

    expect(prompt).not.toContain('Acme Secret Incorporated');
    expect(prompt).not.toContain('customers.csv');
    expect(prompt).not.toContain('123456.78');
    expect(prompt).not.toContain('founder@example.com');
    expect(prompt).toContain('text:');
    expect(prompt).toContain('money');
    expect(prompt).toContain('email');
  });
});

function mappedField(suggestion: { field_mappings: Array<{ uploaded_column: string; mapped_field: string | null }> }, header: string) {
  return suggestion.field_mappings.find((mapping) => mapping.uploaded_column === header)?.mapped_field;
}
