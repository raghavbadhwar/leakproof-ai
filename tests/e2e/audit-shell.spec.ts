import { expect, type Page, type Route, test } from '@playwright/test';

const organizationId = 'org_e2e';
const workspaceId = 'workspace_e2e';
const customerId = 'customer_alpha';
const findingId = 'finding_minimum_commitment';
const expectedLeakageMinor = 2_669_000;
const supabaseStorageKey = 'sb-abcdefghijklmnopqrst-auth-token';

const documents = [
  {
    id: 'doc_contract',
    customer_id: customerId,
    document_type: 'contract',
    file_name: 'alpha-contract.txt',
    mime_type: 'text/plain',
    size_bytes: 4096,
    parse_status: 'parsed',
    extracted_text_status: 'ready',
    chunking_status: 'chunked',
    embedding_status: 'embedded',
    created_at: '2026-04-01T00:00:00.000Z'
  },
  {
    id: 'doc_invoice',
    customer_id: customerId,
    document_type: 'invoice_csv',
    file_name: 'alpha-invoices.csv',
    mime_type: 'text/csv',
    size_bytes: 2048,
    parse_status: 'parsed',
    extracted_text_status: 'ready',
    chunking_status: 'chunked',
    embedding_status: 'embedded',
    created_at: '2026-04-01T00:00:00.000Z'
  },
  {
    id: 'doc_usage',
    customer_id: customerId,
    document_type: 'usage_csv',
    file_name: 'alpha-usage.csv',
    mime_type: 'text/csv',
    size_bytes: 2048,
    parse_status: 'parsed',
    extracted_text_status: 'ready',
    chunking_status: 'chunked',
    embedding_status: 'embedded',
    created_at: '2026-04-01T00:00:00.000Z'
  }
];

const customers = [
  {
    id: customerId,
    external_id: 'alpha',
    name: 'Alpha Logistics',
    domain: 'alpha.example'
  }
];

const terms = [
  {
    id: 'term_minimum',
    source_document_id: 'doc_contract',
    customer_id: customerId,
    term_type: 'minimum_commitment',
    term_value: {
      amount_minor: 1200000,
      currency: 'USD',
      billing_period: 'monthly'
    },
    confidence: 0.94,
    review_status: 'approved',
    citation: {
      label: 'Contract section 4.1',
      excerpt: 'Minimum commitment is USD 12,000 per month.'
    },
    reviewer_user_id: 'user_e2e',
    reviewed_at: '2026-04-02T00:00:00.000Z',
    updated_at: '2026-04-02T00:00:00.000Z'
  }
];

const findings = [
  {
    id: findingId,
    customer_id: customerId,
    finding_type: 'minimum_commitment_shortfall',
    outcome_type: 'recoverable_leakage',
    severity: 'high',
    title: 'Minimum commitment shortfall',
    summary: 'Approved minimum commitment exceeded billed revenue for the audit period.',
    detailed_explanation: 'The invoice rows are below the approved minimum commitment.',
    estimated_amount_minor: expectedLeakageMinor,
    currency: 'USD',
    confidence: 0.92,
    status: 'approved',
    calculation: {
      formula: 'approved minimum commitment - billed amount',
      approved_minimum_minor: 1200000,
      billed_minor: 933100
    },
    evidence_coverage_status: 'complete',
    recommended_action: 'Review with finance before customer outreach.',
    review_note: 'Approved for internal QA fixture only.',
    reviewer_user_id: 'user_e2e',
    reviewed_at: '2026-04-03T00:00:00.000Z',
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z'
  }
];

const evidence = [
  {
    id: 'evidence_contract',
    evidence_type: 'contract_clause',
    citation: {
      label: 'Contract section 4.1',
      excerpt: 'Minimum commitment is USD 12,000 per month.',
      sourceType: 'contract'
    },
    excerpt: 'Minimum commitment is USD 12,000 per month.',
    approval_state: 'approved',
    retrieval_score: 0.98,
    relevance_explanation: 'Directly supports the minimum commitment calculation.'
  }
];

