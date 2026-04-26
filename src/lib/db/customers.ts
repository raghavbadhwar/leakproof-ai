type DbClient = {
  from: (table: string) => DbTable;
};

type DbTable = {
  select: (columns?: string) => DbQuery;
  insert: (values: unknown) => DbQuery;
  update: (values: unknown) => DbQuery;
};

type DbQuery = {
  select: (columns?: string) => DbQuery;
  insert: (values: unknown) => DbQuery;
  update: (values: unknown) => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  is: (column: string, value: null) => DbQuery;
  limit: (count: number) => DbQuery;
  maybeSingle: () => Promise<DbResult<unknown>>;
  single: () => Promise<DbResult<unknown>>;
  then: Promise<DbResult<unknown>>['then'];
};

type DbResult<T> = {
  data: T | null;
  error: unknown;
};

type CustomerRow = {
  id: string;
  external_id?: string | null;
  name: string;
  domain?: string | null;
};

export type CustomerIdentityInput = {
  organizationId: string;
  customerId?: string;
  externalId?: string;
  name?: string;
  segment?: string;
  billingModel?: string;
  contractType?: string;
  contractValueMinor?: number;
  currency?: string;
  renewalDate?: string;
  ownerLabel?: string;
  domain?: string;
};

export type CustomerAssignment = {
  customerId: string | null;
  matchedBy: 'customer_id' | 'customer_external_id' | 'domain' | 'customer_name' | 'created' | 'unassigned';
  confidence: number;
  reviewNeeded: boolean;
};

export async function resolveCustomerForUpload(supabase: unknown, input: CustomerIdentityInput): Promise<CustomerAssignment> {
  const identity = normalizeCustomerIdentity(input);
  if (identity.customerId) {
    await assertCustomerBelongsToOrg(supabase, identity.organizationId, identity.customerId);
    await patchCustomerMetadata(supabase, identity.organizationId, identity.customerId, customerMetadataPatch(identity), { onlyMissingExternalId: true });
    return {
      customerId: identity.customerId,
      matchedBy: 'customer_id',
      confidence: 1,
      reviewNeeded: false
    };
  }

  return findOrCreateCustomer(supabase, identity);
}

export async function findOrCreateCustomer(supabase: unknown, input: CustomerIdentityInput): Promise<CustomerAssignment> {
  const identity = normalizeCustomerIdentity(input);
  const metadataPatch = customerMetadataPatch(identity);

  if (identity.externalId) {
    const existing = await findCustomerByExternalId(supabase, identity.organizationId, identity.externalId);
    if (existing) {
      await patchCustomerMetadata(supabase, identity.organizationId, existing.id, metadataPatch, { onlyMissingExternalId: true });
      return { customerId: existing.id, matchedBy: 'customer_external_id', confidence: 0.98, reviewNeeded: false };
    }
  }

  if (identity.domain) {
    const existing = await findCustomerByDomain(supabase, identity.organizationId, identity.domain);
    if (existing) {
      await patchCustomerMetadata(supabase, identity.organizationId, existing.id, metadataPatch, { onlyMissingExternalId: true });
      return { customerId: existing.id, matchedBy: 'domain', confidence: 0.9, reviewNeeded: false };
    }
  }

  if (identity.name) {
    const existing = await findCustomerByNormalizedName(supabase, identity.organizationId, identity.name);
    if (existing) {
      await patchCustomerMetadata(supabase, identity.organizationId, existing.id, metadataPatch, { onlyMissingExternalId: true });
      return { customerId: existing.id, matchedBy: 'customer_name', confidence: 0.82, reviewNeeded: false };
    }
  }

  const fallbackName = identity.name ?? identity.externalId ?? identity.domain;
  if (!fallbackName) {
    return { customerId: null, matchedBy: 'unassigned', confidence: 0, reviewNeeded: true };
  }

  const { data, error } = await from(supabase, 'customers')
    .insert({
      organization_id: identity.organizationId,
      external_id: identity.externalId,
      name: fallbackName,
      ...metadataPatch
    })
    .select('id')
    .single();
  throwIfDbError(error);

  return {
    customerId: asCustomerId(data),
    matchedBy: 'created',
    confidence: identity.externalId ? 0.86 : identity.domain ? 0.76 : 0.68,
    reviewNeeded: true
  };
}

export async function assertCustomerBelongsToOrg(supabase: unknown, organizationId: string, customerId: string): Promise<void> {
  const { data, error } = await from(supabase, 'customers')
    .select('id')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  throwIfDbError(error);

  if (!data) {
    throw new Error('forbidden');
  }
}

