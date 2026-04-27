import { expect, test } from '@playwright/test';

test('public landing page loads', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/LeakProof AI/);
  await expect(page.getByRole('heading', { name: 'LeakProof AI' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Run an audit' })).toBeVisible();
});

test('login page loads', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Sign in to LeakProof AI' })).toBeVisible();
  await expect(page.getByPlaceholder('finance@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('/api/health returns the public health payload', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  await expect(response).toBeOK();
  await expect(response.json()).resolves.toMatchObject({
    status: 'ok',
    service: 'leakproof-ai'
  });
});

test('/app requires authentication when signed out', async ({ page }) => {
  await page.goto('/app');

  await expect(
    page.getByRole('heading', { name: /Sign in to open the audit workspace|Environment setup required/ })
  ).toBeVisible();
});