const evidenceCandidates = [
  {
    id: 'candidate_contract',
    finding_id: findingId,
    document_chunk_id: 'chunk_contract',
    retrieval_score: 0.98,
    relevance_explanation: 'Directly supports the minimum commitment calculation.',
    approval_state: 'approved',
    created_at: '2026-04-03T00:00:00.000Z',
    document_chunk: {
      source_label: 'alpha-contract.txt:4.1',
      content: 'Minimum commitment is USD 12,000 per month.'
    }
  }
];

const analytics = {
  currency: 'USD',
  generatedAt: '2026-04-03T00:00:00.000Z',
  customerFacing: {
    label: 'Customer-facing leakage',
    description: 'Only approved findings are included.',
    statuses: ['approved', 'customer_ready', 'recovered'],
    totalLeakageMinor: expectedLeakageMinor,
    recoverableLeakageMinor: expectedLeakageMinor,
    preventedLeakageMinor: 0,
    recoveredLeakageMinor: 0,
    findingCount: 1,
    byCategory: [{ label: 'Minimum commitment shortfall', value: expectedLeakageMinor, amountMinor: expectedLeakageMinor, count: 1 }],
    byCustomer: [{ label: 'Alpha Logistics', value: expectedLeakageMinor, amountMinor: expectedLeakageMinor, count: 1 }],
    bySegment: [{ label: 'Logistics', value: expectedLeakageMinor, amountMinor: expectedLeakageMinor, count: 1 }],
    byBillingModel: [{ label: 'Usage-based', value: expectedLeakageMinor, amountMinor: expectedLeakageMinor, count: 1 }],
    trend: [{ period: '2026-04', identifiedMinor: expectedLeakageMinor, approvedMinor: expectedLeakageMinor, recoveredMinor: 0, preventedMinor: 0, internalPipelineMinor: 0 }],
    discountTrend: [],
    upliftTrend: [],
    recoveryPerformance: [],
    concentrationRisk: [{ label: 'Alpha Logistics', value: expectedLeakageMinor, amountMinor: expectedLeakageMinor, count: 1 }]
  },
  internalPipeline: {
    label: 'Internal pipeline',
    description: 'Draft and needs-review findings remain internal.',
    statuses: ['draft', 'needs_review'],
    unapprovedExposureMinor: 0,
    findingCount: 0,
    needsReviewCount: 0,
    byCategory: [],
    byStatus: [],
    byContractType: [{ label: 'Order form', value: expectedLeakageMinor, amountMinor: expectedLeakageMinor, count: 1 }],
    trend: [],
    topUnapproved: []
  },
  reviewBurden: {
    label: 'Needs finance review',
    description: 'Human review queue.',
    allStatuses: [{ label: 'Approved', value: 1, count: 1 }],
    confidenceDistribution: [{ label: '90-100%', value: 1, count: 1 }],
    evidenceCoverage: [{ label: 'Complete', value: 1, count: 1 }],
    reviewerWorkload: [{ label: 'Finance reviewer', value: 1, count: 1 }],
    averageReviewTurnaroundHours: 4
  },
  operations: {
    documentPipeline: [
      { label: 'Uploaded', value: 3, count: 3 },
      { label: 'Parsed', value: 3, count: 3 },
      { label: 'Embedded', value: 3, count: 3 }
    ],
    contractHealth: [{ label: 'Approved terms', value: 1, count: 1 }],
    usageVariance: [{ label: 'Alpha Logistics seats', value: 20, count: 1 }],
    renewalCalendar: [{ label: '2026-09', value: 1, count: 1 }],
    recurringPatterns: [{ label: 'Minimum commitment shortfall', value: 1, count: 1 }]
  }
};

test.beforeEach(async ({ context, page, baseURL }) => {
  const session = createSession();
  const serialized = JSON.stringify(session);
  const appUrl = baseURL ?? 'http://127.0.0.1:3120';

  await context.addCookies([
    {
      name: supabaseStorageKey,
      value: `base64-${Buffer.from(serialized).toString('base64url')}`,
      url: appUrl,
      expires: session.expires_at,
      sameSite: 'Lax'
    }
  ]);
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: supabaseStorageKey, value: serialized }
  );
  await mockAuditApi(page);
});

