import { test, expect } from '@playwright/test';
import path from 'node:path';

test('text selection hugs rendered glyphs and multiline text is vertically centered', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('stillframe-theme', 'dark'));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('public/demo/mist.jpg'));
  await page.getByLabel('文字内容', { exact: true }).fill('定格美好gy');
  await page.getByLabel('X 位置', { exact: true }).fill('100');
  await page.getByLabel('Y 位置', { exact: true }).fill('100');
  await page.getByLabel('宽度', { exact: true }).fill('500');
  await page.getByLabel('高度', { exact: true }).fill('100');
  await page.getByLabel('字号', { exact: true }).fill('40');
  await page
    .getByRole('group', { name: '文字对齐' })
    .getByRole('button', { name: '居中', exact: true })
    .click();
  await page.evaluate(async () => {
    await (
      await import('/src/engine/fonts.ts')
    ).fontsReady;
  });
  const measured = await page.evaluate(async () => {
    const { layoutText, paintText } = await import('/src/engine/text-layout.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 150;
    const ctx = canvas.getContext('2d')!;
    const n = {
      width: 500,
      height: 150,
      fontSize: 40,
      fontFamily: 'Stillframe Serif',
      align: 'center',
      fill: '#000',
    };
    const results = [];
    for (const text of ['定格美好gy', '定格瞬间\nCapture joy']) {
      ctx.clearRect(0, 0, 500, 150);
      const layout = layoutText(ctx, n, text);
      paintText(ctx, n, text);
      const pixels = ctx.getImageData(0, 0, 500, 150).data;
      let top = 150,
        bottom = 0,
        left = 500,
        right = 0;
      for (let y = 0; y < 150; y++)
        for (let x = 0; x < 500; x++)
          if (pixels[(y * 500 + x) * 4 + 3] > 32) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
      results.push({
        bounds: layout.bounds,
        centerY: (top + bottom) / 2,
        left,
        right,
        top,
        bottom,
      });
    }
    return results;
  });
  for (const r of measured) {
    expect(Math.abs(r.centerY - 75)).toBeLessThan(2);
    expect(r.left).toBeGreaterThanOrEqual(r.bounds.x - 1);
    expect(r.right).toBeLessThanOrEqual(r.bounds.x + r.bounds.width + 1);
    expect(r.top).toBeGreaterThanOrEqual(r.bounds.y - 1);
    expect(r.bottom).toBeLessThanOrEqual(r.bounds.y + r.bounds.height + 1);
  }
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const canvas = document.querySelectorAll<HTMLCanvasElement>('.canvas-viewport canvas')[1];
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let min = canvas.width,
          max = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (
              data[i + 3] > 100 &&
              Math.abs(data[i] - 200) < 5 &&
              Math.abs(data[i + 1] - 173) < 5
            ) {
              min = Math.min(min, x);
              max = Math.max(max, x);
            }
          }
        // Normalize the backing-store pixel count back into the 1000px document.
        return max >= min ? ((max - min) * 1000) / canvas.width : Infinity;
      }),
    )
    .toBeLessThan(300);
  const anchor = await page
    .locator('.canvas-viewport canvas')
    .nth(1)
    .evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let right = 0,
        bottom = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 128) {
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      return {
        x: rect.left + ((right - 3) * rect.width) / canvas.width,
        y: rect.top + ((bottom - 3) * rect.height) / canvas.height,
      };
    });
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(anchor.x + 45, anchor.y + 24, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel('字号', { exact: true })).toHaveValue('40');
  await expect
    .poll(async () => Number(await page.getByLabel('宽度', { exact: true }).inputValue()))
    .toBeLessThan(400);
  for (const label of ['加粗', '斜体', '下划线']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await page.screenshot({ path: 'tests/text-tight-bounds.png', fullPage: true });
});
