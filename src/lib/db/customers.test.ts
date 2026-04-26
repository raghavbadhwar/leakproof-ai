import { describe, expect, it } from 'vitest';
import { parseInvoiceCsv, parseUsageCsv } from '../ingest/csv';
import { assertCustomerBelongsToOrg, findOrCreateCustomer, resolveCustomerForUpload } from './customers';

type CustomerRecord = {
  id: string;
  organization_id: string;
  external_id?: string | null;
  name: string;
  domain?: string | null;
};

describe('customer linking helpers', () => {
  it('uses a contract upload customer_id when the customer belongs to the org', async () => {
    const db = new FakeCustomerDb([{ id: 'customer_a', organization_id: 'org_a', external_id: 'alpha', name: 'Alpha Ltd.' }]);

    await expect(
      resolveCustomerForUpload(db, {
        organizationId: 'org_a',
        customerId: 'customer_a'
      })
    ).resolves.toMatchObject({ customerId: 'customer_a', matchedBy: 'customer_id', reviewNeeded: false });
  });

  it('keeps a contract upload unassigned when no customer identity is supplied', async () => {
    const db = new FakeCustomerDb();

    await expect(resolveCustomerForUpload(db, { organizationId: 'org_a' })).resolves.toEqual({
      customerId: null,
      matchedBy: 'unassigned',
      confidence: 0,
      reviewNeeded: true
    });
    expect(db.customers).toHaveLength(0);
  });

  it('creates or reuses invoice CSV customers through the shared customer table', async () => {
    const db = new FakeCustomerDb();
    const records = parseInvoiceCsv(
      [
        'customer_external_id,customer_name,domain,invoice_id,invoice_date,line_item,amount,currency',
        'alpha,Alpha Retail Ltd.,alpha.com,INV-1,2026-03-31,Platform fee,1000,USD',
        'alpha,Alpha Retail Ltd.,alpha.com,INV-2,2026-04-30,Platform fee,1100,USD'
      ].join('\n'),
      { sourceDocumentId: 'doc_invoice', workspaceId: 'workspace_a' }
    );

    const first = await findOrCreateCustomer(db, {
      organizationId: 'org_a',
      externalId: records[0]?.customerExternalId,
      name: records[0]?.customerName,
      domain: records[0]?.domain
    });
    const second = await findOrCreateCustomer(db, {
      organizationId: 'org_a',
      externalId: records[1]?.customerExternalId,
      name: records[1]?.customerName,
      domain: records[1]?.domain
    });

    expect(first.customerId).toBe(second.customerId);
    expect(db.customers).toHaveLength(1);
  });

  it('reuses usage CSV customers by domain when the external id differs', async () => {
    const db = new FakeCustomerDb([
      { id: 'customer_alpha', organization_id: 'org_a', external_id: 'alpha-old', name: 'Alpha Retail Ltd.', domain: 'alpha.com' }
    ]);
    const records = parseUsageCsv(
      [
        'customer_external_id,customer_name,domain,period_start,period_end,metric_name,quantity',
        'alpha-new,Alpha Retail Limited,https://www.alpha.com,2026-03-01,2026-03-31,seats,120'
      ].join('\n'),
      { sourceDocumentId: 'doc_usage', workspaceId: 'workspace_a' }
    );

    const assignment = await findOrCreateCustomer(db, {
      organizationId: 'org_a',
      externalId: records[0]?.customerExternalId,
      name: records[0]?.customerName,
      domain: records[0]?.domain
    });

    expect(assignment).toMatchObject({ customerId: 'customer_alpha', matchedBy: 'domain' });
    expect(db.customers).toHaveLength(1);
  });

  it('lets extracted contract terms inherit the resolved customer_id', async () => {
    const db = new FakeCustomerDb([{ id: 'customer_alpha', organization_id: 'org_a', name: 'Alpha Retail Cloud Ltd.' }]);
    const assignment = await findOrCreateCustomer(db, {
      organizationId: 'org_a',
      name: 'Customer: Alpha Retail Cloud'
    });
    const extractedTerms = ['minimum_commitment', 'seat_price', 'contract_end_date'].map((termType) => ({
      term_type: termType,
      customer_id: assignment.customerId
    }));

    expect(extractedTerms.every((term) => term.customer_id === 'customer_alpha')).toBe(true);
  });

  it('rejects cross-org customer IDs', async () => {
    const db = new FakeCustomerDb([{ id: 'customer_a', organization_id: 'org_a', external_id: 'alpha', name: 'Alpha Ltd.' }]);

    await expect(assertCustomerBelongsToOrg(db, 'org_b', 'customer_a')).rejects.toThrow('forbidden');
  });
});

class FakeCustomerDb {
  customers: CustomerRecord[];
  private nextId = 1;

  constructor(customers: CustomerRecord[] = []) {
    this.customers = customers;
  }

  from(table: string) {
    if (table !== 'customers') throw new Error(`Unexpected table ${table}`);
    return new FakeQuery(this);
  }

  createId(): string {
    const id = `customer_${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeQuery {
  private operation: 'select' | 'insert' | 'update' = 'select';
  private values: unknown;
  private filters: Array<{ column: string; value: unknown }> = [];
  private maxRows: number | null = null;

  constructor(private readonly db: FakeCustomerDb) {}

  select() {
    return this;
  }

  insert(values: unknown) {
    this.operation = 'insert';
    this.values = values;
    return this;
  }

  update(values: unknown) {
    this.operation = 'update';
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  is(column: string, value: null) {
    this.filters.push({ column, value });
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  async maybeSingle() {
    const { data, error } = await this.execute();
    return { data: Array.isArray(data) ? data[0] ?? null : data, error };
  }

  async single() {
    const { data, error } = await this.execute();
    return { data: Array.isArray(data) ? data[0] ?? null : data, error };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: unknown }> {
    if (this.operation === 'insert') {
      const row = { id: this.db.createId(), ...(this.values as Record<string, unknown>) } as CustomerRecord;
      this.db.customers.push(row);
      return { data: row, error: null };
    }

    if (this.operation === 'update') {
      const rows = this.matchingRows();
      rows.forEach((row) => Object.assign(row, this.values));
      return { data: rows[0] ?? null, error: null };
    }

    const rows = this.matchingRows();
    return { data: this.maxRows === 1 ? rows.slice(0, 1) : rows, error: null };
  }

  private matchingRows(): CustomerRecord[] {
    return this.db.customers.filter((row) =>
      this.filters.every((filter) => row[filter.column as keyof CustomerRecord] === filter.value)
    );
  }
}