test('mocked audit shell renders the core production workflow pages', async ({ page }) => {
  const workflowPages = [
    { path: '/app', title: 'Audit Overview', proof: 'Recoverable leakage' },
    { path: '/app/uploads', title: 'Source documents', proof: 'Document processing pipeline' },
    { path: '/app/findings', title: 'Revenue findings', proof: 'Minimum commitment shortfall' },
    { path: '/app/analytics', title: 'Analytics', proof: 'Customer-facing leakage' },
    { path: '/app/reports', title: 'Customer-ready report', proof: 'Approved findings only' }
  ];

  for (const workflowPage of workflowPages) {
    await page.goto(workflowPage.path);

    await expect(page.getByRole('heading', { name: workflowPage.title }).first()).toBeVisible();
    await expect(page.getByText('E2E Customer Org').first()).toBeVisible();
    await expect(page.getByText('Revenue Leakage Audit').first()).toBeVisible();
    await expect(page.getByText(workflowPage.proof).first()).toBeVisible();
  }

  await expect(page.getByText('USD 26,690.00').first()).toBeVisible();
});

async function mockAuditApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/organizations') {
      return fulfillJson(route, {
        organizations: [
          {
            role: 'owner',
            organization: {
              id: organizationId,
              name: 'E2E Customer Org'
            }
          }
        ]
      });
    }

    if (path === `/api/organizations/${organizationId}/members`) {
      return fulfillJson(route, {
        members: [
          {
            id: 'member_owner',
            user_id: 'user_e2e',
            role: 'owner',
            created_at: '2026-04-01T00:00:00.000Z'
          }
        ]
      });
    }

    if (path === `/api/organizations/${organizationId}/invites`) {
      return fulfillJson(route, { invites: [] });
    }

    if (path === '/api/workspaces') {
      return fulfillJson(route, {
        workspaces: [
          {
            id: workspaceId,
            name: 'Revenue Leakage Audit',
            status: 'active'
          }
        ]
      });
    }

    if (path === '/api/documents') return fulfillJson(route, { documents });
    if (path === '/api/customers') return fulfillJson(route, { customers });
    if (path === '/api/contract-terms') return fulfillJson(route, { terms });
    if (path === '/api/findings') return fulfillJson(route, { findings });
    if (path === `/api/findings/${findingId}`) return fulfillJson(route, { finding: findings[0], evidence });
    if (path === '/api/invoice-records') {
      return fulfillJson(route, {
        records: [
          {
            id: 'invoice_alpha',
            invoice_id: 'INV-ALPHA-001',
            invoice_date: '2026-04-30',
            line_item: 'Platform minimum',
            amount_minor: 933100,
            currency: 'USD'
          }
        ]
      });
    }
    if (path === '/api/usage-records') {
      return fulfillJson(route, {
        records: [
          {
            id: 'usage_alpha',
            period_start: '2026-04-01',
            period_end: '2026-04-30',
            metric_name: 'active_seats',
            quantity: 120
          }
        ]
      });
    }
    if (path === '/api/evidence-candidates') return fulfillJson(route, { candidates: evidenceCandidates });
    if (path === `/api/workspaces/${workspaceId}/analytics`) return fulfillJson(route, { analytics });

    return fulfillJson(route, { error: `Unmocked E2E API route: ${path}` }, 404);
  });
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function createSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const user = {
    id: 'user_e2e',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'finance-reviewer@example.com',
    app_metadata: {
      provider: 'email',
      providers: ['email']
    },
    user_metadata: {},
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z'
  };

  return {
    access_token: createJwt({ sub: user.id, email: user.email, role: user.role, exp: expiresAt }),
    refresh_token: 'e2e-refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user
  };
}

function createJwt(payload: Record<string, unknown>) {
  const header = { alg: 'HS256', typ: 'JWT' };
  return [
    Buffer.from(JSON.stringify(header)).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'e2e-signature'
  ].join('.');
}
