'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bot,
  Bell,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  Download,
  FileSearch,
  FileText,
  Filter,
  FolderKanban,
  LayoutDashboard,
  Link2,
  Loader2,
  MailCheck,
  MoreHorizontal,
  Percent,
  Play,
  Plus,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  UserPlus,
  Users,
  Workflow,
  XCircle
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/db/supabaseBrowser';
import type { AnalyticsPoint, WorkspaceAnalyticsPayload } from '@/lib/analytics/workspaceAnalytics';
import { isCustomerFacingFindingStatus } from '@/lib/analytics/statuses';
import { AppShell } from '@/components/layout/AppShell';
import { ExecutiveReportPreview, type ExecutiveReportViewData } from '@/components/report/ExecutiveReportPreview';
import { ChartCardShell as ChartCard } from '@/components/ui/chart-card-shell';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { EvidencePanel } from '@/components/ui/evidence-panel';
import { FormulaBlock } from '@/components/ui/formula-block';
import { KpiCard as Metric } from '@/components/ui/kpi-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ReviewDrawer } from '@/components/ui/review-drawer';
import { StatusPill as StatusBadge } from '@/components/ui/status-pill';

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

type OrganizationInvite = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  invite_url: string;
  invite_text: string;
  created_at: string;
  expires_at?: string | null;
};

type Workspace = {
  id: string;
  name: string;
  status: string;
};

type Customer = {
  id: string;
  external_id?: string | null;
  name: string;
  domain?: string | null;
};

type SourceDocument = {
  id: string;
  customer_id?: string | null;
  customers?: Customer | Customer[] | null;
  document_type: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  parse_status: string;
  extracted_text_status?: string;
  chunking_status?: string;
  embedding_status?: string;
  parse_error?: string | null;
  created_at: string;
};

type ContractTermRow = {
  id: string;
  source_document_id?: string | null;
  customer_id?: string | null;
  term_type: string;
  term_value: unknown;
  confidence: number;
  review_status: string;
  citation: { label?: string; excerpt?: string };
  reviewer_user_id?: string | null;
  reviewed_at?: string | null;
  updated_at?: string | null;
};

