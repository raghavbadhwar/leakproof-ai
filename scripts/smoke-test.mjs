const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

if (!appUrl) {
  console.error('Missing NEXT_PUBLIC_APP_URL or APP_URL.');
  process.exit(1);
}

const checks = [
  { name: 'app route', url: new URL('/app', appUrl).toString(), expectStatus: 200 },
  { name: 'health route', url: new URL('/api/health', appUrl).toString(), expectStatus: 200 }
];

for (const check of checks) {
  const response = await fetch(check.url);
  if (response.status !== check.expectStatus) {
    console.error(`${check.name} returned ${response.status}; expected ${check.expectStatus}.`);
    process.exit(1);
  }
  console.log(`${check.name}: ${response.status}`);
}
