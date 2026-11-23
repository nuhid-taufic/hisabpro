const { test, expect } = require('@playwright/test');

test('Full User Journey: Login, Magic SMS, Store Loss Guard & Public Trust Link', async ({ page }) => {
  // 1. Login with seeded demo account
  await page.goto('/');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('Total Net Balance')).toBeVisible();

  // 2. Test Magic SMS Parser (Ctrl + K)
  await page.keyboard.press('Control+k');
  await page.getByText('Try: bKash Cash Out SMS').click();
  await expect(page.getByText('bKash SMS')).toBeVisible();
  await expect(page.locator('select').filter({ hasText: 'TRANSFER (Wallet to Wallet)' })).toHaveValue('TRANSFER');
  await page.locator('h2:has-text("Magic Command Bar")').locator('..').locator('..').locator('button').click();

  // 3. Test Store POS Loss Guard
  await page.getByRole('button', { name: 'Store POS' }).first().click();
  await page.getByText('Type-C 65W Fast Charger').click();
  const priceInput = page.locator('input[type="number"]').nth(1);
  await priceInput.fill('300');
  await expect(page.getByText('Selling at Loss')).toBeVisible();

  // 4. Test Public Zero-Dispute Trust Link (No Login)
  await page.goto('/?trust=rh-demo-9x4k2m');
  await expect(page.getByText('Verified Live Ledger by Nuhid Aslam')).toBeVisible();
  await expect(page.getByText('Rahim Uddin')).toBeVisible();
});
