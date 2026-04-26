import { describe, expect, it } from 'vitest';
import { assertSourceDocumentBelongsToWorkspace, assertWorkspaceRowBelongsToOrganization } from './boundaries';

describe('database tenant boundary helpers', () => {
  it('accepts a workspace only inside its organization', async () => {
    const db = new FakeBoundaryDb({
      audit_workspaces: [{ id: 'workspace_a', organization_id: 'org_a' }],
      source_documents: []
    });

    await expect(assertWorkspaceRowBelongsToOrganization(db, 'org_a', 'workspace_a')).resolves.toBeUndefined();
    await expect(assertWorkspaceRowBelongsToOrganization(db, 'org_b', 'workspace_a')).rejects.toThrow('forbidden');
  });

  it('rejects a document from a different workspace even inside the same organization', async () => {
    const db = new FakeBoundaryDb({
      audit_workspaces: [],
      source_documents: [{ id: 'doc_a', organization_id: 'org_a', workspace_id: 'workspace_a' }]
    });

    await expect(
      assertSourceDocumentBelongsToWorkspace(db, {
        organizationId: 'org_a',
        workspaceId: 'workspace_a',
        documentId: 'doc_a'
      })
    ).resolves.toBeUndefined();
    await expect(
      assertSourceDocumentBelongsToWorkspace(db, {
        organizationId: 'org_a',
        workspaceId: 'workspace_b',
        documentId: 'doc_a'
      })
    ).rejects.toThrow('forbidden');
  });
});

type BoundaryRow = Record<string, unknown>;

class FakeBoundaryDb {
  constructor(private readonly tables: Record<string, BoundaryRow[]>) {}

  from(table: string) {
    return new FakeBoundaryQuery(this.tables[table] ?? []);
  }
}

class FakeBoundaryQuery {
  private filters: Array<{ column: string; value: unknown }> = [];

  constructor(private readonly rows: BoundaryRow[]) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  async maybeSingle() {
    const row = this.rows.find((candidate) => this.filters.every((filter) => candidate[filter.column] === filter.value));
    return { data: row ?? null, error: null };
  }
}
