const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

if (!appUrl) {
  console.error('Missing NEXT_PUBLIC_APP_URL or APP_URL.');
  process.exit(1);
}

const mockWorkspaceId = process.env.SMOKE_WORKSPACE_ID || '11111111-1111-4111-8111-111111111111';
const mockOrganizationId = process.env.SMOKE_ORGANIZATION_ID || '22222222-2222-4222-8222-222222222222';
const analyticsHeaders = new Headers();
const analyticsToken = process.env.SMOKE_AUTH_TOKEN;
if (analyticsToken) {
  analyticsHeaders.set('Authorization', `Bearer ${analyticsToken}`);
}

const checks = [
  { name: 'app route', url: new URL('/app', appUrl).toString(), expectStatus: 200 },
  { name: 'health route', url: new URL('/api/health', appUrl).toString(), expectStatus: 200 },
  {
    name: analyticsToken ? 'analytics route' : 'analytics route auth guard',
    url: new URL(`/api/workspaces/${mockWorkspaceId}/analytics?organization_id=${mockOrganizationId}`, appUrl).toString(),
    expectStatus: analyticsToken ? 200 : 401,
    headers: analyticsHeaders
  }
];

for (const check of checks) {
  const response = await fetch(check.url, { headers: check.headers });
  if (response.status !== check.expectStatus) {
    console.error(`${check.name} returned ${response.status}; expected ${check.expectStatus}.`);
    process.exit(1);
  }
  console.log(`${check.name}: ${response.status}`);
}
