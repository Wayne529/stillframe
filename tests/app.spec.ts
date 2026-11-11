import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
const photo = path.resolve('public/demo/mist.jpg');
test('real photo editing, history, preset, theme and JPEG download', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await expect(page.getByRole('heading', { name: '影像，值得被珍藏。' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByRole('heading', { name: '图层与元素' })).toBeVisible();
  await expect(page.locator('.canvas-viewport canvas').first()).toBeVisible();
  await page.waitForTimeout(1200);
  const x = page.getByLabel('X 位置', { exact: true });
  await expect(x).toBeVisible();
  const old = await x.inputValue();
  await x.fill('650');
  await expect(x).toHaveValue('650');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(x).toHaveValue(old);
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '另存预设', exact: true }).click();
  await page.getByLabel('预设名称').fill('测试布局');
  await page.getByRole('button', { name: '保存个人预设', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存在');
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  await page.getByLabel('品牌名称', { exact: true }).fill('Nikon');
  await page.getByLabel('相机型号', { exact: true }).fill('D800');
  await page.getByLabel('ISO 感光度', { exact: true }).fill('100');
  await page
    .getByRole('navigation', { name: '工作台工具' })
    .getByRole('button', { name: '滤镜', exact: true })
    .click();
  await page.getByRole('button', { name: '雾色', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  await page.getByLabel('保留拍摄参数（仅 JPG，不含 GPS）').check();
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: '生成并下载 1 张' }).click();
  const file = await download;
  await file.saveAs('tests/result.jpg');
  const bytes = await fs.readFile('tests/result.jpg');
  expect(bytes[0]).toBe(255);
  expect(bytes[1]).toBe(216);
  expect(bytes.length).toBeGreaterThan(5000);
  await expect(page.locator('body')).toContainText('×');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'tests/editor-export.png', fullPage: true });
});
test('batch ZIP, removal, local draft restoration', async ({ page }) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([photo, path.resolve('public/demo/dusk.jpg')]);
  await expect(page.getByRole('button', { name: '移除mist.jpg' })).toBeVisible();
  await page.getByLabel('X 位置', { exact: true }).fill('610');
  await page.waitForTimeout(800);
  await page.reload();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByLabel('X 位置', { exact: true })).toHaveValue('610');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('public/demo/dusk.jpg'));
  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: '生成并下载 2 张' }).click();
  const file = await download;
  await file.saveAs('tests/result.zip');
  const bytes = await fs.readFile('tests/result.zip');
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
});

test('pointer dragging, logo upload, PNG and WebP output', async ({ page }) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByLabel('X 位置', { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  const x = page.getByLabel('X 位置', { exact: true }),
    old = Number(await x.inputValue());
  const bounds = await page.locator('.canvas-viewport canvas').first().boundingBox();
  expect(bounds).not.toBeNull();
  const scale = bounds!.width / 1000;
  const y = Number(await page.getByLabel('Y 位置', { exact: true }).inputValue());
  await page.mouse.move(bounds!.x + (old + 90) * scale, bounds!.y + (y + 12) * scale);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + (old + 40) * scale, bounds!.y + (y - 20) * scale, { steps: 6 });
  await page.mouse.up();
  expect(Number(await x.inputValue())).toBeLessThan(old - 20);
  const currentX = Number(await x.inputValue()),
    currentY = Number(await page.getByLabel('Y 位置', { exact: true }).inputValue());
  const widthInput = page.getByLabel('宽度', { exact: true }),
    startWidth = Number(await widthInput.inputValue()),
    startHeight = Number(await page.getByLabel('高度', { exact: true }).inputValue());
  await page.mouse.move(
    bounds!.x + (currentX + startWidth) * scale,
    bounds!.y + (currentY + startHeight) * scale,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + (currentX + startWidth + 35) * scale,
    bounds!.y + (currentY + startHeight + 10) * scale,
    { steps: 5 },
  );
  await page.mouse.up();
  expect(Number(await widthInput.inputValue())).toBeGreaterThan(startWidth + 10);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 100;
    c.height = 50;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ef5533';
    ctx.fillRect(20, 10, 60, 30);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('logo-input').setInputFiles({
    name: 'signature.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByRole('heading', { name: 'signature', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  for (const [format, ext] of [
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ]) {
    await page.getByLabel('输出格式').selectOption(format);
    const event = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: '生成并下载 1 张' }).click();
    const download = await event;
    expect(download.suggestedFilename()).toContain('.' + ext);
    await download.saveAs(`tests/result.${ext}`);
    await expect(page.getByRole('button', { name: '生成并下载 1 张' })).toBeEnabled();
  }
});

test('24 megapixel original-size export', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 6000;
    c.height = 4000;
    const ctx = c.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 6000, 4000);
    gradient.addColorStop(0, '#cbe1e5');
    gradient.addColorStop(1, '#28576a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 6000, 4000);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: '24mp.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(image, 'base64'),
    });
  await expect(page.getByLabel('X 位置', { exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: '工作台工具' })
    .getByRole('button', { name: '滤镜', exact: true })
    .click();
  await page.getByRole('button', { name: '雾色', exact: true }).click();
  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  await page.getByLabel('输出尺寸（包含边框）').selectOption('0');
  const event = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: '生成并下载 1 张' }).click();
  const download = await event;
  await download.saveAs('tests/result-24mp.jpg');
  const bytes = await fs.readFile('tests/result-24mp.jpg');
  expect(bytes.length).toBeGreaterThan(50000);
  await expect(page.getByRole('button', { name: '生成并下载 1 张' })).toBeEnabled();
});

test('EXIF orientation is applied once and GPS is removed by default', async ({ page }) => {
  const piexif = (await import('piexifjs')).default;
  const ExifReader = (await import('exifreader')).default;
  const source = await fs.readFile(photo);
  const exif = piexif.dump({
    '0th': { 274: 6, 271: 'Nikon', 272: 'D800' },
    Exif: { 34855: 320, 33437: [56, 10], 33434: [1, 320], 37386: [85, 1] },
    GPS: {
      1: 'N',
      2: [
        [31, 1],
        [12, 1],
        [0, 1],
      ],
      3: 'E',
      4: [
        [121, 1],
        [30, 1],
        [0, 1],
      ],
    },
    '1st': {},
    thumbnail: null,
  });
  const bytes = Buffer.from(piexif.insert(exif, source.toString('binary')), 'binary');
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'portrait-gps.jpg', mimeType: 'image/jpeg', buffer: bytes });
  await expect(page.getByRole('heading', { name: '图层与元素', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  await expect(page.getByLabel('ISO 感光度', { exact: true })).toHaveValue('320');
  await expect(page.getByLabel('光圈 F', { exact: true })).toHaveValue('5.6');
  await expect(page.getByLabel('快门 s', { exact: true })).toHaveValue('1/320');
  await expect(page.getByLabel('焦距 mm', { exact: true })).toHaveValue('85');
  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  const event = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: '生成并下载 1 张' }).click();
  const download = await event;
  await download.saveAs('tests/result-orientation.jpg');
  const tags = ExifReader.load(await fs.readFile('tests/result-orientation.jpg'));
  expect(tags.GPSLatitude).toBeUndefined();
  expect(Number(tags['Image Height'].value)).toBeGreaterThan(Number(tags['Image Width'].value));
});
