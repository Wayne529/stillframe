import { test, expect } from '@playwright/test';
import path from 'node:path';
test('main camera brands, editable metadata, display switches and soft blue theme', async ({
  page,
}) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('public/demo/mist.jpg'));
  await expect(page.getByRole('heading', { name: '图层与元素', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  const brand = page.getByLabel('相机品牌', { exact: true });
  for (const [id, name] of [
    ['nikon', 'Nikon'],
    ['fujifilm', 'FUJIFILM'],
    ['canon', 'Canon'],
    ['leica', 'Leica'],
    ['hasselblad', 'Hasselblad'],
  ]) {
    await brand.selectOption(id);
    await expect(page.getByLabel('品牌名称', { exact: true })).toHaveValue(name);
  }
  await page.getByLabel('相机型号', { exact: true }).fill('X2D 100C');
  await page.getByLabel('光圈 F', { exact: true }).fill('2.8');
  await page.getByLabel('ISO 感光度', { exact: true }).fill('200');
  await page.getByLabel('焦距 mm', { exact: true }).fill('50');
  await page.getByRole('checkbox', { name: '显示快门', exact: true }).uncheck();
  await page.getByRole('button', { name: '切换主题' }).click();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    ),
  ).toBe('#526da6');
  await expect(page.getByLabel('ISO 感光度', { exact: true })).toHaveValue('200');
  await expect(page.locator('body')).toContainText('手动填写');
  await page.screenshot({ path: 'tests/metadata-panel.png', fullPage: true });
});

test('supplied brand logos switch manually and render into the exported image', async ({
  page,
}) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('public/demo/mist.jpg'));
  await expect(page.getByRole('heading', { name: '图层与元素', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  for (const id of [
    'nikon',
    'fujifilm',
    'canon',
    'leica',
    'hasselblad',
    'sony',
    'apple',
    'huawei',
    'xiaomi',
  ]) {
    await page.getByLabel('相机品牌', { exact: true }).selectOption(id);
    const logo = page.locator(
      `aside img[src="/brands/${id === 'nikon' ? 'nikon-yellow' : id}.png"]`,
    );
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0))
      .toBe(true);
  }
  const result = await page.evaluate(async () => {
    // The same production worker used by the export UI must embed real artwork.
    const { imageWorker } = await import('/src/workers/client.ts');
    const { createDocument } = await import('/src/domain/model.ts');
    const { cameraLogo } = await import('/src/domain/brands.ts');
    const file = new File([await (await fetch('/demo/mist.jpg')).blob()], 'test.jpg');
    const d = createDocument(1200, 800);
    const n = d.nodes.find((n: { id: string }) => n.id === 'brand')!;
    const settings = { format: 'image/png', quality: 1, longEdge: 1000, keepExif: false };
    const pixels: number[][] = [];
    for (const make of ['NIKON CORPORATION', 'Leica Camera AG']) {
      const m = {
        make,
        model: '',
        lens: '',
        focal: '',
        aperture: '',
        shutter: '',
        iso: '',
        date: '',
      };
      const { blob, width } = await imageWorker.render(file, d, m, settings);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const scale = width / d.width;
      pixels.push(
        Array.from(
          ctx.getImageData(
            Math.round(n.x * scale),
            Math.round(n.y * scale),
            Math.round(n.width * scale),
            Math.round(n.height * scale),
          ).data,
        ),
      );
      bitmap.close();
    }
    return {
      different: pixels[0].filter((v, i) => v !== pixels[1][i]).length,
      auto: cameraLogo('NIKON CORPORATION'),
    };
  });
  expect(result.auto).toBe('/brands/nikon-yellow.png');
  expect(result.different).toBeGreaterThan(100);
  await page.getByLabel('相机品牌', { exact: true }).selectOption('leica');
  await page.screenshot({ path: 'tests/brand-logos.png', fullPage: true });
});
