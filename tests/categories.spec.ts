import { test, expect } from '@playwright/test';

test('frame categories filter cards, reflect selection, and support navigation history', async ({
  page,
}) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  const cards = page.locator('button[id^="template-"]');
  await expect(cards).toHaveCount(6);
  await page.getByRole('button', { name: '电影', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('#template-cinema')).toBeVisible();
  await expect(page.getByRole('button', { name: '电影', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '留白', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('#template-gallery')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#template-cinema')).toBeVisible();
  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('#template-cinema')).toBeVisible();
  await page.getByRole('button', { name: /全部边框/ }).click();
  await expect(cards).toHaveCount(6);
  await expect(page.getByRole('button', { name: /全部边框/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
