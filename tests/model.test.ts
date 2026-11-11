import { describe, it, expect } from 'vitest';
import {
  createDocument,
  reflow,
  textFor,
  documentSchema,
  templates,
  tone,
} from '../src/domain/model';
import { transformPixels } from '../src/engine/pixels';
describe('editable template contract', () => {
  it('every default node remains within the paper, landscape and portrait', () => {
    for (const t of templates)
      for (const [w, h] of [
        [6000, 4000],
        [4000, 6000],
      ]) {
        const d = createDocument(w, h, t.id);
        expect(documentSchema.safeParse(d).success).toBe(true);
        for (const n of d.nodes) {
          expect(n.x + n.width).toBeLessThanOrEqual(d.width + 1);
          expect(n.y + n.height).toBeLessThanOrEqual(d.height + 1);
        }
      }
  });
  it('reflows footer positions while retaining manual offsets and dynamic bindings', () => {
    const d = createDocument(6000, 4000);
    d.nodes.find((n) => n.id === 'signature')!.x = 643;
    const result = reflow(d, 4000, 6000);
    expect(result.nodes.find((n) => n.id === 'signature')!.x).toBe(643);
    expect(
      result.nodes.find((n) => n.id === 'signature')!.y -
        d.nodes.find((n) => n.id === 'signature')!.y,
    ).toBeCloseTo(result.height - d.height);
    const n = result.nodes.find((n) => n.id === 'parameters')!;
    expect(
      textFor(n, {
        make: '',
        model: '',
        lens: '',
        focal: '',
        aperture: '',
        shutter: '',
        iso: '200',
        date: '',
      }),
    ).toBe('ISO 200');
  });
  it('zero preset strength retains manual adjustments', () => {
    const d = createDocument(100, 100);
    d.filter = 'mist';
    d.strength = 0;
    d.adjustments.exposure = 0.7;
    expect(tone(d).exposure).toBe(0.7);
    expect(tone(d).contrast).toBe(0);
  });
  it('neutral pixel processing retains alpha and original color', () => {
    const pixels = new Uint8ClampedArray([20, 80, 140, 128]);
    const d = createDocument(10, 10);
    expect([...transformPixels(pixels, tone(d))]).toEqual([20, 80, 140, 128]);
  });
});

describe('photographic metadata display', () => {
  it('formats individual and combined bindings and hides absent or disabled fields', () => {
    const d = createDocument(6000, 4000);
    const node = d.nodes.find((n) => n.id === 'parameters')!;
    const metadata = {
      make: 'NIKON CORPORATION',
      model: 'D800',
      lens: '85mm f/1.8',
      focal: '85',
      aperture: '5.6',
      shutter: '1/320',
      iso: '100',
      date: '',
    };
    expect(textFor(node, metadata)).toBe('85mm    ƒ/5.6    1/320s    ISO 100');
    expect(textFor(node, metadata, ['aperture', 'iso'])).toBe('ƒ/5.6    ISO 100');
    expect(textFor({ ...node, binding: 'iso' }, metadata)).toBe('ISO 100');
    expect(textFor(node, { ...metadata, focal: '', aperture: '', iso: '', shutter: '' })).toBe('');
  });
});

describe('switching frames in one editing session', () => {
  it('preserves filters, display fields, signature and personal assets, keeping them on the new paper', async () => {
    const { switchTemplate, makeNode } = await import('../src/domain/model');
    const current = createDocument(6000, 4000, 'classic');
    current.filter = 'warm';
    current.strength = 65;
    current.adjustments.exposure = 0.5;
    current.metadataFields = ['iso'];
    current.nodes.find((n) => n.id === 'signature')!.text = '摄影师';
    const logo = makeNode('personal-logo', 'image', '签名图', 900, current.height - 80, 60, 60);
    logo.assetId = 'asset-1';
    logo.anchor = 'footer';
    current.nodes.push(logo);
    const next = switchTemplate(current, 6000, 4000, 'overlay');
    expect(next.template).toBe('overlay');
    expect(next.filter).toBe('warm');
    expect(next.strength).toBe(65);
    expect(next.adjustments.exposure).toBe(0.5);
    expect(next.metadataFields).toEqual(['iso']);
    expect(next.nodes.find((n) => n.id === 'signature')!.text).toBe('摄影师');
    const retained = next.nodes.find((n) => n.id === 'personal-logo')!;
    expect(retained.assetId).toBe('asset-1');
    expect(retained.y + retained.height).toBeLessThanOrEqual(next.height);
    expect(current.template).toBe('classic');
  });
});
