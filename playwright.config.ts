import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3120);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const supabaseUrl = 'https://abcdefghijklmnopqrst.supabase.co';
const supabaseAnonKey = 'e2e-local-anon-key';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  workers: 1,
  use: {
    baseURL,
    trace: 'retain-on-failure'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: [
          `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
          `NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey}`,
          `NEXT_PUBLIC_APP_URL=${baseURL}`,
          `pnpm exec next start -H 127.0.0.1 -p ${port}`
        ].join(' '),
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe'
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
