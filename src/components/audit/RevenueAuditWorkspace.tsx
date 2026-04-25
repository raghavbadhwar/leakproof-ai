'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  FolderKanban,
  Link2,
  Loader2,
  Play,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  XCircle
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/db/supabaseBrowser';

type Organization = {
  id: string;
  name: string;
  role: OrganizationRole;
};

type OrganizationRole = 'owner' | 'admin' | 'reviewer' | 'member' | 'viewer';

type OrganizationMember = {
  id: string;
  user_id: string;
  role: OrganizationRole;
  created_at: string;
};

type Workspace = {
  id: string;
  name: string;
  status: string;
};

type SourceDocument = {
  id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  parse_status: string;
  chunking_status?: string;
  embedding_status?: string;
  created_at: string;
};

type ContractTermRow = {
  id: string;
  term_type: string;
  term_value: unknown;
  confidence: number;
  review_status: string;
  citation: { label?: string; excerpt?: string };
};

type FindingRow = {
  id: string;
  finding_type: string;
  outcome_type?: string;
  title: string;
  summary: string;
  estimated_amount_minor: number;
  currency: string;
  confidence: number;
  status: string;
  calculation: Record<string, unknown>;
  evidence_coverage_status?: string;
  recommended_action?: string | null;
  review_note?: string | null;
};

type EvidenceItemRow = {
  id: string;
  evidence_type: string;
  citation: { label?: string; excerpt?: string; sourceType?: string };
  excerpt?: string | null;
  approval_state: string;
  retrieval_score?: number | null;
  relevance_explanation?: string | null;
};

type EvidenceCandidateRow = {
  id: string;
  finding_id: string | null;
  document_chunk_id: string;
  retrieval_score: number;
  relevance_explanation?: string | null;
  approval_state: string;
  created_at: string;
  document_chunk: {
    source_label: string;
    content: string;
  } | null;
};

type FindingDetail = {
  finding: FindingRow;
  evidence: EvidenceItemRow[];
};

type InvoiceRow = {
  id: string;
  invoice_id: string;
  invoice_date: string;
  line_item: string;
  amount_minor: number;
  currency: string;
};

type UsageRow = {
  id: string;
  period_start: string;
  period_end: string;
  metric_name: string;
  quantity: number;
};

type SearchResult = {
  chunk_id: string;
  source_document_id: string;
  source_label: string;
  content: string;
  similarity: number;
};

type ExecutiveReport = {
  organizationName: string;
  workspaceName: string;
  generatedAt: string;
  totalPotentialLeakageMinor: number;
  totalApprovedRecoverableMinor: number;
  totalPreventedLeakageMinor: number;
  totalRiskOnlyItems: number;
  findingsByCategory: Record<string, number>;
  findingsByStatus: Record<string, number>;
  topFindings: Array<{
    id: string;
    title: string;
    findingType: string;
    outcomeType: string;
    status: string;
    amountMinor: number;
    currency: string;
    confidence: number;
  }>;
  methodologyNote: string;
  currency: string;
};

const documentTypes = [
  { value: 'contract', label: 'Contract' },
  { value: 'invoice_csv', label: 'Invoice CSV' },
  { value: 'usage_csv', label: 'Usage CSV' }
];

