type Queryable = {
  from(table: string): {
    select(columns?: string): unknown;
  };
};

type ChainableQuery = {
  eq(column: string, value: unknown): ChainableQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
};

export async function assertWorkspaceRowBelongsToOrganization(
  supabase: Queryable,
  organizationId: string,
  workspaceId: string
): Promise<void> {
  const { data, error } = await queryByScope(supabase, 'audit_workspaces')
    .eq('id', workspaceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('forbidden');
  }
}

export async function assertSourceDocumentBelongsToWorkspace(
  supabase: Queryable,
  input: { organizationId: string; workspaceId: string; documentId: string }
): Promise<void> {
  const { data, error } = await queryByScope(supabase, 'source_documents')
    .eq('id', input.documentId)
    .eq('organization_id', input.organizationId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('forbidden');
  }
}

function queryByScope(supabase: Queryable, table: string): ChainableQuery {
  const query = supabase.from(table).select('id');
  if (!isChainableQuery(query)) {
    throw new Error('invalid_database_client');
  }
  return query;
}

function isChainableQuery(value: unknown): value is ChainableQuery {
  return (
    typeof value === 'object' &&
    value !== null &&
    'eq' in value &&
    'maybeSingle' in value &&
    typeof (value as { eq?: unknown }).eq === 'function' &&
    typeof (value as { maybeSingle?: unknown }).maybeSingle === 'function'
  );
}