function normalizeCustomerIdentity(input: CustomerIdentityInput): CustomerIdentityInput {
  return {
    ...input,
    customerId: cleanText(input.customerId),
    externalId: cleanText(input.externalId),
    name: cleanCustomerName(input.name),
    domain: normalizeDomain(input.domain),
    segment: cleanText(input.segment),
    billingModel: cleanText(input.billingModel),
    contractType: cleanText(input.contractType),
    currency: cleanText(input.currency)?.toUpperCase(),
    renewalDate: cleanText(input.renewalDate),
    ownerLabel: cleanText(input.ownerLabel)
  };
}

function customerMetadataPatch(input: CustomerIdentityInput): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      external_id: input.externalId,
      name: input.name,
      segment: input.segment,
      billing_model: input.billingModel,
      contract_type: input.contractType,
      contract_value_minor: input.contractValueMinor,
      currency: input.currency,
      renewal_date: input.renewalDate,
      owner_label: input.ownerLabel,
      domain: input.domain
    }).filter(([, value]) => value !== undefined && value !== '')
  );
}

async function findCustomerByExternalId(supabase: unknown, organizationId: string, externalId: string): Promise<CustomerRow | null> {
  const { data, error } = await from(supabase, 'customers')
    .select('id, external_id, name, domain')
    .eq('organization_id', organizationId)
    .eq('external_id', externalId)
    .maybeSingle();
  throwIfDbError(error);
  return asCustomerRow(data);
}

async function findCustomerByDomain(supabase: unknown, organizationId: string, domain: string): Promise<CustomerRow | null> {
  const { data, error } = await from(supabase, 'customers')
    .select('id, external_id, name, domain')
    .eq('organization_id', organizationId)
    .eq('domain', domain)
    .limit(1)
    .maybeSingle();
  throwIfDbError(error);
  return asCustomerRow(data);
}

async function findCustomerByNormalizedName(supabase: unknown, organizationId: string, name: string): Promise<CustomerRow | null> {
  const { data, error } = await from(supabase, 'customers')
    .select('id, external_id, name, domain')
    .eq('organization_id', organizationId);
  throwIfDbError(error);

  if (!Array.isArray(data)) return null;

  const normalizedName = normalizeNameForMatch(name);
  return data.map(asCustomerRow).find((customer) => customer && normalizeNameForMatch(customer.name) === normalizedName) ?? null;
}

async function patchCustomerMetadata(
  supabase: unknown,
  organizationId: string,
  customerId: string,
  patch: Record<string, unknown>,
  options: { onlyMissingExternalId: boolean }
): Promise<void> {
  const cleanPatch = { ...patch };
  if (Object.keys(cleanPatch).length === 0) return;

  if (options.onlyMissingExternalId && cleanPatch.external_id) {
    const { data, error } = await from(supabase, 'customers')
      .select('external_id')
      .eq('id', customerId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    throwIfDbError(error);
    const existing = data as { external_id?: string | null } | null;
    if (existing?.external_id) {
      delete cleanPatch.external_id;
    }
  }

  if (Object.keys(cleanPatch).length === 0) return;

  const { error } = await from(supabase, 'customers')
    .update(cleanPatch)
    .eq('id', customerId)
    .eq('organization_id', organizationId);
  throwIfDbError(error);
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function cleanCustomerName(value: string | undefined): string | undefined {
  const cleaned = cleanText(value)
    ?.replace(/^\s*(customer|client|account)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

function normalizeDomain(value: string | undefined): string | undefined {
  const cleaned = cleanText(value)
    ?.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    ?.trim();
  return cleaned || undefined;
}

function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\b(ltd|limited|inc|incorporated|llc|corp|corporation|co|company)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asCustomerRow(data: unknown): CustomerRow | null {
  if (!isRecord(data) || typeof data.id !== 'string' || typeof data.name !== 'string') return null;
  return {
    id: data.id,
    name: data.name,
    external_id: typeof data.external_id === 'string' ? data.external_id : null,
    domain: typeof data.domain === 'string' ? data.domain : null
  };
}

function asCustomerId(data: unknown): string {
  if (!isRecord(data) || typeof data.id !== 'string') {
    throw new Error('Customer creation did not return an id.');
  }
  return data.id;
}

function throwIfDbError(error: unknown): void {
  if (error) throw error instanceof Error ? error : new Error('Database operation failed.');
}

function from(supabase: unknown, table: string): DbTable {
  return (supabase as DbClient).from(table);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
