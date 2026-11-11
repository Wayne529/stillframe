import { test, expect } from '@playwright/test';
import path from 'node:path';

test('PNG import works over a LAN HTTP address', async ({ page }) => {
  test.skip(!process.env.LAN_URL, 'Set LAN_URL to the running server LAN address');

  await page.goto(process.env.LAN_URL!);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('public/brands/canon.png'));

  await expect(page.getByRole('status')).toContainText('已导入 1 张照片');
  await expect(page.getByRole('heading', { name: '图层与元素' })).toBeVisible();

  await page.getByRole('button', { name: '另存预设', exact: true }).click();
  await page.getByLabel('预设名称').fill('局域网预设');
  await page.getByRole('button', { name: '保存个人预设', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存在');

  await page.getByTestId('logo-input').setInputFiles(path.resolve('public/brands/canon.png'));
  await expect(page.getByRole('status')).toContainText('标识已添加');
  await page.getByTestId('replace-photo-input').setInputFiles(path.resolve('public/demo/mist.jpg'));
  await expect(page.getByRole('status')).toContainText('已替换当前照片');

  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '生成并下载 1 张' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
});