type FindingRow = {
  id: string;
  customer_id?: string | null;
  finding_type: string;
  outcome_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string | null;
  title: string;
  summary: string;
  detailed_explanation?: string | null;
  estimated_amount_minor: number;
  currency: string;
  confidence: number;
  status: string;
  calculation: Record<string, unknown>;
  evidence_coverage_status?: string;
  recommended_action?: string | null;
  review_note?: string | null;
  reviewer_user_id?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

type ExecutiveReport = ExecutiveReportViewData;

type WorkspaceSnapshot = {
  documents: SourceDocument[];
  customers: Customer[];
  terms: ContractTermRow[];
  findings: FindingRow[];
  invoices: InvoiceRow[];
  usage: UsageRow[];
  candidates: EvidenceCandidateRow[];
};

type AccountRiskRow = {
  account: string;
  amountMinor: number;
  categoryMix: string;
  status: string;
  confidence: number;
  evidenceCount: number;
};

type AuditSection =
  | 'overview'
  | 'autopilot'
  | 'roles'
  | 'team'
  | 'uploads'
  | 'evidence'
  | 'terms'
  | 'contracts'
  | 'records'
  | 'revenue-records'
  | 'findings'
  | 'finding-detail'
  | 'analytics'
  | 'report'
  | 'reports'
  | 'settings';

type FindingStatusAction = 'needs_review' | 'approved' | 'dismissed' | 'customer_ready' | 'recovered' | 'not_recoverable';

const findingStatusActions: Array<{ value: FindingStatusAction; label: string; tone: 'default' | 'danger' }> = [
  { value: 'needs_review', label: 'Needs review', tone: 'default' },
  { value: 'approved', label: 'Approve', tone: 'default' },
  { value: 'customer_ready', label: 'Customer ready', tone: 'default' },
  { value: 'recovered', label: 'Recovered', tone: 'default' },
  { value: 'not_recoverable', label: 'Not recoverable', tone: 'danger' },
  { value: 'dismissed', label: 'Dismiss', tone: 'danger' }
];

const documentTypes = [
  { value: 'contract', label: 'Contract' },
  { value: 'invoice_csv', label: 'Invoice CSV' },
  { value: 'usage_csv', label: 'Usage CSV' },
  { value: 'customer_csv', label: 'Customer CSV' }
];

export function RevenueAuditWorkspace({ section = 'overview', findingId }: { section?: AuditSection; findingId?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authError] = useState<string | null>(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return 'Supabase browser environment variables are missing.';
    }
    return null;
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
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
  const [uploadCustomerId, setUploadCustomerId] = useState('');
  const [uploadCustomerExternalId, setUploadCustomerExternalId] = useState('');
  const [uploadCustomerName, setUploadCustomerName] = useState('');
  const [uploadCustomerDomain, setUploadCustomerDomain] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Revenue Leakage Audit');
  const [organizationName, setOrganizationName] = useState('LeakProof Customer Org');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('reviewer');
  const acceptedInviteTokenRef = useRef('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('annual uplift or minimum commitment');
  const [candidateFindingId, setCandidateFindingId] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [report, setReport] = useState<ExecutiveReport | null>(null);
  const [reportPackId, setReportPackId] = useState('');
  const [analytics, setAnalytics] = useState<WorkspaceAnalyticsPayload | null>(null);
  const [auditPeriod, setAuditPeriod] = useState('Q2 2026');
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [autonomousConsent, setAutonomousConsent] = useState(false);
  const [autonomousLog, setAutonomousLog] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const selectedOrg = organizations.find((org) => org.id === selectedOrgId);
  const selectedOrgCanManageRoles = selectedOrg ? ['owner', 'admin'].includes(selectedOrg.role) : false;
  const selectedOrgCanReviewFindings = selectedOrg ? ['owner', 'admin', 'reviewer'].includes(selectedOrg.role) : false;
  const assignableReviewers = members.filter((member) => ['owner', 'admin', 'reviewer'].includes(member.role));
  const canManageTargetRole = (role: OrganizationRole) =>
    selectedOrg?.role === 'owner' || (selectedOrg?.role === 'admin' && ['reviewer', 'member', 'viewer'].includes(role));
  const selectedContract = documents.find((document) => document.document_type === 'contract');
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId);
  const openFindings = findings.filter((finding) => ['draft', 'needs_review'].includes(finding.status));
  const approvedFindings = findings.filter((finding) => isCustomerFacingFindingStatus(finding.status));
  const activeSection = section;
  const canonicalSection: Record<AuditSection, AuditSection> = {
    overview: 'overview',
    autopilot: 'autopilot',
    roles: 'team',
    team: 'team',
    uploads: 'uploads',
    evidence: 'evidence',
    terms: 'contracts',
    contracts: 'contracts',
    records: 'revenue-records',
    'revenue-records': 'revenue-records',
    findings: 'findings',
    'finding-detail': 'findings',
    analytics: 'analytics',
    report: 'reports',
    reports: 'reports',
    settings: 'settings'
  };
  const activeNavSection = canonicalSection[activeSection];
  const auditSections: Array<{
    id: AuditSection;
    href: string;
    label: string;
    title: string;
    detail: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'overview',
      href: '/app',
      label: 'Overview',
      title: 'Audit Overview',
      detail: 'Create organizations, choose a workspace, and see the current audit position.',
      icon: <LayoutDashboard size={18} />
    },
    {
      id: 'uploads',
      href: '/app/uploads',
      label: 'Uploads',
      title: 'Source documents',
      detail: 'Upload contracts, invoices, and usage files into the selected workspace.',
      icon: <Upload size={16} />
    },
    {
      id: 'contracts',
      href: '/app/contracts',
      label: 'Contracts',
      title: 'Contract terms',
      detail: 'Review the terms extracted by AI before reconciliation uses them.',
      icon: <ClipboardCheck size={16} />
    },
    {
      id: 'revenue-records',
      href: '/app/revenue-records',
      label: 'Revenue Records',
      title: 'Billing records',
      detail: 'Inspect normalized invoice and usage rows from uploaded CSVs.',
      icon: <Database size={18} />
    },
    {
      id: 'findings',
      href: '/app/findings',
      label: 'Findings',
      title: 'Revenue findings',
      detail: 'Review calculated leakage, evidence candidates, and customer-safe statuses.',
      icon: <AlertTriangle size={16} />
    },
    {
      id: 'evidence',
      href: '/app/evidence',
      label: 'Evidence Search',
      title: 'Evidence search',
      detail: 'Find and attach supporting contract, invoice, and usage references.',
      icon: <Search size={16} />
    },
    {
      id: 'analytics',
      href: '/app/analytics',
      label: 'Analytics',
      title: 'Analytics',
      detail: 'Explore customer-facing leakage, internal pipeline, and review burden trends.',
      icon: <BarChart3 size={16} />
    },
    {
      id: 'reports',
      href: '/app/reports',
      label: 'Reports',
      title: 'Customer-ready report',
      detail: 'Generate, copy, download, or print the approved recovery report.',
      icon: <Printer size={16} />
    },
    {
      id: 'team',
      href: '/app/team',
      label: 'Team',
      title: 'Team and workflow',
      detail: 'Control who can review, approve, and manage each organization.',
      icon: <Users size={18} />
    },
    {
      id: 'settings',
      href: '/app/settings',
      label: 'Settings',
      title: 'Settings',
      detail: 'Manage workspace controls, audit periods, and review defaults.',
      icon: <UserCog size={18} />
    },
    {
      id: 'autopilot',
      href: '/app/autopilot',
      label: 'Autopilot',
      title: 'Autonomous audit agent',
      detail: 'Run the guided audit agent with visible caution controls and review checkpoints.',
      icon: <Bot size={16} />
    }
  ];
  const activeSectionMeta = activeSection === 'finding-detail'
    ? {
      id: 'finding-detail' as const,
      href: '/app/findings',
      label: 'Finding detail',
      title: 'Finding detail',
      detail: 'Review calculation, evidence, and approval status for one finding.',
      icon: <AlertTriangle size={16} />
    }
    : auditSections.find((item) => item.id === activeNavSection) ?? auditSections[0];
  const normalizedHeaderSearch = headerSearch.trim().toLowerCase();
  const visibleOverviewFindings = (normalizedHeaderSearch
    ? findings.filter((finding) =>
      [
        finding.title,
        finding.summary,
        finding.finding_type,
        finding.status,
        finding.outcome_type ?? ''
      ].join(' ').toLowerCase().includes(normalizedHeaderSearch)
    )
    : findings
  ).slice(0, 4);
  const embeddedDocuments = documents.filter((document) => document.embedding_status === 'embedded').length;
  const approvedTerms = terms.filter((term) => ['approved', 'edited'].includes(term.review_status)).length;
  const auditHealth = openFindings.length === 0 && findings.length > 0 ? 'Good' : findings.length === 0 ? 'Setup' : 'Review';
  const auditHealthDetail = findings.length === 0
    ? 'Upload files to begin'
    : openFindings.length === 0
      ? 'No open findings'
      : `${openFindings.length} finding${openFindings.length === 1 ? '' : 's'} need review`;
  const customerFacingAnalytics = analytics?.customerFacing;
  const internalPipelineAnalytics = analytics?.internalPipeline;
  const reviewBurdenAnalytics = analytics?.reviewBurden;
  const operationsAnalytics = analytics?.operations;
  const displayCurrency = analytics?.currency ?? findings[0]?.currency ?? 'USD';
  const customerFacingTotalMinor = customerFacingAnalytics?.totalLeakageMinor ?? approvedFindings.reduce((sum, finding) => sum + finding.estimated_amount_minor, 0);
  const internalPipelineTotalMinor = internalPipelineAnalytics?.unapprovedExposureMinor ?? openFindings.reduce((sum, finding) => sum + finding.estimated_amount_minor, 0);
  const recoverableMinor = customerFacingAnalytics?.recoverableLeakageMinor ?? approvedFindings
    .filter((finding) => (finding.outcome_type ?? 'recoverable_leakage') === 'recoverable_leakage')
    .reduce((sum, finding) => sum + finding.estimated_amount_minor, 0);
  const preventedMinor = customerFacingAnalytics?.preventedLeakageMinor ?? approvedFindings
    .filter((finding) => finding.outcome_type === 'prevented_future_leakage')
    .reduce((sum, finding) => sum + finding.estimated_amount_minor, 0);
  const recoveredMinor = customerFacingAnalytics?.recoveredLeakageMinor ?? approvedFindings
    .filter((finding) => finding.status === 'recovered')
    .reduce((sum, finding) => sum + finding.estimated_amount_minor, 0);
  const averageConfidence = findings.length > 0
    ? `${Math.round(findings.reduce((sum, finding) => sum + finding.confidence, 0) / findings.length * 100)}%`
    : '0%';
  const coverageRate = documents.length > 0 ? `${Math.round((embeddedDocuments / documents.length) * 100)}%` : '0%';
  const auditPipelinePoints = buildAuditPipelinePoints({
    documents,
    terms,
    findings,
    reportReady: Boolean(reportPackId || report)
  });
  const contractHealthPoints = buildContractHealthPoints(documents, terms);
  const documentPipelinePoints = operationsAnalytics?.documentPipeline ?? auditPipelinePoints;
  const analyticsContractHealthPoints = operationsAnalytics?.contractHealth ?? contractHealthPoints;
  const accountRiskRows = buildAccountRiskRows(findings, evidenceCandidates);
  const highPriorityFindings = findings.filter((finding) => ['high', 'critical'].includes(String(finding.severity ?? ''))).length;
  const parsingFailures = documents.filter((document) => ['error', 'failed'].includes(document.parse_status) || document.embedding_status === 'error').length;
  const readinessItems = [
    {
      label: 'Documents',
      value: `${embeddedDocuments}/${documents.length} embedded`,
      state: documents.length > 0 ? 'Ready' : 'Needed',
      tone: documents.length > 0 ? 'good' : 'warning'
    },
    {
      label: 'AI terms',
      value: terms.length > 0 ? `${approvedTerms}/${terms.length} approved` : 'Run extraction',
      state: terms.length > 0 ? 'In review' : 'Needed',
      tone: approvedTerms === terms.length && terms.length > 0 ? 'good' : 'warning'
    },
    {
      label: 'Evidence',
      value: `${evidenceCandidates.length} candidate${evidenceCandidates.length === 1 ? '' : 's'}`,
      state: evidenceCandidates.length > 0 ? 'Linked' : 'Open',
      tone: evidenceCandidates.length > 0 ? 'good' : 'muted'
    }
  ];

  const fetchWorkspaceSnapshot = useCallback(async (
    activeSession: Session,
    organizationId: string,
    workspaceId: string
  ): Promise<WorkspaceSnapshot> => {
    const query = `organization_id=${organizationId}&workspace_id=${workspaceId}`;
    const [documentPayload, customerPayload, termPayload, findingPayload, invoicePayload, usagePayload, candidatePayload] = await Promise.all([
      apiFetch<{ documents: SourceDocument[] }>(activeSession, `/api/documents?${query}`),
      apiFetch<{ customers: Customer[] }>(activeSession, `/api/customers?organization_id=${organizationId}`),
      apiFetch<{ terms: ContractTermRow[] }>(activeSession, `/api/contract-terms?${query}`),
      apiFetch<{ findings: FindingRow[] }>(activeSession, `/api/findings?${query}`),
      apiFetch<{ records: InvoiceRow[] }>(activeSession, `/api/invoice-records?${query}`),
      apiFetch<{ records: UsageRow[] }>(activeSession, `/api/usage-records?${query}`),
      apiFetch<{ candidates: EvidenceCandidateRow[] }>(activeSession, `/api/evidence-candidates?${query}`)
    ]);

    return {
      documents: documentPayload.documents,
      customers: customerPayload.customers,
      terms: termPayload.terms,
      findings: findingPayload.findings,
      invoices: invoicePayload.records,
      usage: usagePayload.records,
      candidates: candidatePayload.candidates
    };
  }, []);

  const refreshWorkspaceData = useCallback(async (activeSession: Session, organizationId: string, workspaceId: string) => {
    const snapshot = await fetchWorkspaceSnapshot(activeSession, organizationId, workspaceId);

    setDocuments(snapshot.documents);
    setCustomers(snapshot.customers);
    setTerms(snapshot.terms);
    setTermDrafts(Object.fromEntries(snapshot.terms.map((term) => [term.id, previewValue(term.term_value)])));
    setFindings(snapshot.findings);
    setSelectedFindingId((current) =>
      findingId && snapshot.findings.some((finding) => finding.id === findingId)
        ? findingId
        : snapshot.findings.some((finding) => finding.id === current) ? current : snapshot.findings[0]?.id ?? ''
    );
    setCandidateFindingId((current) =>
      snapshot.findings.some((finding) => finding.id === current) ? current : snapshot.findings[0]?.id ?? ''
    );
    if (snapshot.findings.length === 0) {
      setSelectedFindingDetail(null);
    }
    setInvoices(snapshot.invoices);
    setUsage(snapshot.usage);
    setEvidenceCandidates(snapshot.candidates);
  }, [fetchWorkspaceSnapshot, findingId]);

  const refreshWorkspaceAnalytics = useCallback(async (activeSession: Session, organizationId: string, workspaceId: string) => {
    const payload = await apiFetch<{ analytics: WorkspaceAnalyticsPayload }>(
      activeSession,
      `/api/workspaces/${workspaceId}/analytics?organization_id=${organizationId}`
    );
    setAnalytics(payload.analytics);
  }, []);

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
    if (section !== 'overview' || typeof window === 'undefined') return;

    const legacyHash = window.location.hash.replace('#', '');
    const hashRoutes: Record<string, AuditSection> = {
      autopilot: 'autopilot',
      roles: 'roles',
      uploads: 'uploads',
      search: 'evidence',
      evidence: 'evidence',
      terms: 'terms',
      records: 'records',
      findings: 'findings',
      report: 'report'
    };
    const nextSection = hashRoutes[legacyHash];
    if (nextSection) {
      router.replace(`/app/${nextSection}`);
    }
  }, [router, section]);

  useEffect(() => {
    if (!session) return;
    startTransition(() => {
      refreshOrganizations(session).catch(showError);
    });
  }, [session]);

  useEffect(() => {
    if (!session || acceptedInviteTokenRef.current || typeof window === 'undefined') return;
    const inviteToken = new URL(window.location.href).searchParams.get('invite');
    if (!inviteToken) return;

    acceptedInviteTokenRef.current = inviteToken;
    startTransition(() => {
      acceptInvite(session, inviteToken).catch(showError);
    });
  }, [acceptInvite, session]);

  useEffect(() => {
    if (!session || !selectedOrgId) return;
    startTransition(() => {
      Promise.all([
        refreshWorkspaces(session, selectedOrgId),
        refreshMembers(session, selectedOrgId),
        refreshInvites(session, selectedOrgId)
      ]).catch(showError);
    });
  }, [session, selectedOrgId]);

  useEffect(() => {
    if (!session || !selectedOrgId || !selectedWorkspaceId) return;
    startTransition(() => {
      Promise.all([
        refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId),
        refreshWorkspaceAnalytics(session, selectedOrgId, selectedWorkspaceId)
      ]).catch(showError);
    });
  }, [session, selectedOrgId, selectedWorkspaceId, refreshWorkspaceData, refreshWorkspaceAnalytics]);

  useEffect(() => {
    if (!session || !selectedOrgId || !selectedFindingId) return;

    startTransition(() => {
      refreshFindingDetail(session, selectedOrgId, selectedFindingId).catch(showError);
    });
  }, [session, selectedOrgId, selectedFindingId]);

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

  async function refreshInvites(activeSession: Session, organizationId: string) {
    const payload = await apiFetch<{ invites: OrganizationInvite[] }>(
      activeSession,
      `/api/organizations/${organizationId}/invites`
    );
    setInvites(payload.invites);
  }

  async function acceptInvite(activeSession: Session, inviteToken: string) {
    await apiFetch(activeSession, `/api/invites/${inviteToken}/accept`, {
      method: 'POST'
    });
    setMessage('Invite accepted. Organization access is ready.');
    await refreshOrganizations(activeSession);
    router.replace('/app/team');
  }

  async function refreshWorkspaces(activeSession: Session, organizationId: string) {
    const payload = await apiFetch<{ workspaces: Workspace[] }>(
      activeSession,
      `/api/workspaces?organization_id=${organizationId}`
    );
    setWorkspaces(payload.workspaces);
    setSelectedWorkspaceId((current) => current || payload.workspaces[0]?.id || '');
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

  async function removeMember(memberId: string) {
    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/organizations/${selectedOrgId}/members/${memberId}`, {
      method: 'DELETE',
      body: JSON.stringify({ organization_id: selectedOrgId })
    });
    setMessage('Member removed.');
    await Promise.all([
      refreshMembers(activeSession, selectedOrgId),
      refreshOrganizations(activeSession)
    ]);
  }

  async function createInvite() {
    const activeSession = requireActiveSession();
    const payload = await apiFetch<{ invite: OrganizationInvite }>(activeSession, `/api/organizations/${selectedOrgId}/invites`, {
      method: 'POST',
      body: JSON.stringify({
        organization_id: selectedOrgId,
        email: inviteEmail,
        role: inviteRole
      })
    });
    setInviteEmail('');
    setInviteRole('reviewer');
    setMessage('Invite link created. Copy it if email delivery is not configured.');
    setInvites((current) => [payload.invite, ...current.filter((invite) => invite.id !== payload.invite.id)]);
  }

  async function cancelInvite(inviteId: string) {
    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/organizations/${selectedOrgId}/invites/${inviteId}`, {
      method: 'DELETE',
      body: JSON.stringify({ organization_id: selectedOrgId })
    });
    setMessage('Invite cancelled.');
    await refreshInvites(activeSession, selectedOrgId);
  }

  async function copyInviteText(invite: OrganizationInvite) {
    await navigator.clipboard.writeText(invite.invite_text);
    setMessage('Invite text copied.');
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

  async function updateFindingStatus(findingId: string, status: FindingStatusAction) {
    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/findings/${findingId}/status?organization_id=${selectedOrgId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        note: ['dismissed', 'not_recoverable'].includes(status)
          ? 'Manual reviewer decision from audit workspace.'
          : 'Reviewer updated status from audit workspace.'
      })
    });
    setMessage(`Finding marked ${status.replace('_', ' ')}.`);
    await Promise.all([
      refreshWorkspaceData(activeSession, selectedOrgId, selectedWorkspaceId),
      refreshWorkspaceAnalytics(activeSession, selectedOrgId, selectedWorkspaceId)
    ]);
    if (findingId === selectedFindingId) await refreshFindingDetail(activeSession, selectedOrgId, findingId);
  }

  async function assignFinding(findingId: string, reviewerUserId: string) {
    const activeSession = requireActiveSession();
    await apiFetch(activeSession, `/api/findings/${findingId}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: selectedOrgId,
        reviewer_user_id: reviewerUserId || null
      })
    });
    setMessage(reviewerUserId ? 'Finding assigned.' : 'Finding unassigned.');
    await Promise.all([
      refreshWorkspaceData(activeSession, selectedOrgId, selectedWorkspaceId),
      refreshWorkspaceAnalytics(activeSession, selectedOrgId, selectedWorkspaceId)
    ]);
    if (findingId === selectedFindingId) await refreshFindingDetail(activeSession, selectedOrgId, findingId);
  }

  async function generateReport() {
    if (!selectedOrgId || !selectedWorkspaceId) {
      setError('Select a workspace before generating a report.');
      return;
    }

    const activeSession = requireActiveSession();
    const payload = await apiFetch<{ report: ExecutiveReport; evidence_pack_id: string | null }>(
      activeSession,
      `/api/workspaces/${selectedWorkspaceId}/report`,
      {
        method: 'POST',
        body: JSON.stringify({ organization_id: selectedOrgId })
      }
    );
    setReport(payload.report);
    setReportPackId(payload.evidence_pack_id ?? '');
    setMessage(payload.evidence_pack_id ? 'Executive report generated.' : 'Report preview generated. Export is blocked until approved findings have approved evidence.');
  }

  async function exportReport(format: 'print_pdf' | 'json' | 'clipboard') {
    if (!report || !reportPackId || !report.exportability?.exportable) {
      setError('Report is not exportable yet. Approve customer-facing findings and evidence first.');
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

  async function runAutonomousAudit() {
    if (!autonomousMode || !autonomousConsent) {
      setError('Turn on autonomous mode and accept the caution before running the audit agent.');
      return;
    }
    if (!selectedOrgId || !selectedWorkspaceId) {
      setError('Select an organization and workspace before running the audit agent.');
      return;
    }

    const activeSession = requireActiveSession();
    const steps: string[] = [];
    const logStep = (step: string) => {
      steps.push(step);
      setAutonomousLog([...steps]);
    };

    logStep('Checked workspace setup.');
    let snapshot = await fetchWorkspaceSnapshot(activeSession, selectedOrgId, selectedWorkspaceId);
    const contract = snapshot.documents.find((document) => document.document_type === 'contract');
    const hasInvoice = snapshot.documents.some((document) => document.document_type === 'invoice_csv');
    const hasUsage = snapshot.documents.some((document) => document.document_type === 'usage_csv');

    if (!contract) {
      throw new Error('Autonomous audit needs at least one contract file.');
    }
    if (!hasInvoice || !hasUsage) {
      logStep('Warning: invoice or usage data is missing, so findings may be incomplete.');
    }

    for (const document of snapshot.documents) {
      if (document.embedding_status === 'embedded') continue;
      logStep(`Embedding evidence from ${document.file_name}.`);
      await apiFetch(activeSession, `/api/workspaces/${selectedWorkspaceId}/documents/${document.id}/embed`, {
        method: 'POST',
        body: JSON.stringify({ organization_id: selectedOrgId })
      });
    }

    logStep('Running AI contract extraction.');
    await apiFetch(activeSession, '/api/extraction/run', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: selectedOrgId,
        workspace_id: selectedWorkspaceId,
        source_document_id: contract.id
      })
    });

    snapshot = await fetchWorkspaceSnapshot(activeSession, selectedOrgId, selectedWorkspaceId);
    const reviewableTerms = snapshot.terms.filter((term) => ['extracted', 'needs_review'].includes(term.review_status));
    const highConfidenceTerms = reviewableTerms.filter((term) => term.confidence >= 0.85);
    const uncertainTerms = reviewableTerms.filter((term) => term.confidence < 0.85);

    for (const term of highConfidenceTerms) {
      await apiFetch(activeSession, `/api/contract-terms/${term.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ organization_id: selectedOrgId, review_status: 'approved' })
      });
    }
    for (const term of uncertainTerms) {
      await apiFetch(activeSession, `/api/contract-terms/${term.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ organization_id: selectedOrgId, review_status: 'needs_review' })
      });
    }
    logStep(`Approved ${highConfidenceTerms.length} high-confidence terms and flagged ${uncertainTerms.length} terms for review.`);

    logStep('Running deterministic reconciliation.');
    await apiFetch(activeSession, '/api/reconciliation/run', {
      method: 'POST',
      body: JSON.stringify({ organization_id: selectedOrgId, workspace_id: selectedWorkspaceId })
    });

    snapshot = await fetchWorkspaceSnapshot(activeSession, selectedOrgId, selectedWorkspaceId);
    const reviewableFindings = snapshot.findings.filter((finding) => ['draft', 'needs_review'].includes(finding.status));
    const highConfidenceFindings = reviewableFindings.filter((finding) => finding.confidence >= 0.85);
    const uncertainFindings = reviewableFindings.filter((finding) => finding.confidence < 0.85);

    for (const finding of highConfidenceFindings) {
      await apiFetch(activeSession, `/api/findings/${finding.id}/status?organization_id=${selectedOrgId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          note: 'Autonomous audit approved this high-confidence finding. Human review is still required before customer use.'
        })
      });
    }
    for (const finding of uncertainFindings) {
      await apiFetch(activeSession, `/api/findings/${finding.id}/status?organization_id=${selectedOrgId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'needs_review',
          note: 'Autonomous audit flagged this finding because confidence is below the approval threshold.'
        })
      });
    }
    logStep(`Approved ${highConfidenceFindings.length} high-confidence findings and flagged ${uncertainFindings.length} findings for review.`);

    snapshot = await fetchWorkspaceSnapshot(activeSession, selectedOrgId, selectedWorkspaceId);
    const findingsNeedingEvidence = snapshot.findings
      .filter((finding) => !snapshot.candidates.some((candidate) => candidate.finding_id === finding.id))
      .slice(0, 5);
    let latestResults: SearchResult[] = [];

    for (const finding of findingsNeedingEvidence) {
      const query = `${finding.title}. ${finding.summary}. ${finding.finding_type}`.slice(0, 500);
      logStep(`Searching evidence for ${finding.title}.`);
      const payload = await apiFetch<{ results: SearchResult[] }>(activeSession, `/api/workspaces/${selectedWorkspaceId}/semantic-search`, {
        method: 'POST',
        body: JSON.stringify({ organization_id: selectedOrgId, query, limit: 3 })
      });
      latestResults = payload.results;

      const bestResult = payload.results[0];
      if (!bestResult) continue;
      await apiFetch(activeSession, '/api/evidence-candidates', {
        method: 'POST',
        body: JSON.stringify({
          organization_id: selectedOrgId,
          workspace_id: selectedWorkspaceId,
          finding_id: finding.id,
          document_chunk_id: bestResult.chunk_id,
          retrieval_score: bestResult.similarity,
          relevance_explanation: 'Autonomous audit suggested this evidence. Reviewer approval is still required.'
        })
      });
    }

    logStep('Generating report draft from approved findings.');
    const reportPayload = await apiFetch<{ report: ExecutiveReport; evidence_pack_id: string | null }>(
      activeSession,
      `/api/workspaces/${selectedWorkspaceId}/report`,
      {
        method: 'POST',
        body: JSON.stringify({ organization_id: selectedOrgId })
      }
    );

    setReport(reportPayload.report);
    setReportPackId(reportPayload.evidence_pack_id ?? '');
    setSearchResults(latestResults);
    await refreshWorkspaceData(activeSession, selectedOrgId, selectedWorkspaceId);
    setMessage('Autonomous audit finished. Review the terms, evidence, findings, and report before using anything with a customer.');
  }

  return (
    <AppShell
      navItems={auditSections}
      activeSection={activeNavSection}
      workspaceName={selectedWorkspace?.name ?? 'Revenue Leakage Audit'}
      organizationName={selectedOrg?.name ?? 'LeakProof Customer Org'}
      userEmail={session.user.email ?? 'Finance reviewer'}
      userRole={selectedOrg ? selectedOrg.role : 'viewer'}
      sidebarWorkspaceSelector={(
        <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)} aria-label="Switch workspace from sidebar">
          <option value="">Switch workspace</option>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      )}
      eyebrow={`${selectedWorkspace?.name ?? 'Revenue Leakage Audit'} / ${auditPeriod}`}
      title={activeSectionMeta.title}
      topbarControls={(
        <>
            <select value={auditPeriod} onChange={(event) => setAuditPeriod(event.target.value)} aria-label="Audit period">
              <option>Q2 2026</option>
              <option>Q1 2026</option>
              <option>2026 YTD</option>
              <option>Rolling 12 months</option>
            </select>
            <label className="app-search">
              <Search size={22} />
              <input
                value={headerSearch}
                onChange={(event) => setHeaderSearch(event.target.value)}
                placeholder="Search..."
                aria-label="Search findings"
              />
            </label>
            <button type="button" className="secondary-button topbar-icon-button" aria-label="Filter audit data"><Filter size={18} /> Filter</button>
            <button type="button" className="secondary-button topbar-icon-button" aria-label="Notifications"><Bell size={18} /></button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (!selectedOrgId || !selectedWorkspaceId) return setError('Select a workspace before reconciliation.');
                runTask(async () => {
                  await apiFetch(session, '/api/reconciliation/run', {
                    method: 'POST',
                    body: JSON.stringify({ organization_id: selectedOrgId, workspace_id: selectedWorkspaceId })
                  });
                  await Promise.all([
                    refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId),
                    refreshWorkspaceAnalytics(session, selectedOrgId, selectedWorkspaceId)
                  ]);
                  setMessage('Analysis completed.');
                });
              }}
            >
              <Play size={16} /> Run Analysis
            </button>
            <Link className="button-link secondary" href="/app/reports">
              <Download size={18} /> Export Report
            </Link>
            <button type="button" className="secondary-button profile-menu" aria-label="Profile menu">
              <span>{(session.user.email ?? 'F').slice(0, 1).toUpperCase()}</span>
              Profile
            </button>
            <Link className="button-link primary-action" href="/app/uploads"><Plus size={18} /> Add Files</Link>
        </>
      )}
      contextControls={(
        <>
            {selectedOrg ? <span className="role-pill">{selectedOrg.role}</span> : null}
            <select value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)} aria-label="Organization">
              <option value="">Select organization</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)} aria-label="Workspace">
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
        </>
      )}
    >

        {error ? <div className="state-banner error"><XCircle size={18} /> {error}</div> : null}
        {message ? <div className="state-banner success"><CheckCircle2 size={18} /> {message}</div> : null}
        {isPending ? (
          <>
            <div className="state-banner"><Loader2 className="spin" size={18} /> Updating workspace...</div>
            <LoadingSkeleton rows={2} />
          </>
        ) : null}

        {activeSection === 'overview' ? (
          <div className="dashboard-content">
            <section className="executive-hero">
              <div>
                <span className="scope-label">Customer-facing leakage</span>
                <h1>{formatMoney(customerFacingTotalMinor, displayCurrency)}</h1>
                <p>
                  Approved, customer-ready, and recovered findings only. Draft and needs-review items stay in the internal pipeline until a human approves them.
                </p>
              </div>
              <div className="hero-proof">
                <span>Core control</span>
                <strong>LLM extracts. Code calculates. Human approves.</strong>
              </div>
            </section>

            <section className="metric-grid kpi-grid" aria-label="Audit summary">
              <Metric label="Total potential leakage" value={formatMoney(customerFacingTotalMinor, displayCurrency)} detail="Customer-facing leakage only" tone="danger" />
              <Metric label="Recoverable leakage" value={formatMoney(recoverableMinor, displayCurrency)} detail="Approved recoverable findings" tone="good" />
              <Metric label="Prevented future leakage" value={formatMoney(preventedMinor, displayCurrency)} detail="Approved prevention findings" tone="warning" />
              <Metric label="Revenue recovered" value={formatMoney(recoveredMinor, displayCurrency)} detail="Marked recovered" tone="good" />
              <Metric label="Approved findings" value={String(approvedFindings.length)} detail="Approved/customer-ready/recovered" />
              <Metric label="Findings needing review" value={String(openFindings.length)} detail={analytics?.internalPipeline.label ?? 'Internal pipeline'} tone="warning" />
              <Metric label="Accounts at risk" value={String(customerFacingAnalytics?.byCustomer.length ?? 0)} detail="Customer-facing accounts" />
              <Metric label="Audit coverage" value={coverageRate} detail={`${embeddedDocuments}/${documents.length} documents embedded`} />
              <Metric label="Documents processed" value={String(documents.length)} detail={`${documents.filter((document) => document.parse_status === 'parsed').length} parsed`} />
              <Metric label="Extraction confidence" value={averageConfidence} detail="Average finding confidence" />
              <Metric label="Unapproved exposure" value={formatMoney(internalPipelineTotalMinor, displayCurrency)} detail="Internal pipeline, not customer-facing" tone="warning" />
              <Metric label="Audit health" value={auditHealth} detail={auditHealthDetail} tone={auditHealth === 'Good' ? 'good' : auditHealth === 'Setup' ? 'muted' : 'warning'} />
            </section>

            <section className="chart-grid">
              <ChartCard title="Leakage by category" scope="Customer-facing leakage">
                <BarChartPanel points={customerFacingAnalytics?.byCategory ?? []} currency={displayCurrency} />
              </ChartCard>
              <ChartCard title="Recoverable vs prevented" scope="Customer-facing leakage">
                <DonutChartPanel
                  points={[
                    { label: 'Recoverable', value: recoverableMinor, amountMinor: recoverableMinor },
                    { label: 'Prevented', value: preventedMinor, amountMinor: preventedMinor },
                    { label: 'Already recovered', value: recoveredMinor, amountMinor: recoveredMinor }
                  ]}
                  currency={displayCurrency}
                />
              </ChartCard>
              <ChartCard title="Leakage trend over time" scope="Customer-facing leakage">
                <TrendChartPanel data={customerFacingAnalytics?.trend ?? []} currency={displayCurrency} />
              </ChartCard>
              <ChartCard title="Findings by status" scope="Needs finance review">
                <StatusSegments points={reviewBurdenAnalytics?.allStatuses ?? groupLocalStatus(findings.map((finding) => finding.status))} />
              </ChartCard>
              <ChartCard title="Top accounts by leakage" scope="Customer-facing leakage">
                <AccountRiskTable rows={accountRiskRows} currency={displayCurrency} />
              </ChartCard>
              <ChartCard title="Revenue concentration risk" scope="Customer-facing leakage">
                <BarChartPanel points={customerFacingAnalytics?.concentrationRisk ?? []} currency={displayCurrency} layout="vertical" />
              </ChartCard>
              <ChartCard title="Contract health" scope="Internal pipeline">
                <BarChartPanel points={analyticsContractHealthPoints} />
              </ChartCard>
              <ChartCard title="Document processing pipeline" scope="Internal pipeline">
                <FunnelPanel points={documentPipelinePoints} />
              </ChartCard>
              <ChartCard title="Confidence / review burden" scope="Needs finance review">
                <DonutChartPanel points={reviewBurdenAnalytics?.confidenceDistribution ?? []} currency={displayCurrency} />
              </ChartCard>
              <ChartCard title="Recovery performance" scope="Customer-facing leakage">
                <RecoveryChartPanel data={customerFacingAnalytics?.recoveryPerformance ?? []} currency={displayCurrency} />
              </ChartCard>
            </section>

            <section className="dashboard-layout">
              <div className="dashboard-card recent-card premium-table-card">
                <div className="dashboard-card-header">
                  <h3>Recent Findings</h3>
                  <Link href="/app/findings">View All</Link>
                </div>
                <div className="activity-table-wrap">
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Finding</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Exposure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOverviewFindings.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty-cell">
                            {normalizedHeaderSearch ? 'No findings match that search.' : 'Run reconciliation to create findings.'}
                          </td>
                        </tr>
                      ) : visibleOverviewFindings.map((finding) => (
                        <tr key={finding.id}>
                          <td>
                            <strong>{finding.title}</strong>
                            <span>{finding.summary}</span>
                          </td>
                          <td>{finding.finding_type.replaceAll('_', ' ')}</td>
                          <td><StatusBadge value={finding.status} /></td>
                          <td>
                            <span className="amount-strong">{formatMoney(finding.estimated_amount_minor, finding.currency)}</span>
                            <small>{isCustomerFacingFindingStatus(finding.status) ? 'Customer-facing' : 'Internal pipeline'}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="dashboard-rail">
                <div className="dashboard-card readiness-card">
                  <div className="dashboard-card-header">
                    <h3>Audit Readiness</h3>
                    <button type="button" className="icon-button" aria-label="Audit readiness actions">
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                  <div className="readiness-list">
                    {readinessItems.map((item) => (
                      <div key={item.label} className="readiness-row">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        <StatusBadge value={item.state} tone={item.tone as 'good' | 'warning' | 'muted'} />
                      </div>
                    ))}
                  </div>
                  <Link className="button-link secondary manage-button" href="/app/uploads">Manage Workspace</Link>
                </div>

                <div className="agent-card">
                  <h3>Analysis controls</h3>
                  <p>
                    Run extraction and reconciliation from controlled workflow pages. Customer-facing reports only include approved evidence-backed findings.
                  </p>
                  <Link className="button-link" href="/app/analytics"><BarChart3 size={16} /> Open Analytics</Link>
                </div>
              </aside>
            </section>

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
          </div>
        ) : null}

        {['roles', 'team'].includes(activeSection) ? (
        <section id="roles" className="workspace-section">
          <SectionHeader icon={<UserCog size={18} />} title="Team and workflow" detail="Owners and admins can change reviewer access. Members and viewers remain read-only for workflow mutations." />
          <section className="metric-grid compact-metrics">
            <Metric label="Team members" value={String(members.length)} detail="Organization access" />
            <Metric label="Reviewer workload" value={String(reviewBurdenAnalytics?.reviewerWorkload.length ?? 0)} detail="Active reviewers with assigned findings" />
            <Metric label="Avg turnaround" value={reviewBurdenAnalytics?.averageReviewTurnaroundHours === null || reviewBurdenAnalytics?.averageReviewTurnaroundHours === undefined ? 'Not enough data' : `${reviewBurdenAnalytics.averageReviewTurnaroundHours}h`} detail="Created to reviewed" />
            <Metric label="Pending reviews" value={String(openFindings.length)} detail="Needs finance decision" tone="warning" />
          </section>
          <div className="team-grid">
            <form
              className="invite-card"
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedOrgId) return setError('Select or create an organization before inviting teammates.');
                runTask(createInvite);
              }}
            >
              <UserPlus size={20} />
              <h3>Invite teammate</h3>
              <p>Invite finance, billing, or RevOps teammates into the review queue without exposing customer data outside this organization.</p>
              <input
                type="email"
                placeholder="reviewer@company.com"
                aria-label="Reviewer email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
              />
              <select
                aria-label="Invite role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as OrganizationRole)}
              >
                <option value="reviewer">Reviewer</option>
                <option value="admin" disabled={selectedOrg?.role !== 'owner'}>Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" disabled={!selectedOrgCanManageRoles || !inviteEmail}><MailCheck size={16} /> Create invite</button>
            </form>
            <ChartCard title="Review turnaround metrics" scope="Needs finance review">
              <div className="workflow-metrics">
                <div><CalendarClock size={18} /><strong>{reviewBurdenAnalytics?.averageReviewTurnaroundHours ?? 'N/A'}</strong><span>Avg hours to review</span></div>
                <div><Percent size={18} /><strong>{averageConfidence}</strong><span>Avg confidence</span></div>
                <div><Workflow size={18} /><strong>{openFindings.length}</strong><span>Open workflow items</span></div>
              </div>
            </ChartCard>
          </div>
          <DataTable
            columns={['User', 'Role', 'Created', 'Actions']}
            rows={members.map((member) => [
              shortId(member.user_id),
              <span className="role-editor" key={`${member.id}-role`}>
                <span className="role-badge">{member.role}</span>
                <select
                  value={member.role}
                  disabled={!selectedOrgCanManageRoles || !canManageTargetRole(member.role)}
                  onChange={(event) => runTask(() => updateMemberRole(member.id, event.target.value as OrganizationRole))}
                  aria-label={`Role for ${member.user_id}`}
                >
                  {(['owner', 'admin', 'reviewer', 'member', 'viewer'] as const).map((role) => (
                    <option key={role} value={role} disabled={!canManageTargetRole(role)}>{role}</option>
                  ))}
                </select>
              </span>,
              formatDate(member.created_at),
              <span className="button-group" key={`${member.id}-actions`}>
                <button
                  type="button"
                  className="danger-button"
                  disabled={!selectedOrgCanManageRoles || !canManageTargetRole(member.role)}
                  onClick={() => runTask(() => removeMember(member.id))}
                >
                  <Trash2 size={14} /> Remove
                </button>
              </span>
            ])}
            empty={selectedOrgId ? 'No members found for this organization.' : 'Select an organization to manage roles.'}
          />
          <DataTable
            columns={['Pending invite', 'Role', 'Expires', 'Link', 'Action']}
            rows={invites
              .filter((invite) => invite.status === 'pending')
              .map((invite) => [
                invite.email,
                <span className="role-badge" key={`${invite.id}-role`}>{invite.role}</span>,
                invite.expires_at ? formatDate(invite.expires_at) : 'No expiry',
                <button
                  type="button"
                  className="secondary-button"
                  key={`${invite.id}-copy`}
                  disabled={!selectedOrgCanManageRoles}
                  onClick={() => runTask(() => copyInviteText(invite))}
                >
                  <Link2 size={14} /> Copy
                </button>,
                <button
                  type="button"
                  className="danger-button"
                  key={`${invite.id}-cancel`}
                  disabled={!selectedOrgCanManageRoles}
                  onClick={() => runTask(() => cancelInvite(invite.id))}
                >
                  <XCircle size={14} /> Cancel
                </button>
              ])}
            empty={selectedOrgCanManageRoles ? 'No pending invites.' : 'Owners and admins can manage invites.'}
          />
          <ChartCard title="Reviewer workload" scope="Needs finance review">
            <BarChartPanel points={reviewBurdenAnalytics?.reviewerWorkload ?? []} />
          </ChartCard>
        </section>
        ) : null}

        {activeSection === 'autopilot' ? (
        <section id="autopilot" className="workspace-section autopilot-section">
          <SectionHeader
            icon={<Bot size={18} />}
            title="Autonomous audit agent"
            detail="Runs the audit workflow for you, then leaves financial decisions and customer-facing use for human review."
          />
          <div className="autopilot-grid">
            <div className="autopilot-copy">
              <p>
                The agent can embed uploaded files, extract contract terms with AI, approve only high-confidence terms,
                flag uncertain terms, run reconciliation, suggest evidence, and draft the report.
              </p>
              <p className="warning-text">
                Caution: automatic mode can be wrong if documents are incomplete, badly formatted, or if the AI extracts a term incorrectly.
                It may create false positives, miss leakage, or attach weak evidence. Do not send reports, invoices, or customer messages without review.
              </p>
            </div>
            <div className="autopilot-controls">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={autonomousMode}
                  onChange={(event) => {
                    setAutonomousMode(event.target.checked);
                    if (!event.target.checked) setAutonomousConsent(false);
                  }}
                />
                Enable autonomous mode
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={autonomousConsent}
                  disabled={!autonomousMode}
                  onChange={(event) => setAutonomousConsent(event.target.checked)}
                />
                I understand the agent may make mistakes and I will review the output before customer use.
              </label>
              <button
                type="button"
                disabled={!autonomousMode || !autonomousConsent || isPending}
                onClick={() => runTask(runAutonomousAudit)}
              >
                <Bot size={16} /> Run autonomous audit
              </button>
            </div>
          </div>
          {autonomousLog.length > 0 ? (
            <ol className="autopilot-log">
              {autonomousLog.map((entry) => <li key={entry}>{entry}</li>)}
            </ol>
          ) : null}
        </section>
        ) : null}

        {activeSection === 'uploads' ? (
        <section id="uploads" className="workspace-section">
          <SectionHeader icon={<Upload size={18} />} title="Uploads" detail="Contracts, invoice exports, and usage exports are stored under org-scoped paths." />
          <section className="metric-grid compact-metrics">
            <Metric label="Contracts" value={String(documents.filter((document) => document.document_type === 'contract').length)} detail="Uploaded source agreements" />
            <Metric label="Invoices" value={String(documents.filter((document) => document.document_type === 'invoice_csv').length)} detail="Invoice CSV batches" />
            <Metric label="Usage records" value={String(documents.filter((document) => document.document_type === 'usage_csv').length)} detail="Seat or usage files" />
            <Metric label="Seat/customer data" value={String(documents.filter((document) => document.document_type === 'customer_csv').length)} detail="Optional analytics metadata" />
            <Metric label="Parsing success rate" value={documents.length > 0 ? `${Math.round((documents.filter((document) => document.parse_status === 'parsed').length / documents.length) * 100)}%` : '0%'} detail="Parsed documents" />
            <Metric label="Processing failures" value={String(parsingFailures)} detail="Needs operator attention" tone="danger" />
          </section>
          <ChartCard title="Document processing pipeline" scope="Internal pipeline">
            <FunnelPanel points={documentPipelinePoints} />
          </ChartCard>
          <form
            className="upload-intake"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
              const files = Array.from(input.files ?? []);
              if (files.length === 0 || !selectedOrgId || !selectedWorkspaceId) return setError('Choose at least one file and workspace first.');
              runTask(async () => {
                setUploadProgress({ completed: 0, total: files.length });
                for (const [index, file] of files.entries()) {
                  const form = new FormData();
                  form.set('organization_id', selectedOrgId);
                  form.set('workspace_id', selectedWorkspaceId);
                  form.set('document_type', documentType);
                  if (documentType === 'contract') {
                    if (uploadCustomerId) {
                      form.set('customer_id', uploadCustomerId);
                    } else {
                      if (uploadCustomerExternalId.trim()) form.set('customer_external_id', uploadCustomerExternalId.trim());
                      if (uploadCustomerName.trim()) form.set('customer_name', uploadCustomerName.trim());
                      if (uploadCustomerDomain.trim()) form.set('domain', uploadCustomerDomain.trim());
                    }
                  }
                  form.set('file', file);
                  await apiFetch(session, '/api/documents/upload', { method: 'POST', body: form });
                  setUploadProgress({ completed: index + 1, total: files.length });
                }
                setMessage(`${files.length} file${files.length === 1 ? '' : 's'} uploaded and recorded.`);
                await Promise.all([
                  refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId),
                  refreshWorkspaceAnalytics(session, selectedOrgId, selectedWorkspaceId)
                ]);
                input.value = '';
                setUploadProgress(null);
              });
            }}
          >
            <label className="upload-dropzone">
              <Upload size={28} />
              <strong>Drop contracts, invoices, usage records, or seat data here</strong>
              <span>PDF, DOCX, TXT, and CSV files. Batch upload is supported; choose the document class before sending.</span>
              <input name="file" type="file" multiple />
            </label>
            <div className="upload-sidecar">
              <label>
                Document classification
                <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} aria-label="Document type">
                  {documentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              {documentType === 'contract' ? (
                <div className="customer-assignment-panel">
                  <label>
                    Customer account
                    <select
                      value={uploadCustomerId}
                      onChange={(event) => setUploadCustomerId(event.target.value)}
                      aria-label="Customer account"
                    >
                      <option value="">Unassigned or create from fields</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}{customer.external_id ? ` (${customer.external_id})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!uploadCustomerId ? (
                    <>
                      <label>
                        Customer external ID
                        <input value={uploadCustomerExternalId} onChange={(event) => setUploadCustomerExternalId(event.target.value)} placeholder="acct_123 or ERP ID" />
                      </label>
                      <label>
                        Customer name
                        <input value={uploadCustomerName} onChange={(event) => setUploadCustomerName(event.target.value)} placeholder="Acme Retail Ltd." />
                      </label>
                      <label>
                        Domain
                        <input value={uploadCustomerDomain} onChange={(event) => setUploadCustomerDomain(event.target.value)} placeholder="acme.com" />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="support-list">
                <span><FileText size={15} /> Contracts and amendments</span>
                <span><CircleDollarSign size={15} /> Invoice exports</span>
                <span><Activity size={15} /> Usage and seat records</span>
                <span><ShieldCheck size={15} /> Tenant-scoped storage</span>
              </div>
              {uploadProgress ? (
                <div className="upload-progress">
                  <div><strong>{uploadProgress.completed}/{uploadProgress.total}</strong><span>uploaded</span></div>
                  <meter min={0} max={uploadProgress.total} value={uploadProgress.completed} />
                </div>
              ) : null}
              <button type="submit"><Upload size={16} /> Upload batch</button>
            </div>
          </form>
          <DataTable
            columns={['Classification', 'File', 'Customer', 'Parse', 'Text', 'Embedding', 'Size', 'Uploaded', 'Action']}
            rows={documents.map((document) => [
              document.document_type,
              document.file_name,
              document.document_type === 'contract' ? formatCustomerLabel(document.customers, document.customer_id) : 'CSV row mapping',
              document.parse_status,
              document.extracted_text_status ?? document.chunking_status ?? 'pending',
              document.embedding_status ?? 'pending',
              `${Math.round(document.size_bytes / 1024)} KB`,
              formatDate(document.created_at),
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
                    await Promise.all([
                      refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId),
                      refreshWorkspaceAnalytics(session, selectedOrgId, selectedWorkspaceId)
                    ]);
                  });
                }}
              >
                Embed
              </button>
            ])}
            empty="No source documents uploaded yet."
          />
        </section>
        ) : null}

        {activeSection === 'evidence' ? (
        <section id="search" className="workspace-section">
          <SectionHeader icon={<ShieldCheck size={18} />} title="Semantic evidence search" detail="Gemini embeddings suggest tenant-scoped evidence. A reviewer still decides what supports a finding." />
          <section className="metric-grid compact-metrics">
            <Metric label="Evidence candidates" value={String(evidenceCandidates.length)} detail="Suggested source chunks" />
            <Metric label="Attached evidence" value={String(selectedFindingDetail?.evidence.length ?? 0)} detail="For selected finding" />
            <Metric label="Unattached candidates" value={String(evidenceCandidates.filter((candidate) => candidate.approval_state === 'suggested').length)} detail="Needs reviewer decision" tone="warning" />
          </section>
          <section className="chart-grid two-up">
            <ChartCard title="Evidence approval state" scope="Needs finance review">
              <DonutChartPanel points={groupLocalStatus(evidenceCandidates.map((candidate) => candidate.approval_state))} />
            </ChartCard>
            <ChartCard title="Evidence source types" scope="Internal pipeline">
              <BarChartPanel points={groupLocalStatus(searchResults.map((result) => result.source_label.split(':')[0] ?? 'Source document'))} />
            </ChartCard>
          </section>
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
          <div className="evidence-workspace">
            <div className="evidence-results">
              {searchResults.length === 0 ? (
                <EmptyState title="No semantic evidence results yet" detail="Search a pricing clause, invoice line, renewal term, or usage discrepancy to preview matching source chunks." />
              ) : searchResults.map((result) => (
                <article key={result.chunk_id} className="evidence-result">
                  <div>
                    <span>{result.source_label}</span>
                    <strong>{Math.round(result.similarity * 100)}% relevance</strong>
                  </div>
                  <p>{highlightQuery(result.content, searchQuery)}</p>
                  <button onClick={() => runTask(() => attachEvidenceCandidate(result))}>
                    <Link2 size={16} /> Attach to finding
                  </button>
                </article>
              ))}
            </div>
            <aside className="document-preview">
              <FileSearch size={22} />
              <span>Document preview</span>
              <strong>{searchResults[0]?.source_label ?? 'No source selected'}</strong>
              <p>{searchResults[0] ? searchResults[0].content.slice(0, 620) : 'Run evidence search to inspect the most relevant source chunk before attaching it to a finding.'}</p>
            </aside>
          </div>
        </section>
        ) : null}

        {['terms', 'contracts'].includes(activeSection) ? (
        <section id="terms" className="workspace-section">
          <SectionHeader icon={<ClipboardCheck size={18} />} title="Extracted terms" detail="Human approval is required before reconciliation uses a term." />
          <section className="metric-grid compact-metrics">
            <Metric label="Terms approved" value={String(approvedTerms)} detail="Approved or edited" tone="good" />
            <Metric label="Terms pending" value={String(terms.filter((term) => ['extracted', 'needs_review'].includes(term.review_status)).length)} detail="Awaiting review" tone="warning" />
            <Metric label="Terms rejected" value={String(terms.filter((term) => term.review_status === 'rejected').length)} detail="Excluded from calculations" tone="danger" />
            <Metric label="Low-confidence terms" value={String(terms.filter((term) => term.confidence < 0.65).length)} detail="Requires human proof" tone="warning" />
          </section>
          <section className="chart-grid two-up">
            <ChartCard title="Clauses by type" scope="Internal pipeline">
              <BarChartPanel points={groupLocalTerms(terms)} />
            </ChartCard>
            <ChartCard title="Term review status" scope="Internal pipeline">
              <DonutChartPanel points={groupLocalStatus(terms.map((term) => term.review_status))} />
            </ChartCard>
          </section>
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
            columns={['Customer/account', 'Clause type', 'Extracted value', 'Approved value', 'Confidence', 'Source', 'Reviewer', 'Review status', 'Action']}
            rows={terms.map((term) => [
              term.customer_id ? shortId(term.customer_id) : 'Unassigned account',
              term.term_type.replaceAll('_', ' '),
              previewValue(term.term_value),
              <textarea
                key={`${term.id}-value`}
                className="compact-textarea"
                value={termDrafts[term.id] ?? previewValue(term.term_value)}
                onChange={(event) => setTermDrafts((current) => ({ ...current, [term.id]: event.target.value }))}
                aria-label={`Reviewed value for ${term.term_type}`}
              />,
              `${Math.round(term.confidence * 100)}%`,
              <span key={`${term.id}-citation`} className="stacked-text">
                <strong>{term.citation?.label ?? 'Missing'}</strong>
                <span>{term.citation?.excerpt ?? 'No excerpt provided.'}</span>
              </span>,
              term.reviewer_user_id ? shortId(term.reviewer_user_id) : 'Unassigned',
              <StatusBadge key={`${term.id}-status`} value={term.review_status} />,
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
        ) : null}

        {['records', 'revenue-records'].includes(activeSection) ? (
        <section id="records" className="workspace-section">
          <SectionHeader icon={<FileText size={18} />} title="Billing and usage records" detail="Invoice and usage CSVs are normalized into reviewable rows with row citations." />
          <section className="chart-grid two-up">
            <ChartCard title="Usage variance by metric" scope="Internal pipeline">
              <BarChartPanel points={operationsAnalytics?.usageVariance ?? []} />
            </ChartCard>
            <ChartCard title="Billing rows processed" scope="Internal pipeline">
              <FunnelPanel points={[
                { label: 'Invoice rows', value: invoices.length, count: invoices.length },
                { label: 'Usage rows', value: usage.length, count: usage.length }
              ]} />
            </ChartCard>
          </section>
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
        ) : null}

        {activeSection === 'findings' ? (
        <section id="findings" className="workspace-section">
          <SectionHeader icon={<AlertTriangle size={18} />} title="Findings" detail="Every amount is calculated by deterministic code and must remain evidence-backed." />
          <section className="metric-grid compact-metrics">
            <Metric label="Total findings" value={String(findings.length)} detail="All workflow states" />
            <Metric label="Total value" value={formatMoney(findings.reduce((sum, finding) => sum + finding.estimated_amount_minor, 0), displayCurrency)} detail="All workflow states" tone="danger" />
            <Metric label="Recoverable amount" value={formatMoney(recoverableMinor, displayCurrency)} detail="Approved recoverable findings" tone="good" />
            <Metric label="Prevented amount" value={formatMoney(preventedMinor, displayCurrency)} detail="Approved prevention findings" tone="warning" />
            <Metric label="High priority" value={String(highPriorityFindings)} detail="Severity high or critical" tone="danger" />
            <Metric label="Pending review" value={String(openFindings.length)} detail="Internal pipeline" tone="warning" />
          </section>
          <div className="status-chip-row">
            {(reviewBurdenAnalytics?.allStatuses ?? groupLocalStatus(findings.map((finding) => finding.status))).map((item) => (
              <span key={item.label} className="status-chip">{item.label}: {item.value}</span>
            ))}
          </div>
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
                  await Promise.all([
                    refreshWorkspaceData(session, selectedOrgId, selectedWorkspaceId),
                    refreshWorkspaceAnalytics(session, selectedOrgId, selectedWorkspaceId)
                  ]);
                });
              }}
            >
              <Play size={16} /> Run reconciliation
            </button>
          </div>
          <DataTable
            columns={['Finding title', 'Account/customer', 'Leakage category', 'Amount', 'Recoverable/prevented', 'Priority', 'Confidence', 'Status', 'Evidence', 'Last updated', 'Assigned reviewer', 'Action']}
            rows={findings.map((finding) => [
              <span className="finding-title-cell" key={`${finding.id}-title`}>
                <strong>{finding.title}</strong>
                <small>{finding.summary}</small>
              </span>,
              finding.customer_id ? shortId(finding.customer_id) : 'Unassigned account',
              finding.finding_type.replaceAll('_', ' '),
              <span key={`${finding.id}-amount`} className="amount-strong">{formatMoney(finding.estimated_amount_minor, finding.currency)}</span>,
              (finding.outcome_type ?? 'recoverable_leakage').replaceAll('_', ' '),
              <StatusBadge key={`${finding.id}-priority`} value={finding.severity ?? 'medium'} tone={['high', 'critical'].includes(String(finding.severity ?? '')) ? 'danger' : 'muted'} />,
              `${Math.round(finding.confidence * 100)}%`,
              <StatusBadge key={`${finding.id}-status`} value={finding.status} />,
              `${evidenceCandidates.filter((candidate) => candidate.finding_id === finding.id).length} candidate${evidenceCandidates.filter((candidate) => candidate.finding_id === finding.id).length === 1 ? '' : 's'}`,
              finding.updated_at ? formatDate(finding.updated_at) : 'Not updated',
              <select
                key={`${finding.id}-assignee`}
                value={finding.reviewer_user_id ?? ''}
                disabled={!selectedOrgCanManageRoles}
                onChange={(event) => runTask(() => assignFinding(finding.id, event.target.value))}
                aria-label={`Assigned reviewer for ${finding.title}`}
              >
                <option value="">Unassigned</option>
                {assignableReviewers.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {memberLabel(member)}
                  </option>
                ))}
              </select>,
              <span className="button-group" key={finding.id}>
                <Link className="button-link secondary-button" href={`/app/findings/${finding.id}`}>
                  Details
                </Link>
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
              onUpdateStatus={(status) => runTask(() => updateFindingStatus(selectedFinding.id, status))}
              canMutateFindings={selectedOrgCanReviewFindings}
            />
          ) : null}
        </section>
        ) : null}

        {activeSection === 'finding-detail' ? (
        <section id="finding-detail" className="workspace-section">
          <SectionHeader icon={<AlertTriangle size={18} />} title="Finding detail" detail="Evidence-first review of the missed revenue, calculation, proof, and next action." />
          {selectedFinding ? (
            <FindingDetailPanel
              finding={selectedFindingDetail?.finding ?? selectedFinding}
              evidence={selectedFindingDetail?.evidence ?? []}
              candidates={evidenceCandidates.filter((candidate) => candidate.finding_id === selectedFinding.id)}
              onApproveCandidate={(candidateId) => runTask(() => decideEvidenceCandidate(candidateId, 'approve'))}
              onRejectCandidate={(candidateId) => runTask(() => decideEvidenceCandidate(candidateId, 'reject'))}
              onRemoveEvidence={(evidenceItemId) => runTask(() => removeEvidenceItem(evidenceItemId))}
              onUpdateStatus={(status) => runTask(() => updateFindingStatus(selectedFinding.id, status))}
              canMutateFindings={selectedOrgCanReviewFindings}
            />
          ) : (
            <EmptyState title="No finding selected" detail="Open a finding from the findings table to review its amount, evidence, formula, and approval status." />
          )}
        </section>
        ) : null}

        {activeSection === 'analytics' ? (
        <section id="analytics" className="workspace-section analytics-section">
          <SectionHeader icon={<BarChart3 size={18} />} title="Analytics" detail="Customer-facing charts use only approved, customer-ready, and recovered findings. Internal charts are labeled separately." />
          <section className="metric-grid compact-metrics">
            <Metric label="Customer-facing leakage" value={formatMoney(customerFacingTotalMinor, displayCurrency)} detail="Approved statuses only" tone="good" />
            <Metric label="Internal pipeline" value={formatMoney(internalPipelineTotalMinor, displayCurrency)} detail="Unapproved exposure" tone="warning" />
            <Metric label="Review burden" value={String(openFindings.length)} detail="Draft and needs-review findings" tone="warning" />
            <Metric label="Average review time" value={reviewBurdenAnalytics?.averageReviewTurnaroundHours === null || reviewBurdenAnalytics?.averageReviewTurnaroundHours === undefined ? 'Not enough data' : `${reviewBurdenAnalytics.averageReviewTurnaroundHours}h`} detail="Created to reviewed" />
          </section>
          <section className="chart-grid">
            <ChartCard title="Leakage trend by month" scope="Customer-facing leakage"><TrendChartPanel data={customerFacingAnalytics?.trend ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Leakage by account segment" scope="Customer-facing leakage"><BarChartPanel points={customerFacingAnalytics?.bySegment ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Leakage by contract type" scope="Internal pipeline"><BarChartPanel points={internalPipelineAnalytics?.byContractType ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Leakage by billing model" scope="Customer-facing leakage"><BarChartPanel points={customerFacingAnalytics?.byBillingModel ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Leakage by reviewer" scope="Needs finance review"><BarChartPanel points={reviewBurdenAnalytics?.reviewerWorkload ?? []} /></ChartCard>
            <ChartCard title="Review turnaround time" scope="Needs finance review"><SingleMetricPanel value={reviewBurdenAnalytics?.averageReviewTurnaroundHours === null || reviewBurdenAnalytics?.averageReviewTurnaroundHours === undefined ? 'Not enough data' : `${reviewBurdenAnalytics.averageReviewTurnaroundHours} hours`} detail="Average time from finding creation to review." /></ChartCard>
            <ChartCard title="Recovery conversion funnel" scope="Customer-facing leakage"><FunnelPanel points={[
              { label: 'Approved', value: approvedFindings.length, count: approvedFindings.length },
              { label: 'Customer ready', value: findings.filter((finding) => finding.status === 'customer_ready').length },
              { label: 'Recovered', value: findings.filter((finding) => finding.status === 'recovered').length }
            ]} /></ChartCard>
            <ChartCard title="Prevented vs recoverable by category" scope="Customer-facing leakage"><BarChartPanel points={customerFacingAnalytics?.byCategory ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Expired discounts trend" scope="Customer-facing leakage"><TrendChartPanel data={customerFacingAnalytics?.discountTrend ?? []} currency={displayCurrency} emptyDetail="Approved discount-related findings across multiple periods are needed for this trend." /></ChartCard>
            <ChartCard title="Missed uplifts trend" scope="Customer-facing leakage"><TrendChartPanel data={customerFacingAnalytics?.upliftTrend ?? []} currency={displayCurrency} emptyDetail="Approved uplift-related findings across multiple periods are needed for this trend." /></ChartCard>
            <ChartCard title="Seat underbilling by product/team/customer" scope="Internal pipeline"><BarChartPanel points={(operationsAnalytics?.usageVariance ?? []).filter((point) => /seat|user|license/i.test(point.label))} /></ChartCard>
            <ChartCard title="Usage variance chart" scope="Internal pipeline"><BarChartPanel points={operationsAnalytics?.usageVariance ?? []} /></ChartCard>
            <ChartCard title="Renewal calendar heatmap" scope="Internal pipeline"><HeatmapPanel points={operationsAnalytics?.renewalCalendar ?? []} /></ChartCard>
            <ChartCard title="Confidence distribution" scope="Needs finance review"><DonutChartPanel points={reviewBurdenAnalytics?.confidenceDistribution ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Top 10 recurring leakage patterns" scope="Internal pipeline"><RankedList points={operationsAnalytics?.recurringPatterns ?? []} /></ChartCard>
          </section>
        </section>
        ) : null}

        {['report', 'reports'].includes(activeSection) ? (
        <section id="report" className="workspace-section report-section">
          <SectionHeader icon={<Printer size={18} />} title="Customer-ready report" detail="Printable, copyable report that includes only approved customer-facing findings." />
          <section className="metric-grid compact-metrics">
            <Metric label="Total recoverable leakage" value={formatMoney(recoverableMinor, displayCurrency)} detail="Approved customer-facing findings" tone="good" />
            <Metric label="Total prevented leakage" value={formatMoney(preventedMinor, displayCurrency)} detail="Approved prevention findings" tone="warning" />
            <Metric label="Total recovered" value={formatMoney(recoveredMinor, displayCurrency)} detail="Marked recovered" tone="good" />
            <Metric label="Approved findings only" value={String(approvedFindings.length)} detail="Report-safe findings" />
          </section>
          <section className="chart-grid report-chart-grid">
            <ChartCard title="Leakage by category" scope="Customer-facing leakage"><BarChartPanel points={customerFacingAnalytics?.byCategory ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Leakage by customer" scope="Customer-facing leakage"><BarChartPanel points={customerFacingAnalytics?.byCustomer ?? []} currency={displayCurrency} layout="vertical" /></ChartCard>
            <ChartCard title="Monthly trend" scope="Customer-facing leakage"><TrendChartPanel data={customerFacingAnalytics?.trend ?? []} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Recoverable vs prevented" scope="Customer-facing leakage"><DonutChartPanel points={[
              { label: 'Recoverable', value: recoverableMinor, amountMinor: recoverableMinor },
              { label: 'Prevented', value: preventedMinor, amountMinor: preventedMinor },
              { label: 'Recovered', value: recoveredMinor, amountMinor: recoveredMinor }
            ]} currency={displayCurrency} /></ChartCard>
            <ChartCard title="Status summary" scope="Needs finance review"><BarChartPanel points={reviewBurdenAnalytics?.allStatuses ?? []} /></ChartCard>
          </section>
          <ExecutiveReportPreview
            report={report}
            reportPackId={reportPackId}
            approvedFindingCount={approvedFindings.length}
            isBusy={isPending}
            onGenerate={() => runTask(generateReport)}
            onCopy={() => runTask(() => exportReport('clipboard'))}
            onDownloadJson={() => runTask(() => exportReport('json'))}
            onExportPdf={() => runTask(() => exportReport('print_pdf'))}
          />
        </section>
        ) : null}

        {activeSection === 'settings' ? (
        <section id="settings" className="workspace-section">
          <SectionHeader icon={<UserCog size={18} />} title="Settings" detail="Workspace controls for audit period, reporting boundaries, and review defaults." />
          <section className="settings-grid">
            <div className="dashboard-card">
              <h3>Audit period</h3>
              <label>Selected period</label>
              <select value={auditPeriod} onChange={(event) => setAuditPeriod(event.target.value)} aria-label="Settings audit period">
                <option>Q2 2026</option>
                <option>Q1 2026</option>
                <option>2026 YTD</option>
                <option>Rolling 12 months</option>
              </select>
              <p className="muted">Analytics filters can use workspace period metadata after the Supabase migration is applied.</p>
            </div>
            <div className="dashboard-card">
              <h3>Reporting boundary</h3>
              <p className="muted">Customer-facing reports include only approved, customer-ready, and recovered findings. Draft and needs-review findings stay internal.</p>
              <div className="status-chip-row">
                <span className="status-chip">approved</span>
                <span className="status-chip">customer_ready</span>
                <span className="status-chip">recovered</span>
              </div>
            </div>
            <div className="dashboard-card">
              <h3>Security posture</h3>
              <p className="muted">Secrets stay server-side, files stay tenant-scoped, and no external customer action is automated from this UI.</p>
            </div>
            <div className="dashboard-card">
              <h3>Review defaults</h3>
              <label>Auto-flag confidence below</label>
              <select defaultValue="85" aria-label="Confidence threshold">
                <option value="90">90%</option>
                <option value="85">85%</option>
                <option value="75">75%</option>
              </select>
              <p className="muted">Low-confidence extracted terms and findings stay in needs-review until a human approves them.</p>
            </div>
            <div className="dashboard-card">
              <h3>Export format</h3>
              <div className="status-chip-row">
                <span className="status-chip">PDF</span>
                <span className="status-chip">JSON</span>
                <span className="status-chip">Clipboard</span>
              </div>
              <p className="muted">Reports stay presentation-ready and evidence-backed for CFO or founder review.</p>
            </div>
          </section>
        </section>
        ) : null}
    </AppShell>
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

const chartColors = ['#1D4ED8', '#059669', '#D97706', '#4F46E5', '#DC2626', '#64748B', '#0F172A'];

function BarChartPanel({
  points,
  currency,
  layout = 'horizontal'
}: {
  points: AnalyticsPoint[];
  currency?: string;
  layout?: 'horizontal' | 'vertical';
}) {
  if (points.length === 0) {
    return <EmptyState title="Not enough data yet" detail="Upload source records, run analysis, and approve findings before this chart can show reliable values." compact />;
  }

  const data = points.slice(0, 10).map((point) => ({ ...point, value: point.amountMinor ?? point.value }));
  const formatter = (value: number) => currency ? formatMoney(value, currency) : String(value);

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout={layout} margin={{ top: 10, right: 12, bottom: 8, left: layout === 'vertical' ? 80 : 8 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          {layout === 'vertical' ? (
            <>
              <XAxis type="number" tickFormatter={(value) => currency ? compactMoney(Number(value), currency) : String(value)} stroke="#94A3B8" fontSize={11} />
              <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={11} width={90} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={55} />
              <YAxis tickFormatter={(value) => currency ? compactMoney(Number(value), currency) : String(value)} stroke="#94A3B8" fontSize={11} />
            </>
          )}
          <Tooltip formatter={(value) => formatter(Number(value))} contentStyle={{ border: '1px solid #E2E8F0', borderRadius: 8 }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#1D4ED8">
            {data.map((entry, index) => <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChartPanel({ points, currency }: { points: AnalyticsPoint[]; currency?: string }) {
  const data = points.filter((point) => point.value > 0 || (point.amountMinor ?? 0) > 0).map((point) => ({
    ...point,
    value: point.amountMinor ?? point.value
  }));

  if (data.length === 0) {
    return <EmptyState title="Not enough data yet" detail="This chart appears after findings have approved status or review data." compact />;
  }

  return (
    <div className="donut-layout">
      <ResponsiveContainer width="48%" height={210}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={86} paddingAngle={3}>
            {data.map((entry, index) => <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />)}
          </Pie>
          <Tooltip formatter={(value) => currency ? formatMoney(Number(value), currency) : String(value)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {data.map((point, index) => (
          <div key={point.label}>
            <span style={{ backgroundColor: chartColors[index % chartColors.length] }} />
            <strong>{point.label}</strong>
            <small>{currency ? formatMoney(point.value, currency) : point.value}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChartPanel({
  data,
  currency = 'USD',
  emptyDetail = 'Approve findings across multiple periods to see customer-facing leakage movement.'
}: {
  data: WorkspaceAnalyticsPayload['customerFacing']['trend'];
  currency?: string;
  emptyDetail?: string;
}) {
  if (data.length === 0) {
    return <EmptyState title="No approved trend yet" detail={emptyDetail} compact />;
  }

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="approvedLeakage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.24} />
              <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="period" stroke="#94A3B8" fontSize={11} />
          <YAxis tickFormatter={(value) => compactMoney(Number(value), currency)} stroke="#94A3B8" fontSize={11} />
          <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
          <Area type="monotone" dataKey="approvedMinor" name="Customer-facing leakage" stroke="#1D4ED8" fill="url(#approvedLeakage)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecoveryChartPanel({ data, currency = 'USD' }: { data: WorkspaceAnalyticsPayload['customerFacing']['recoveryPerformance']; currency?: string }) {
  if (data.length === 0) {
    return <EmptyState title="No recovery trend yet" detail="Mark customer-facing findings as recovered to track recovery performance." compact />;
  }

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="period" stroke="#94A3B8" fontSize={11} />
          <YAxis tickFormatter={(value) => compactMoney(Number(value), currency)} stroke="#94A3B8" fontSize={11} />
          <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
          <Line type="monotone" dataKey="identifiedMinor" name="Identified" stroke="#1D4ED8" strokeWidth={2} />
          <Line type="monotone" dataKey="approvedMinor" name="Approved" stroke="#4F46E5" strokeWidth={2} />
          <Line type="monotone" dataKey="recoveredMinor" name="Recovered" stroke="#059669" strokeWidth={2} />
          <Line type="monotone" dataKey="preventedMinor" name="Prevented" stroke="#D97706" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FunnelPanel({ points }: { points: AnalyticsPoint[] }) {
  if (points.length === 0) {
    return <EmptyState title="No pipeline data yet" detail="Upload and process documents to populate this pipeline." compact />;
  }

  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div className="funnel-list">
      {points.map((point) => (
        <div key={point.label}>
          <div>
            <strong>{point.label}</strong>
            <span>{point.value}</span>
          </div>
          <meter min={0} max={max} value={point.value} />
        </div>
      ))}
    </div>
  );
}

function RankedList({ points, currency }: { points: AnalyticsPoint[]; currency?: string }) {
  if (points.length === 0) {
    return <EmptyState title="No ranked data yet" detail="This list fills in after the workspace has matching findings or records." compact />;
  }

  return (
    <ol className="ranked-list">
      {points.slice(0, 10).map((point, index) => (
        <li key={point.label}>
          <span>{index + 1}</span>
          <strong>{point.label}</strong>
          <em>{currency && point.amountMinor !== undefined ? formatMoney(point.amountMinor, currency) : point.value}</em>
        </li>
      ))}
    </ol>
  );
}

function AccountRiskTable({ rows, currency }: { rows: AccountRiskRow[]; currency: string }) {
  if (rows.length === 0) {
    return <EmptyState title="No accounts at risk yet" detail="Approved findings with customer links will populate the ranked account view." compact />;
  }

  return (
    <div className="account-risk-list">
      {rows.slice(0, 6).map((row) => (
        <article key={row.account}>
          <div>
            <strong>{row.account}</strong>
            <span>{row.categoryMix}</span>
          </div>
          <em>{formatMoney(row.amountMinor, currency)}</em>
          <StatusBadge value={row.status} />
          <small>{row.confidence}% confidence / {row.evidenceCount} evidence</small>
        </article>
      ))}
    </div>
  );
}

function StatusSegments({ points }: { points: AnalyticsPoint[] }) {
  if (points.length === 0) {
    return <EmptyState title="No status data yet" detail="Findings will appear here once reconciliation creates review items." compact />;
  }

  const total = points.reduce((sum, point) => sum + point.value, 0) || 1;
  return (
    <div className="status-segments">
      <div className="segment-bar" aria-label="Findings by status">
        {points.map((point, index) => (
          <span key={point.label} style={{ width: `${Math.max(6, (point.value / total) * 100)}%`, backgroundColor: chartColors[index % chartColors.length] }} />
        ))}
      </div>
      <div className="segment-legend">
        {points.map((point, index) => (
          <div key={point.label}>
            <span style={{ backgroundColor: chartColors[index % chartColors.length] }} />
            <strong>{point.label}</strong>
            <em>{point.value}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapPanel({ points }: { points: AnalyticsPoint[] }) {
  if (points.length === 0) {
    return <EmptyState title="No renewal calendar data" detail="Upload contract terms with renewal or notice clauses to populate this view." compact />;
  }

  return (
    <div className="heatmap-grid">
      {points.slice(0, 12).map((point, index) => (
        <div key={point.label} style={{ opacity: Math.max(0.45, 1 - index * 0.04) }}>
          <strong>{point.value}</strong>
          <span>{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function SingleMetricPanel({ value, detail }: { value: string; detail: string }) {
  return (
    <div className="single-metric-panel">
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function EvidenceMiniList({ items, empty }: { items: EvidenceItemRow[]; empty: string }) {
  if (items.length === 0) return <p className="muted">{empty}</p>;

  return (
    <div className="evidence-mini-list">
      {items.slice(0, 4).map((item) => (
        <article key={item.id}>
          <span>{item.evidence_type.replaceAll('_', ' ')}</span>
          <strong>{item.citation?.label ?? 'Source evidence'}</strong>
          <p>{item.excerpt ?? item.citation?.excerpt ?? 'No excerpt saved.'}</p>
        </article>
      ))}
    </div>
  );
}

function groupLocalStatus(values: string[]): AnalyticsPoint[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value, count: value }));
}

function groupLocalTerms(terms: ContractTermRow[]): AnalyticsPoint[] {
  return groupLocalStatus(terms.map((term) => term.term_type));
}

function buildAuditPipelinePoints(input: {
  documents: SourceDocument[];
  terms: ContractTermRow[];
  findings: FindingRow[];
  reportReady: boolean;
}): AnalyticsPoint[] {
  if (input.documents.length === 0 && input.terms.length === 0 && input.findings.length === 0 && !input.reportReady) return [];

  const parsed = input.documents.filter((document) => document.parse_status === 'parsed').length;
  const embedded = input.documents.filter((document) => document.embedding_status === 'embedded').length;
  const reviewedTerms = input.terms.filter((term) => ['approved', 'edited'].includes(term.review_status)).length;
  const reportCount = input.reportReady ? 1 : input.findings.some((finding) => ['customer_ready', 'recovered'].includes(finding.status)) ? 1 : 0;

  return [
    { label: 'Uploaded', value: input.documents.length, count: input.documents.length },
    { label: 'Parsed', value: parsed, count: parsed },
    { label: 'Embedded', value: embedded, count: embedded },
    { label: 'Extracted', value: input.terms.length, count: input.terms.length },
    { label: 'Reviewed', value: reviewedTerms, count: reviewedTerms },
    { label: 'Reconciled', value: input.findings.length, count: input.findings.length },
    { label: 'Reported', value: reportCount, count: reportCount }
  ];
}

function buildContractHealthPoints(documents: SourceDocument[], terms: ContractTermRow[]): AnalyticsPoint[] {
  if (documents.length === 0 && terms.length === 0) return [];

  const contractDocuments = documents.filter((document) => document.document_type === 'contract');
  const approvedOrEdited = terms.filter((term) => ['approved', 'edited'].includes(term.review_status));
  const pendingTerms = terms.filter((term) => ['extracted', 'needs_review'].includes(term.review_status));
  const highRiskTerms = terms.filter((term) =>
    /discount|uplift|minimum|renewal|notice|overage/i.test(term.term_type) && (term.confidence < 0.85 || term.review_status === 'needs_review')
  ).length;
  const renewalClauses = terms.filter((term) => /renewal|notice|contract_end/i.test(term.term_type)).length;
  const fullyReviewedContracts = contractDocuments.length > 0 && terms.length > 0 && pendingTerms.length === 0
    ? contractDocuments.length
    : approvedOrEdited.length > 0
      ? 1
      : 0;

  return [
    { label: 'Contracts fully reviewed', value: fullyReviewedContracts, count: fullyReviewedContracts },
    { label: 'Contracts pending review', value: Math.max(contractDocuments.length - fullyReviewedContracts, pendingTerms.length), count: pendingTerms.length },
    { label: 'High-risk terms detected', value: highRiskTerms, count: highRiskTerms },
    { label: 'Renewal clauses nearing deadlines', value: renewalClauses, count: renewalClauses }
  ];
}

function buildAccountRiskRows(findings: FindingRow[], candidates: EvidenceCandidateRow[]): AccountRiskRow[] {
  const grouped = new Map<string, { amountMinor: number; categories: Set<string>; statuses: Map<string, number>; confidenceTotal: number; count: number; evidenceCount: number }>();
  const source = findings.filter((finding) => isCustomerFacingFindingStatus(finding.status));

  for (const finding of source) {
    const account = finding.customer_id ? shortId(finding.customer_id) : 'Unassigned account';
    const current = grouped.get(account) ?? {
      amountMinor: 0,
      categories: new Set<string>(),
      statuses: new Map<string, number>(),
      confidenceTotal: 0,
      count: 0,
      evidenceCount: 0
    };
    current.amountMinor += finding.estimated_amount_minor;
    current.categories.add(finding.finding_type.replaceAll('_', ' '));
    current.statuses.set(finding.status, (current.statuses.get(finding.status) ?? 0) + 1);
    current.confidenceTotal += finding.confidence;
    current.count += 1;
    current.evidenceCount += candidates.filter((candidate) => candidate.finding_id === finding.id).length;
    grouped.set(account, current);
  }

  return Array.from(grouped.entries())
    .map(([account, value]) => ({
      account,
      amountMinor: value.amountMinor,
      categoryMix: Array.from(value.categories).slice(0, 3).join(', ') || 'No category',
      status: Array.from(value.statuses.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'needs_review',
      confidence: Math.round((value.confidenceTotal / Math.max(value.count, 1)) * 100),
      evidenceCount: value.evidenceCount
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

function highlightQuery(content: string, query: string): string {
  const importantTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 4)
    .slice(0, 3);
  const excerpt = content.slice(0, 300);
  if (importantTerms.length === 0) return excerpt;
  const firstMatch = importantTerms.find((term) => excerpt.toLowerCase().includes(term));
  if (!firstMatch) return excerpt;
  const index = excerpt.toLowerCase().indexOf(firstMatch);
  const start = Math.max(0, index - 70);
  return `${start > 0 ? '...' : ''}${excerpt.slice(start, Math.min(excerpt.length, index + 220))}`;
}

function FindingDetailPanel({
  finding,
  evidence,
  candidates,
  onApproveCandidate,
  onRejectCandidate,
  onRemoveEvidence,
  onUpdateStatus,
  canMutateFindings
}: {
  finding: FindingRow;
  evidence: EvidenceItemRow[];
  candidates: EvidenceCandidateRow[];
  onApproveCandidate: (candidateId: string) => void;
  onRejectCandidate: (candidateId: string) => void;
  onRemoveEvidence: (evidenceItemId: string) => void;
  onUpdateStatus: (status: FindingStatusAction) => void;
  canMutateFindings: boolean;
}) {
  const formula = typeof finding.calculation?.formula === 'string' ? finding.calculation.formula : 'See calculation inputs';
  const calculationInputs = typeof finding.calculation?.inputs === 'object' && finding.calculation.inputs
    ? finding.calculation.inputs
    : finding.calculation;
  const contractEvidence = evidence.filter((item) => item.evidence_type === 'contract_term' || item.citation?.sourceType === 'contract');
  const invoiceUsageEvidence = evidence.filter((item) =>
    ['invoice_row', 'usage_row'].includes(item.evidence_type) || ['invoice', 'usage'].includes(String(item.citation?.sourceType ?? ''))
  );
  const linkedDocumentLabels = Array.from(new Set([
    ...evidence.map((item) => item.citation?.label).filter(Boolean),
    ...candidates.map((candidate) => candidate.document_chunk?.source_label).filter(Boolean)
  ])) as string[];
  const uncertaintyNotes = [
    finding.confidence < 0.85 ? 'Confidence is below the normal approval threshold.' : null,
    evidence.length === 0 ? 'No approved evidence is attached yet.' : null,
    finding.evidence_coverage_status && finding.evidence_coverage_status !== 'complete' ? `Evidence coverage is ${finding.evidence_coverage_status}.` : null,
    finding.status === 'needs_review' ? 'A reviewer already marked this finding for follow-up.' : null
  ].filter((note): note is string => Boolean(note));
  const activityItems = [
    finding.created_at ? { label: 'Finding created', value: formatDate(finding.created_at) } : null,
    finding.updated_at ? { label: 'Last updated', value: formatDate(finding.updated_at) } : null,
    finding.reviewed_at ? { label: 'Reviewed', value: formatDate(finding.reviewed_at) } : null,
    finding.reviewer_user_id ? { label: 'Reviewer', value: shortId(finding.reviewer_user_id) } : null
  ].filter((item): item is { label: string; value: string } => Boolean(item));
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
      <div className="finding-detail-hero">
        <div>
          <p className="eyebrow">Finding detail</p>
          <h3>{finding.title}</h3>
          <p>{finding.summary}</p>
        </div>
        <div className="finding-amount-card">
          <span>Amount involved</span>
          <strong>{formatMoney(finding.estimated_amount_minor, finding.currency)}</strong>
          <StatusBadge value={finding.status} />
        </div>
      </div>

      <div className="detail-facts detail-facts-row">
        <span>Category: {finding.finding_type.replaceAll('_', ' ')}</span>
        <span>Classification: {(finding.outcome_type ?? 'recoverable_leakage').replaceAll('_', ' ')}</span>
        <span>Priority: {finding.severity ?? 'medium'}</span>
        <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
        <span>Evidence: {evidence.length} approved / {candidates.length} candidate</span>
      </div>

      <section className="detail-card-grid">
        <article className="detail-card">
          <h4>Executive summary</h4>
          <p>{finding.detailed_explanation ?? finding.summary}</p>
        </article>
        <article className="detail-card formula-card">
          <h4>Calculation formula</h4>
          <FormulaBlock
            formula={formula}
            detail="Money values are calculated in deterministic code after extracted terms are reviewed."
          />
        </article>
        <article className="detail-card">
          <h4>Recommended action</h4>
          <p>{finding.recommended_action ?? 'Review supporting evidence and decide whether this should become customer-ready.'}</p>
        </article>
      </section>

      <ReviewDrawer
        title="Status transition controls"
        detail="Move the finding through finance review only after the evidence and calculation are acceptable."
        actions={(
          <div className="button-group">
          {findingStatusActions.map((action) => (
            <button
              key={action.value}
              className={action.tone === 'danger' ? 'danger-button' : 'secondary-button'}
              disabled={!canMutateFindings}
              onClick={() => onUpdateStatus(action.value)}
            >
              {action.label}
            </button>
          ))}
          </div>
        )}
      />

      <div className="split-grid">
        <div className="detail-card">
          <h4>Inputs used</h4>
          <pre className="json-block">{JSON.stringify(calculationInputs, null, 2)}</pre>
        </div>
        <div className="detail-card">
          <h4>Reviewer notes</h4>
          <p>{finding.review_note ?? 'No reviewer note yet.'}</p>
          <h4>AI explanation</h4>
          <p>{finding.detailed_explanation ?? 'The AI explanation is not available yet. Use the calculation, evidence, and source records for approval.'}</p>
          <h4>Review risk</h4>
          {uncertaintyNotes.length === 0 ? (
            <p>Evidence and confidence look ready for final finance review.</p>
          ) : (
            <ul className="compact-list">
              {uncertaintyNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
        </div>
      </div>

      <section className="detail-card-grid two-up">
        <EvidencePanel title="Contract evidence">
          <EvidenceMiniList items={contractEvidence} empty="No approved contract clause evidence is attached yet." />
        </EvidencePanel>
        <EvidencePanel title="Invoice / usage evidence">
          <EvidenceMiniList items={invoiceUsageEvidence} empty="No approved invoice or usage evidence is attached yet." />
        </EvidencePanel>
      </section>

      <div>
        <h4>Evidence attachments</h4>
        <DataTable
          columns={['Type', 'Status', 'Citation', 'Excerpt', 'Action']}
          rows={evidence.map((item) => [
            item.evidence_type.replaceAll('_', ' '),
            item.approval_state,
            item.citation?.label ?? 'Source',
            item.excerpt ?? item.citation?.excerpt ?? 'No excerpt saved.',
            <button className="danger-button" key={item.id} disabled={!canMutateFindings} onClick={() => onRemoveEvidence(item.id)}>
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
              <button disabled={!canMutateFindings} onClick={() => onApproveCandidate(candidate.id)}><CheckCircle2 size={16} /> Approve</button>
              <button className="danger-button" disabled={!canMutateFindings} onClick={() => onRejectCandidate(candidate.id)}>Reject</button>
            </span>
          ])}
          empty="No evidence candidates attached yet."
        />
      </div>

      <section className="detail-card-grid three-up">
        <article className="detail-card">
          <h4>Linked documents</h4>
          {linkedDocumentLabels.length === 0 ? (
            <p className="muted">No linked documents yet.</p>
          ) : (
            <ul className="compact-list">
              {linkedDocumentLabels.slice(0, 8).map((label) => <li key={label}>{label}</li>)}
            </ul>
          )}
        </article>
        <article className="detail-card">
          <h4>Activity history</h4>
          {activityItems.length === 0 ? (
            <p className="muted">No activity timestamps available yet.</p>
          ) : (
            <ol className="activity-list">
              {activityItems.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.value}</strong></li>)}
            </ol>
          )}
        </article>
        <article className="detail-card">
          <h4>Draft customer note</h4>
          <pre className="note-block">{draftCustomerNote}</pre>
        </article>
      </section>
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

function compactMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(amountMinor / 100);
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

function formatCustomerLabel(customerRelation: SourceDocument['customers'], customerId?: string | null): string {
  const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
  if (customer?.name) {
    return customer.external_id ? `${customer.name} (${customer.external_id})` : customer.name;
  }

  return customerId ? shortId(customerId) : 'Review needed: unassigned';
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function memberLabel(member: OrganizationMember): string {
  return `${shortId(member.user_id)} (${member.role})`;
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
  const labels = report.displayLabels ?? {
    customerFacingLeakage: 'Customer-facing leakage',
    approvedEvidenceOnly: 'Approved evidence only',
    humanReviewed: 'Human reviewed',
    generatedAt: 'Generated at',
    includedStatuses: 'Included statuses'
  };
  const topFindingLines = report.topFindings.length > 0
    ? report.topFindings.map((finding, index) => `${index + 1}. ${finding.title} - ${formatMoney(finding.amountMinor, finding.currency)} (${formatReportLabel(finding.status)})`)
    : ['No findings passed export readiness.'];
  const customerLines = (report.customerBreakdown ?? []).map((row) => `- ${formatReportLabel(row.label)}: ${formatMoney(row.amountMinor, report.currency)} across ${row.findingCount} finding${row.findingCount === 1 ? '' : 's'}`);
  const categoryLines = (report.categoryBreakdown ?? []).map((row) => `- ${formatReportLabel(row.label)}: ${formatMoney(row.amountMinor, report.currency)} across ${row.findingCount} finding${row.findingCount === 1 ? '' : 's'}`);
  const appendixLines = (report.appendixWithCitations ?? []).flatMap((entry) => [
    `- ${entry.title}`,
    ...entry.citations.map((citation) => `  - ${formatReportLabel(citation.sourceType ?? 'source')}: ${citation.label}${citation.excerpt ? ` (${citation.excerpt})` : ''}`)
  ]);

  return [
    `${report.organizationName} - ${report.workspaceName}`,
    `${labels.generatedAt}: ${formatReportDateTime(report.generatedAt)}`,
    `${labels.includedStatuses}: ${(report.metadata?.included_statuses ?? []).map(formatReportLabel).join(', ')}`,
    `${labels.customerFacingLeakage} / ${labels.approvedEvidenceOnly} / ${labels.humanReviewed}`,
    '',
    'Executive summary:',
    report.executiveSummary?.summary ?? report.methodologyNote,
    '',
    `Total recoverable leakage: ${formatMoney(report.totalApprovedRecoverableMinor, report.currency)}`,
    `Total prevented future leakage: ${formatMoney(report.totalPreventedLeakageMinor, report.currency)}`,
    `Recovered amount: ${formatMoney(report.totalRecoveredMinor, report.currency)}`,
    `Risk-only items: ${report.totalRiskOnlyItems}`,
    '',
    'Top findings:',
    ...topFindingLines,
    '',
    'Findings by customer:',
    ...(customerLines.length > 0 ? customerLines : ['No customer breakdown yet.']),
    '',
    'Findings by category:',
    ...(categoryLines.length > 0 ? categoryLines : ['No category breakdown yet.']),
    '',
    'Methodology:',
    ...(report.methodology ?? [report.methodologyNote]).map((item) => `- ${item}`),
    '',
    'Appendix with citations:',
    ...(appendixLines.length > 0 ? appendixLines : ['No approved citations yet.'])
  ].join('\n');
}

function formatReportLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatReportDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
