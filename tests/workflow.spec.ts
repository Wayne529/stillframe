import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const url = process.env.BASE_URL || 'http://127.0.0.1:5173';
const photo = path.resolve('public/demo/mist.jpg');

test('template first flows through photo, filter and export without leaving the workspace', async ({
  page,
}) => {
  await page.goto(url);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#template-cinema').click();
  await (await chooser).setFiles(photo);
  await expect(page.getByRole('heading', { name: '图层与元素', exact: true })).toBeVisible();
  const flow = page.getByRole('navigation', { name: '编辑操作' });
  await expect(flow).toContainText('电影');
  await expect(page.getByTestId('photo-summary')).toContainText('已自动检查 EXIF');
  await flow.getByRole('button', { name: /滤镜/ }).click();
  await page.getByRole('button', { name: '雾色', exact: true }).click();
  await expect(flow).toContainText('雾色');
  await flow.getByRole('button', { name: /模板/ }).click();
  await page.getByRole('button', { name: /经典 · 参数铭牌.*拍摄信息/ }).click();
  await expect(flow).toContainText('经典');
  await expect(flow).toContainText('雾色');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(flow).toContainText('电影');
  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '生成并下载 1 张' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
});

test('photo first reads EXIF automatically and preserves it through template and filter changes', async ({
  page,
}) => {
  const piexif = (await import('piexifjs')).default;
  const source = await fs.readFile(photo);
  const bytes = Buffer.from(
    piexif.insert(
      piexif.dump({
        '0th': { 271: 'NIKON CORPORATION', 272: 'Z8' },
        Exif: { 34855: 200, 33437: [28, 10], 33434: [1, 250], 37386: [85, 1] },
        GPS: {},
        '1st': {},
        thumbnail: null,
      }),
      source.toString('binary'),
    ),
    'binary',
  );
  await page.goto(url);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'nikon.jpg', mimeType: 'image/jpeg', buffer: bytes });
  const summary = page.getByTestId('photo-summary');
  await expect(summary).toContainText('Nikon Z8');
  await expect(summary).toContainText('85mm');
  await expect(summary).toContainText('ISO 200');
  await expect(page).toHaveURL(/panel=layout/);
  await page
    .getByRole('navigation', { name: '工作台工具' })
    .getByRole('button', { name: '模板', exact: true })
    .click();
  await page.getByRole('button', { name: /轻量 · 透明内嵌.*轻轻落款/ }).click();
  await expect(summary).toContainText('ISO 200');
  await page
    .getByRole('navigation', { name: '工作台工具' })
    .getByRole('button', { name: '滤镜', exact: true })
    .click();
  await page.getByRole('button', { name: '暖日', exact: true }).click();
  await expect(summary).toContainText('Nikon Z8');
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  await expect(page.getByLabel('ISO 感光度', { exact: true })).toHaveValue('200');
  await page.screenshot({ path: 'tests/continuous-workflow.png', fullPage: true });
  // New photos inherit the current style but never inherit another photo's EXIF.
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('public/demo/dusk.jpg'));
  await expect(summary).toContainText('未找到拍摄信息');
  await expect(page.getByRole('navigation', { name: '编辑操作' })).toContainText('暖日');
  await page.getByRole('button', { name: /将样式应用到全部 2 张照片/ }).click();
  await page
    .locator('button')
    .filter({ has: page.locator('img[alt="nikon.jpg"]') })
    .click();
  await expect(summary).toContainText('Nikon Z8');
  await expect(summary).toContainText('ISO 200');
});
