import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { ZipReader, BlobReader } from '@zip.js/zip.js';
test('20 x 24MP batch export', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  const source = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 6000;
    c.height = 4000;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 6000, 4000);
    g.addColorStop(0, '#e6d4b2');
    g.addColorStop(1, '#305963');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 6000, 4000);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  });
  const bytes = Buffer.from(source, 'base64');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(
      Array.from({ length: 20 }, (_, i) => ({
        name: `photo-${i + 1}.jpg`,
        mimeType: 'image/jpeg',
        buffer: Buffer.concat([bytes, Buffer.from(`image-${i}`)]),
      })),
    );
  await expect(page.getByRole('button', { name: '同步到全部 20 张照片' })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('link', { name: '导出作品' }).click();
  await page.getByLabel('输出尺寸（包含边框）').selectOption('0');
  const downloaded = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: '生成并下载 20 张' }).click();
  const download = await downloaded;
  await download.saveAs('tests/stress.zip');
  const data = await fs.readFile('tests/stress.zip');
  const reader = new ZipReader(new BlobReader(new Blob([data])));
  const entries = await reader.getEntries();
  expect(entries.length).toBe(20);
  await reader.close();
  await expect(page.getByRole('button', { name: '生成并下载 20 张' })).toBeEnabled();
  console.log('24MP batch: 20 successful files, ZIP bytes', data.length);
});
