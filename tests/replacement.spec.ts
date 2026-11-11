import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('add, replace and switch are separate; replacement resets EXIF and supports undo, redo and export', async ({
  page,
}) => {
  const piexif = (await import('piexifjs')).default;
  const source = await fs.readFile(path.resolve('public/demo/mist.jpg'));
  const makeFile = (name: string, make: string, model: string, iso: number, orientation = 1) => ({
    name,
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      piexif.insert(
        piexif.dump({
          '0th': { 271: make, 272: model, 274: orientation },
          Exif: { 34855: iso },
          GPS: {},
          '1st': {},
          thumbnail: null,
        }),
        source.toString('binary'),
      ),
      'binary',
    ),
  });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page
    .getByTestId('add-photos-input')
    .setInputFiles(makeFile('original.jpg', 'Nikon', 'Z8', 100));
  const summary = page.getByTestId('photo-summary');
  await expect(summary).toContainText('Nikon Z8');
  await page.getByLabel('文字内容').fill('留住光');
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  await page.getByLabel('ISO 感光度', { exact: true }).fill('999');
  const tools = page.getByRole('navigation', { name: '工作台工具' });
  await tools.getByRole('button', { name: '滤镜', exact: true }).click();
  await page.getByRole('button', { name: '暖日', exact: true }).click();
  const actions = page.getByRole('navigation', { name: '编辑操作' });
  const chooser = page.waitForEvent('filechooser');
  await actions.getByRole('button', { name: '替换照片', exact: true }).click();
  await (await chooser).setFiles(makeFile('replacement.jpg', 'Canon', 'EOS R5', 400, 6));
  await expect(summary).toContainText('Canon EOS R5');
  await expect(summary).toContainText('ISO 400');
  await expect(actions).toContainText('暖日');
  await expect(
    page.getByRole('button', { name: '切换照片：replacement.jpg', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '切换照片：original.jpg', exact: true }),
  ).toHaveCount(0);
  await page.getByTestId('add-photos-input').setInputFiles(path.resolve('public/demo/dusk.jpg'));
  await expect(
    page.getByRole('button', { name: '切换照片：dusk.jpg', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '切换照片：replacement.jpg', exact: true }).click();
  await expect(summary).toContainText('ISO 400');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(summary).toContainText('Nikon Z8');
  await expect(summary).toContainText('ISO 999');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(summary).toContainText('Canon EOS R5');
  await tools.getByRole('button', { name: '图层', exact: true }).click();
  await expect(page.getByLabel('文字内容')).toHaveValue('留住光');
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  await page.getByRole('button', { name: '恢复原始 EXIF 读取值', exact: true }).click();
  await expect(page.getByLabel('ISO 感光度', { exact: true })).toHaveValue('400');
  // Replacing with an image without EXIF clears all old camera parameters.
  await page
    .getByTestId('replace-photo-input')
    .setInputFiles(path.resolve('public/demo/coast.jpg'));
  await expect(summary).toContainText('未找到拍摄信息');
  await expect(page.getByLabel('品牌名称', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(summary).toContainText('Canon EOS R5');
  // An invalid replacement leaves the current source intact.
  await page
    .getByTestId('replace-photo-input')
    .setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('status')).toContainText('替换失败');
  await expect(summary).toContainText('Canon EOS R5');
  await page.getByRole('button', { name: '移除dusk.jpg', exact: true }).click();
  await page.getByRole('button', { name: '导出照片', exact: true }).click();
  await page.getByLabel('保留拍摄参数（仅 JPG，不含 GPS）').check();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '生成并下载 1 张' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain('replacement');
  const bytes = await fs.readFile((await download.path())!);
  const ExifReader = (await import('exifreader')).default;
  const tags = ExifReader.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  expect(tags.Make?.description).toBe('Canon');
  expect(tags.Model?.description).toBe('EOS R5');
  const size = await page.evaluate(async (base64) => {
    const blob = await (await fetch('data:image/jpeg;base64,' + base64)).blob();
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }, bytes.toString('base64'));
  expect(size.height).toBeGreaterThan(size.width);
});
