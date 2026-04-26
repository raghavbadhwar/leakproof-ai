import { RevenueAuditWorkspace } from '@/components/audit/RevenueAuditWorkspace';

export default async function FindingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RevenueAuditWorkspace section="finding-detail" findingId={id} />;
}