export function RevenueAuditWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [authError] = useState<string | null>(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return 'Supabase browser environment variables are missing.';
    }
    return null;
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [terms, setTerms] = useState<ContractTermRow[]>([]);
  const [termDrafts, setTermDrafts] = useState<Record<string, string>>({});
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState('');
  const [selectedFindingDetail, setSelectedFindingDetail] = useState<FindingDetail | null>(null);
  const [evidenceCandidates, setEvidenceCandidates] = useState<EvidenceCandidateRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [documentType, setDocumentType] = useState('contract');
  const [workspaceName, setWorkspaceName] = useState('Revenue Leakage Audit');
  const [organizationName, setOrganizationName] = useState('LeakProof Customer Org');
  const [searchQuery, setSearchQuery] = useState('annual uplift or minimum commitment');
  const [candidateFindingId, setCandidateFindingId] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [report, setReport] = useState<ExecutiveReport | null>(null);
  const [reportPackId, setReportPackId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const selectedOrg = organizations.find((org) => org.id === selectedOrgId);
  const selectedOrgCanManageRoles = selectedOrg ? ['owner', 'admin'].includes(selectedOrg.role) : false;
  const selectedContract = documents.find((document) => document.document_type === 'contract');
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId);
  const openFindings = findings.filter((finding) => ['draft', 'needs_review'].includes(finding.status));
  const approvedFindings = findings.filter((finding) => ['approved', 'customer_ready', 'recovered'].includes(finding.status));
  const totalExposure = findings.reduce((sum, finding) => sum + finding.estimated_amount_minor, 0);

  useEffect(() => {
    if (authError) return undefined;
    let mounted = true;

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [authError]);

  useEffect(() => {
    if (!session) return;
    startTransition(() => {
      refreshOrganizations(session).catch(showError);
    });
  }, [session]);

  useEffect(() => {
    if (!session || !selectedOrgId) return;
    startTransition(() => {
      Promise.all([
        refreshWorkspaces(session, selectedOrgId),
        refreshMembers(session, selectedOrgId)
      ]).catch(showError);
    });
  }, [session, selectedOrgId]);

  useEffect(() => {
    if (!session || !selectedOrgId || !selectedWorkspaceId) return;
    startTransition(() => {
      refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId).catch(showError);
    });
  }, [session, selectedOrgId, selectedWorkspaceId]);

  useEffect(() => {
    if (!session || !selectedOrgId || !selectedFindingId) return;

    startTransition(() => {
      refreshFindingDetail(session, selectedOrgId, selectedFindingId).catch(showError);
    });
  }, [session, selectedOrgId, selectedFindingId]);

  const findingMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const finding of findings) {
      counts.set(finding.finding_type, (counts.get(finding.finding_type) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [findings]);

  if (authError) {
    return <SetupBlock title="Environment setup required" detail={authError} />;
  }

  if (!session) {
    return (
      <SetupBlock
        title="Sign in to open the audit workspace"
        detail="Production access uses Supabase Auth. Sign in before uploading contracts or invoices."
        actionHref="/login"
        actionLabel="Go to sign in"
      />
    );
  }

  async function refreshOrganizations(activeSession: Session) {
    const payload = await apiFetch<{ organizations: Array<{ role: OrganizationRole; organization: Omit<Organization, 'role'> | Array<Omit<Organization, 'role'>> }> }>(
      activeSession,
      '/api/organizations'
    );
    const nextOrganizations = payload.organizations.flatMap((row) => {
      const organizationsForRow = Array.isArray(row.organization) ? row.organization : [row.organization];
      return organizationsForRow.filter(Boolean).map((organization) => ({
        ...organization,
        role: row.role
      }));
    }) as Organization[];
    setOrganizations(nextOrganizations);
    setSelectedOrgId((current) => current || nextOrganizations[0]?.id || '');
  }

  async function refreshMembers(activeSession: Session, organizationId: string) {
    const payload = await apiFetch<{ members: OrganizationMember[] }>(
      activeSession,
      `/api/organizations/${organizationId}/members`
    );
    setMembers(payload.members);
  }

  async function refreshWorkspaces(activeSession: Session, organizationId: string) {
    const payload = await apiFetch<{ workspaces: Workspace[] }>(
      activeSession,
      `/api/workspaces?organization_id=${organizationId}`
    );
    setWorkspaces(payload.workspaces);
    setSelectedWorkspaceId((current) => current || payload.workspaces[0]?.id || '');
  }

  async function refreshWorkspaceData(activeSession: Session, organizationId: string, workspaceId: string) {
    const query = `organization_id=${organizationId}&workspace_id=${workspaceId}`;
    const [documentPayload, termPayload, findingPayload, invoicePayload, usagePayload, candidatePayload] = await Promise.all([
      apiFetch<{ documents: SourceDocument[] }>(activeSession, `/api/documents?${query}`),
      apiFetch<{ terms: ContractTermRow[] }>(activeSession, `/api/contract-terms?${query}`),
      apiFetch<{ findings: FindingRow[] }>(activeSession, `/api/findings?${query}`),
      apiFetch<{ records: InvoiceRow[] }>(activeSession, `/api/invoice-records?${query}`),
      apiFetch<{ records: UsageRow[] }>(activeSession, `/api/usage-records?${query}`),
      apiFetch<{ candidates: EvidenceCandidateRow[] }>(activeSession, `/api/evidence-candidates?${query}`)
    ]);

    setDocuments(documentPayload.documents);
    setTerms(termPayload.terms);
    setTermDrafts(Object.fromEntries(termPayload.terms.map((term) => [term.id, previewValue(term.term_value)])));
    setFindings(findingPayload.findings);
    setSelectedFindingId((current) =>
      findingPayload.findings.some((finding) => finding.id === current) ? current : findingPayload.findings[0]?.id ?? ''
    );
    setCandidateFindingId((current) =>
      findingPayload.findings.some((finding) => finding.id === current) ? current : findingPayload.findings[0]?.id ?? ''
    );
    if (findingPayload.findings.length === 0) {
      setSelectedFindingDetail(null);
    }
    setInvoices(invoicePayload.records);
    setUsage(usagePayload.records);
    setEvidenceCandidates(candidatePayload.candidates);
  }

  async function refreshFindingDetail(activeSession: Session, organizationId: string, findingId: string) {
    const payload = await apiFetch<FindingDetail>(
      activeSession,
      `/api/findings/${findingId}?organization_id=${organizationId}`
    );
    setSelectedFindingDetail(payload);
  }

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : 'Something went wrong.');
  }

  function runTask(task: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(() => {
      task().catch(showError);
    });
  }

  function requireActiveSession(): Session {
    if (!session) {
      throw new Error('Sign in again before continuing.');
    }
    return session;
  }

  async function updateMemberRole(memberId: string, role: OrganizationRole) {
    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/organizations/${selectedOrgId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: selectedOrgId, role })
    });
    setMessage('Member role updated.');
    await Promise.all([
      refreshMembers(activeSession, selectedOrgId),
      refreshOrganizations(activeSession)
    ]);
  }

  async function updateTerm(term: ContractTermRow, reviewStatus: 'approved' | 'edited' | 'needs_review' | 'rejected', includeDraft = false) {
    const body: Record<string, unknown> = {
      organization_id: selectedOrgId,
      review_status: reviewStatus
    };

    if (includeDraft) {
      body.term_value = parseJsonDraft(termDrafts[term.id] ?? previewValue(term.term_value));
    }

    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/contract-terms/${term.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    setMessage(reviewStatus === 'approved' ? 'Term approved.' : 'Term review saved.');
    await refreshWorkspaceData(activeSession, selectedOrgId, selectedWorkspaceId);
  }

  async function attachEvidenceCandidate(result: SearchResult) {
    if (!candidateFindingId) {
      setError('Choose a finding before attaching evidence.');
      return;
    }

    const activeSession = requireActiveSession();
    await apiFetch(activeSession, '/api/evidence-candidates', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: selectedOrgId,
        workspace_id: selectedWorkspaceId,
        finding_id: candidateFindingId,
        document_chunk_id: result.chunk_id,
        retrieval_score: result.similarity,
        relevance_explanation: `Reviewer attached this semantic search result for: ${searchQuery}`
      })
    });
    setMessage('Evidence candidate attached for review.');
    await refreshWorkspaceData(activeSession, selectedOrgId, selectedWorkspaceId);
  }

  async function decideEvidenceCandidate(candidateId: string, action: 'approve' | 'reject') {
    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/evidence-candidates/${candidateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: selectedOrgId, action })
    });
    setMessage(action === 'approve' ? 'Evidence candidate approved and attached.' : 'Evidence candidate rejected.');
    await refreshWorkspaceData(activeSession, selectedOrgId, selectedWorkspaceId);
    if (selectedFindingId) await refreshFindingDetail(activeSession, selectedOrgId, selectedFindingId);
  }

  async function removeEvidenceItem(evidenceItemId: string) {
    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/evidence-items/${evidenceItemId}`, {
      method: 'DELETE',
      body: JSON.stringify({ organization_id: selectedOrgId })
    });
    setMessage('Evidence item removed.');
    await refreshWorkspaceData(activeSession, selectedOrgId, selectedWorkspaceId);
    if (selectedFindingId) await refreshFindingDetail(activeSession, selectedOrgId, selectedFindingId);
  }

  async function exportReport(format: 'print_pdf' | 'json' | 'clipboard') {
    if (!report || !reportPackId) {
      setError('Generate a customer-ready report first.');
      return;
    }

    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/evidence-packs/${reportPackId}/export`, {
      method: 'POST',
      body: JSON.stringify({ organization_id: selectedOrgId, format })
    });

    if (format === 'clipboard') {
      await navigator.clipboard.writeText(reportToText(report));
      setMessage('Customer-ready report copied and marked exported.');
      return;
    }

    if (format === 'json') {
      downloadJson(report, `${report.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'leakproof-report'}.json`);
      setMessage('Customer-ready report downloaded and marked exported.');
      return;
    }

    setMessage('Report marked exported. Use print to save as PDF.');
    window.print();
  }

  return (
    <main className="audit-shell">
      <aside className="audit-sidebar">
        <div>
          <p className="eyebrow">LeakProof AI</p>
          <h1>Revenue audit workspace</h1>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace sections">
          <a href="#roles"><UserCog size={16} /> Roles</a>
          <a href="#uploads"><Upload size={16} /> Uploads</a>
          <a href="#search"><Search size={16} /> Evidence</a>
          <a href="#terms"><ClipboardCheck size={16} /> Terms</a>
          <a href="#records"><FileText size={16} /> Records</a>
          <a href="#findings"><AlertTriangle size={16} /> Findings</a>
          <a href="#report"><Printer size={16} /> Report</a>
        </nav>

        <div className="sidebar-panel">
          <span>Security posture</span>
          <p><ShieldCheck size={16} /> RLS, org checks, scoped storage, and audit logs are enforced server-side.</p>
        </div>
      </aside>

      <section className="audit-main">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>{selectedWorkspace?.name ?? 'Set up an audit workspace'}</h2>
          </div>
          <div className="header-actions">
            <select value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)} aria-label="Organization">
              <option value="">Select organization</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)} aria-label="Workspace">
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </div>
        </header>

        {error ? <div className="state-banner error"><XCircle size={18} /> {error}</div> : null}
        {message ? <div className="state-banner success"><CheckCircle2 size={18} /> {message}</div> : null}
        {isPending ? <div className="state-banner"><Loader2 className="spin" size={18} /> Updating workspace...</div> : null}

        <section className="setup-grid">
          <form
            className="control-panel"
            onSubmit={(event) => {
              event.preventDefault();
              runTask(async () => {
                const payload = await apiFetch<{ organization: Organization }>(session, '/api/organizations', {
                  method: 'POST',
                  body: JSON.stringify({ name: organizationName })
                });
                setMessage('Organization created.');
                await refreshOrganizations(session);
                setSelectedOrgId(payload.organization.id);
              });
            }}
          >
            <label>Organization</label>
            <div className="inline-controls">
              <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
              <button type="submit">Create</button>
            </div>
          </form>

          <form
            className="control-panel"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedOrgId) return setError('Select or create an organization first.');
              runTask(async () => {
                const payload = await apiFetch<Workspace>(session, '/api/workspaces', {
                  method: 'POST',
                  body: JSON.stringify({ organization_id: selectedOrgId, name: workspaceName })
                });
                setMessage('Workspace created.');
                await refreshWorkspaces(session, selectedOrgId);
                setSelectedWorkspaceId(payload.id);
              });
            }}
          >
            <label>Audit workspace</label>
            <div className="inline-controls">
              <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
              <button type="submit">Create</button>
            </div>
          </form>
        </section>

        <section id="roles" className="workspace-section">
          <SectionHeader icon={<UserCog size={18} />} title="Role management" detail="Owners and admins can change reviewer access. Members and viewers remain read-only for workflow mutations." />
          <DataTable
            columns={['User', 'Role', 'Created', 'Action']}
            rows={members.map((member) => [
              shortId(member.user_id),
              <select
                key={`${member.id}-role`}
                value={member.role}
                disabled={!selectedOrgCanManageRoles}
                onChange={(event) => runTask(() => updateMemberRole(member.id, event.target.value as OrganizationRole))}
                aria-label={`Role for ${member.user_id}`}
              >
                {(['owner', 'admin', 'reviewer', 'viewer'] as const).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>,
              formatDate(member.created_at),
              selectedOrgCanManageRoles ? 'Change the dropdown to save' : `Your role: ${selectedOrg?.role ?? 'member'}`
            ])}
            empty={selectedOrgId ? 'No members found for this organization.' : 'Select an organization to manage roles.'}
          />
        </section>

        <section className="metric-grid" aria-label="Audit summary">
          <Metric label="Potential exposure" value={formatMoney(totalExposure, findings[0]?.currency ?? 'USD')} />
          <Metric label="Open findings" value={String(openFindings.length)} />
          <Metric label="Approved findings" value={String(approvedFindings.length)} />
          <Metric label="Documents" value={String(documents.length)} />
        </section>

        <section id="uploads" className="workspace-section">
          <SectionHeader icon={<Upload size={18} />} title="Uploads" detail="Contracts, invoice exports, and usage exports are stored under org-scoped paths." />
          <form
            className="upload-bar"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
              const file = input.files?.[0];
              if (!file || !selectedOrgId || !selectedWorkspaceId) return setError('Choose a file and workspace first.');
              runTask(async () => {
                const form = new FormData();
                form.set('organization_id', selectedOrgId);
                form.set('workspace_id', selectedWorkspaceId);
                form.set('document_type', documentType);
                form.set('file', file);
                await apiFetch(session, '/api/documents/upload', { method: 'POST', body: form });
                setMessage('File uploaded and recorded.');
                await refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId);
                input.value = '';
              });
            }}
          >
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} aria-label="Document type">
              {documentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <input name="file" type="file" />
            <button type="submit"><Upload size={16} /> Upload</button>
          </form>
          <DataTable
            columns={['Type', 'File', 'Parse', 'Embedding', 'Size', 'Action']}
            rows={documents.map((document) => [
              document.document_type,
              document.file_name,
              document.parse_status,
              document.embedding_status ?? 'pending',
              `${Math.round(document.size_bytes / 1024)} KB`,
              <button
                key={document.id}
                onClick={() => {
                  if (!selectedOrgId || !selectedWorkspaceId) return setError('Select a workspace before embedding.');
                  runTask(async () => {
                    await apiFetch(session, `/api/workspaces/${selectedWorkspaceId}/documents/${document.id}/embed`, {
                      method: 'POST',
                      body: JSON.stringify({ organization_id: selectedOrgId })
                    });
                    setMessage('Embedding job completed.');
                    await refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId);
                  });
                }}
              >
                Embed
              </button>
            ])}
            empty="No source documents uploaded yet."
          />
        </section>

        <section id="search" className="workspace-section">
          <SectionHeader icon={<ShieldCheck size={18} />} title="Semantic evidence search" detail="Gemini embeddings suggest tenant-scoped evidence. A reviewer still decides what supports a finding." />
          <form
            className="upload-bar"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedOrgId || !selectedWorkspaceId) return setError('Select a workspace before searching evidence.');
              runTask(async () => {
                const payload = await apiFetch<{ results: SearchResult[] }>(session, `/api/workspaces/${selectedWorkspaceId}/semantic-search`, {
                  method: 'POST',
                  body: JSON.stringify({ organization_id: selectedOrgId, query: searchQuery, limit: 8 })
                });
                setSearchResults(payload.results);
                setMessage('Semantic evidence search completed.');
              });
            }}
          >
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Semantic search query" />
            <select value={candidateFindingId} onChange={(event) => setCandidateFindingId(event.target.value)} aria-label="Finding for evidence attachment">
              <option value="">Attach to finding...</option>
              {findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.title}</option>)}
            </select>
            <button type="submit"><Play size={16} /> Search evidence</button>
          </form>
          <DataTable
            columns={['Source', 'Similarity', 'Evidence preview', 'Action']}
            rows={searchResults.map((result) => [
              result.source_label,
              `${Math.round(result.similarity * 100)}%`,
              result.content.slice(0, 220),
              <button key={result.chunk_id} onClick={() => runTask(() => attachEvidenceCandidate(result))}>
                <Link2 size={16} /> Attach
              </button>
            ])}
            empty="No semantic evidence results yet."
          />
        </section>

        <section id="terms" className="workspace-section">
          <SectionHeader icon={<ClipboardCheck size={18} />} title="Extracted terms" detail="Human approval is required before reconciliation uses a term." />
          <div className="action-row">
            <button
              onClick={() => {
                if (!selectedOrgId || !selectedWorkspaceId || !selectedContract) return setError('Upload a text contract before running extraction.');
                runTask(async () => {
                  await apiFetch(session, '/api/extraction/run', {
                    method: 'POST',
                    body: JSON.stringify({
                      organization_id: selectedOrgId,
                      workspace_id: selectedWorkspaceId,
                      source_document_id: selectedContract.id
                    })
                  });
                  setMessage('Extraction completed.');
                  await refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId);
                });
              }}
            >
              <Play size={16} /> Run extraction
            </button>
          </div>
          <DataTable
            columns={['Term', 'Reviewed value', 'Confidence', 'Status', 'Citation', 'Action']}
            rows={terms.map((term) => [
              term.term_type,
              <textarea
                key={`${term.id}-value`}
                className="compact-textarea"
                value={termDrafts[term.id] ?? previewValue(term.term_value)}
                onChange={(event) => setTermDrafts((current) => ({ ...current, [term.id]: event.target.value }))}
                aria-label={`Reviewed value for ${term.term_type}`}
              />,
              `${Math.round(term.confidence * 100)}%`,
              term.review_status,
              <span key={`${term.id}-citation`} className="stacked-text">
                <strong>{term.citation?.label ?? 'Missing'}</strong>
                <span>{term.citation?.excerpt ?? 'No excerpt provided.'}</span>
              </span>,
              <span className="button-group" key={term.id}>
                <button onClick={() => runTask(() => updateTerm(term, 'approved'))}>
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button className="secondary-button" onClick={() => runTask(() => updateTerm(term, 'edited', true))}>
                  <Save size={16} /> Save edit
                </button>
                <button className="secondary-button" onClick={() => runTask(() => updateTerm(term, 'needs_review'))}>
                  Needs review
                </button>
                <button className="danger-button" onClick={() => runTask(() => updateTerm(term, 'rejected'))}>
                  Reject
                </button>
              </span>
            ])}
            empty="No extracted terms yet."
          />
        </section>

        <section id="records" className="workspace-section">
          <SectionHeader icon={<FileText size={18} />} title="Billing and usage records" detail="Invoice and usage CSVs are normalized into reviewable rows with row citations." />
          <div className="split-grid">
            <DataTable
              columns={['Invoice', 'Date', 'Line item', 'Amount']}
              rows={invoices.map((row) => [row.invoice_id, row.invoice_date, row.line_item, formatMoney(row.amount_minor, row.currency)])}
              empty="No invoice rows ingested."
            />
            <DataTable
              columns={['Period', 'Metric', 'Quantity']}
              rows={usage.map((row) => [`${row.period_start} to ${row.period_end}`, row.metric_name, String(row.quantity)])}
              empty="No usage rows ingested."
            />
          </div>
        </section>

        <section id="findings" className="workspace-section">
          <SectionHeader icon={<AlertTriangle size={18} />} title="Findings" detail="Every amount is calculated by deterministic code and must remain evidence-backed." />
          <div className="action-row">
            <button
              onClick={() => {
                if (!selectedOrgId || !selectedWorkspaceId) return setError('Select a workspace before reconciliation.');
                runTask(async () => {
                  await apiFetch(session, '/api/reconciliation/run', {
                    method: 'POST',
                    body: JSON.stringify({ organization_id: selectedOrgId, workspace_id: selectedWorkspaceId })
                  });
                  setMessage('Reconciliation completed.');
                  await refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId);
                });
              }}
            >
              <Play size={16} /> Run reconciliation
            </button>
          </div>
          <DataTable
            columns={['Finding', 'Outcome', 'Amount', 'Confidence', 'Status', 'Action']}
            rows={findings.map((finding) => [
              <strong key={`${finding.id}-title`}>{finding.title}</strong>,
              (finding.outcome_type ?? 'recoverable_leakage').replaceAll('_', ' '),
              formatMoney(finding.estimated_amount_minor, finding.currency),
              `${Math.round(finding.confidence * 100)}%`,
              finding.status,
              <span className="button-group" key={finding.id}>
                <button className="secondary-button" onClick={() => setSelectedFindingId(finding.id)}>
                  Details
                </button>
                {(['approved', 'dismissed', 'needs_review', 'customer_ready', 'recovered', 'not_recoverable'] as const).map((status) => (
                  <button
                    key={status}
                    className={['dismissed', 'not_recoverable'].includes(status) ? 'danger-button' : 'secondary-button'}
                    onClick={() => runTask(async () => {
                      await apiFetch(session, `/api/findings/${finding.id}/status?organization_id=${selectedOrgId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          status,
                          note: ['dismissed', 'not_recoverable'].includes(status) ? 'Manual reviewer decision from audit workspace.' : undefined
                        })
                      });
                      setMessage(`Finding marked ${status.replace('_', ' ')}.`);
                      await refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId);
                    })}
                  >
                    {status.replace('_', ' ')}
                  </button>
                ))}
              </span>
            ])}
            empty="No findings yet."
          />
          {selectedFinding ? (
            <FindingDetailPanel
              finding={selectedFindingDetail?.finding ?? selectedFinding}
              evidence={selectedFindingDetail?.evidence ?? []}
              candidates={evidenceCandidates.filter((candidate) => candidate.finding_id === selectedFinding.id)}
              onApproveCandidate={(candidateId) => runTask(() => decideEvidenceCandidate(candidateId, 'approve'))}
              onRejectCandidate={(candidateId) => runTask(() => decideEvidenceCandidate(candidateId, 'reject'))}
              onRemoveEvidence={(evidenceItemId) => runTask(() => removeEvidenceItem(evidenceItemId))}
            />
          ) : null}
        </section>

        <section id="report" className="workspace-section report-section">
          <SectionHeader icon={<Printer size={18} />} title="Customer-ready report" detail="Printable, copyable report that includes only human-approved customer-facing findings." />
          <div className="report-layout">
            <div>
              <h3>Finding mix</h3>
              {findingMix.length === 0 ? <p className="muted">No finding categories yet.</p> : findingMix.map(([type, count]) => (
                <p key={type}><strong>{type.replaceAll('_', ' ')}</strong>: {count}</p>
              ))}
            </div>
            <div>
              <h3>Approval controls</h3>
              <p className="muted">Customer-facing messages and invoice notes remain drafts until a human approves the finding.</p>
	              {report ? (
	                <div className="report-totals">
	                  <p><strong>{report.organizationName}</strong> / {report.workspaceName}</p>
	                  <p><strong>Total potential:</strong> {formatMoney(report.totalPotentialLeakageMinor, report.currency)}</p>
	                  <p><strong>Approved recoverable:</strong> {formatMoney(report.totalApprovedRecoverableMinor, report.currency)}</p>
	                  <p><strong>Prevented future leakage:</strong> {formatMoney(report.totalPreventedLeakageMinor, report.currency)}</p>
	                  <p><strong>Risk-only items:</strong> {report.totalRiskOnlyItems}</p>
	                  {report.topFindings.length > 0 ? (
	                    <ol className="report-list">
	                      {report.topFindings.map((finding) => (
	                        <li key={finding.id}>{finding.title} - {formatMoney(finding.amountMinor, finding.currency)}</li>
	                      ))}
	                    </ol>
	                  ) : <p className="muted">Approve findings before creating a customer-ready report.</p>}
	                  <p className="muted">{report.methodologyNote}</p>
	                </div>
	              ) : null}
              <button
                onClick={() => {
                  if (!selectedOrgId || !selectedWorkspaceId) return setError('Select a workspace before generating a report.');
                  runTask(async () => {
                    const payload = await apiFetch<{ report: ExecutiveReport; evidence_pack_id: string }>(session, `/api/workspaces/${selectedWorkspaceId}/report`, {
                      method: 'POST',
                      body: JSON.stringify({ organization_id: selectedOrgId })
                    });
                    setReport(payload.report);
                    setReportPackId(payload.evidence_pack_id);
                    setMessage('Executive report generated.');
                  });
                }}
              >
	                <FileText size={16} /> Generate customer-ready report
	              </button>
	              <button className="secondary-button" onClick={() => runTask(() => exportReport('clipboard'))}><ClipboardCheck size={16} /> Copy report</button>
	              <button className="secondary-button" onClick={() => runTask(() => exportReport('json'))}><Download size={16} /> Download JSON</button>
	              <button className="secondary-button" onClick={() => runTask(() => exportReport('print_pdf'))}><Printer size={16} /> Export PDF</button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionHeader({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="section-header">
      <div>{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function DataTable({ columns, rows, empty }: { columns: string[]; rows: Array<Array<React.ReactNode>>; empty: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty-cell">{empty}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingDetailPanel({
  finding,
  evidence,
  candidates,
  onApproveCandidate,
  onRejectCandidate,
  onRemoveEvidence
}: {
  finding: FindingRow;
  evidence: EvidenceItemRow[];
  candidates: EvidenceCandidateRow[];
  onApproveCandidate: (candidateId: string) => void;
  onRejectCandidate: (candidateId: string) => void;
  onRemoveEvidence: (evidenceItemId: string) => void;
}) {
  const formula = typeof finding.calculation?.formula === 'string' ? finding.calculation.formula : 'See calculation inputs';
  const uncertaintyNotes = [
    finding.confidence < 0.85 ? 'Confidence is below the normal approval threshold.' : null,
    evidence.length === 0 ? 'No approved evidence is attached yet.' : null,
    finding.evidence_coverage_status && finding.evidence_coverage_status !== 'complete' ? `Evidence coverage is ${finding.evidence_coverage_status}.` : null,
    finding.status === 'needs_review' ? 'A reviewer already marked this finding for follow-up.' : null
  ].filter((note): note is string => Boolean(note));
  const draftCustomerNote = [
    'Hi,',
    '',
    `During our billing reconciliation, we found a possible ${formatMoney(finding.estimated_amount_minor, finding.currency)} adjustment related to ${finding.finding_type.replaceAll('_', ' ')}.`,
    'Please review the supporting contract, invoice, and usage references before we include this on a future invoice.',
    '',
    'Can you confirm whether this adjustment matches your records?'
  ].join('\n');

  return (
    <div className="detail-panel">
      <div className="detail-grid">
        <div>
          <p className="eyebrow">Finding detail</p>
          <h3>{finding.title}</h3>
          <p>{finding.summary}</p>
        </div>
        <div className="detail-facts">
          <span>Category: {finding.finding_type.replaceAll('_', ' ')}</span>
          <span>Classification: {(finding.outcome_type ?? 'recoverable_leakage').replaceAll('_', ' ')}</span>
          <span>Amount: {formatMoney(finding.estimated_amount_minor, finding.currency)}</span>
          <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
          <span>Status: {finding.status.replaceAll('_', ' ')}</span>
          <span>Formula: {formula}</span>
        </div>
      </div>

      <div className="split-grid">
        <div>
          <h4>Inputs used</h4>
          <pre className="json-block">{JSON.stringify(finding.calculation, null, 2)}</pre>
        </div>
        <div>
          <h4>Recommended action</h4>
          <p>{finding.recommended_action ?? 'Review supporting evidence and decide whether this should become customer-ready.'}</p>
          <h4>Reviewer notes</h4>
          <p>{finding.review_note ?? 'No reviewer note yet.'}</p>
          <h4>Why this might be wrong</h4>
          {uncertaintyNotes.length === 0 ? (
            <p>Evidence and confidence look ready for final finance review.</p>
          ) : (
            <ul className="compact-list">
              {uncertaintyNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
          <h4>Draft customer note</h4>
          <pre className="note-block">{draftCustomerNote}</pre>
        </div>
      </div>

      <div>
        <h4>Attached evidence</h4>
        <DataTable
          columns={['Type', 'Status', 'Citation', 'Excerpt', 'Action']}
          rows={evidence.map((item) => [
            item.evidence_type.replaceAll('_', ' '),
            item.approval_state,
            item.citation?.label ?? 'Source',
            item.excerpt ?? item.citation?.excerpt ?? 'No excerpt saved.',
            <button className="danger-button" key={item.id} onClick={() => onRemoveEvidence(item.id)}>
              <Trash2 size={16} /> Remove
            </button>
          ])}
          empty="No attached evidence yet."
        />
      </div>

      <div>
        <h4>Evidence candidates</h4>
        <DataTable
          columns={['Document', 'Score', 'Status', 'Source chunk', 'Action']}
          rows={candidates.map((candidate) => [
            candidate.document_chunk?.source_label ?? 'Evidence chunk',
            `${Math.round(candidate.retrieval_score * 100)}%`,
            candidate.approval_state,
            candidate.document_chunk?.content?.slice(0, 220) ?? 'No preview available.',
            <span className="button-group" key={candidate.id}>
              <button onClick={() => onApproveCandidate(candidate.id)}><CheckCircle2 size={16} /> Approve</button>
              <button className="danger-button" onClick={() => onRejectCandidate(candidate.id)}>Reject</button>
            </span>
          ])}
          empty="No evidence candidates attached yet."
        />
      </div>
    </div>
  );
}

function SetupBlock({ title, detail, actionHref, actionLabel }: { title: string; detail: string; actionHref?: string; actionLabel?: string }) {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <FolderKanban size={32} />
        <h1>{title}</h1>
        <p>{detail}</p>
        {actionHref && actionLabel ? <a className="button-link" href={actionHref}>{actionLabel}</a> : null}
      </div>
    </main>
  );
}

async function apiFetch<T = unknown>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Request failed.');
  }
  return payload as T;
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amountMinor / 100);
}

function previewValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseJsonDraft(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function reportToText(report: ExecutiveReport): string {
  return [
    `${report.organizationName} - ${report.workspaceName}`,
    `Total approved recoverable: ${formatMoney(report.totalApprovedRecoverableMinor, report.currency)}`,
    `Total prevented leakage: ${formatMoney(report.totalPreventedLeakageMinor, report.currency)}`,
    report.methodologyNote,
    '',
    'Top findings:',
    ...report.topFindings.map((finding, index) => `${index + 1}. ${finding.title} - ${formatMoney(finding.amountMinor, finding.currency)}`)
  ].join('\n');
}
