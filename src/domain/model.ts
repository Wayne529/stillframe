import { z } from 'zod';
import { matchBrand } from './brands';
export const metadataKeys = ['focal', 'aperture', 'shutter', 'iso', 'lens', 'date'] as const;
export type MetadataKey = (typeof metadataKeys)[number];
export const defaultMetadataFields: MetadataKey[] = ['focal', 'aperture', 'shutter', 'iso'];
export const nodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['photo', 'text', 'image', 'rect']),
  name: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().finite(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  keepRatio: z.boolean(),
  fill: z.string(),
  text: z.string(),
  binding: z.string(),
  fontSize: z.number().positive(),
  fontFamily: z.string(),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  textBoxMode: z.enum(['auto', 'fixed']).default('auto'),
  align: z.enum(['left', 'center', 'right']),
  assetId: z.string(),
  radius: z.number().nonnegative(),
  anchor: z.enum(['photo', 'footer', 'canvas']),
});
export type SceneNode = z.infer<typeof nodeSchema>;
export const adjustmentSchema = z.object({
  exposure: z.number().min(-2).max(2),
  contrast: z.number().min(-100).max(100),
  highlights: z.number().min(-100).max(100),
  shadows: z.number().min(-100).max(100),
  temperature: z.number().min(-100).max(100),
  saturation: z.number().min(-100).max(100),
});
export type Adjustments = z.infer<typeof adjustmentSchema>;
export const documentSchema = z.object({
  version: z.literal(1),
  template: z.string(),
  width: z.number().positive().max(20000),
  height: z.number().positive().max(20000),
  photoHeight: z.number().positive(),
  nodes: z.array(nodeSchema).max(100),
  adjustments: adjustmentSchema,
  filter: z.string(),
  strength: z.number().min(0).max(100),
  metadataFields: z.array(z.enum(metadataKeys)).default([...defaultMetadataFields]),
});
export type SceneDocument = z.infer<typeof documentSchema>;
export type Metadata = {
  make: string;
  model: string;
  lens: string;
  focal: string;
  aperture: string;
  shutter: string;
  iso: string;
  date: string;
};
export type Photo = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  metadata: Metadata;
  originalMetadata: Metadata;
  document: SceneDocument;
  fingerprint: string;
};
export type ExportSettings = {
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number;
  longEdge: number;
  keepExif: boolean;
};
export const neutral: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  saturation: 0,
};
export const templates = [
  { id: 'classic', name: '经典 · 参数铭牌', description: '拍摄信息与个人落款，清晰有序' },
  { id: 'gallery', name: '留白 · 画廊装裱', description: '让影像拥有恰好的呼吸感' },
  { id: 'blur', name: '氛围 · 柔光悬浮', description: '从照片延伸的色彩与光' },
  { id: 'cinema', name: '电影 · 宽幅叙事', description: '把这一刻，留在电影里' },
  { id: 'polaroid', name: '相纸 · 拍立得手记', description: '给日常一点手写的温度' },
  { id: 'overlay', name: '轻量 · 透明内嵌', description: '轻轻落款，不打扰画面' },
];
export const filters = [
  { id: 'original', name: '原图', tone: neutral },
  {
    id: 'mist',
    name: '雾色',
    tone: {
      ...neutral,
      contrast: -14,
      highlights: -25,
      shadows: 16,
      temperature: -10,
      saturation: -18,
    },
  },
  {
    id: 'warm',
    name: '暖日',
    tone: { ...neutral, exposure: 0.12, temperature: 27, saturation: 8 },
  },
  {
    id: 'nostalgia',
    name: '旧时',
    tone: { ...neutral, contrast: -16, temperature: 20, saturation: -25, shadows: 12 },
  },
  { id: 'silver', name: '银盐', tone: { ...neutral, saturation: -100, contrast: 18 } },
  {
    id: 'forest',
    name: '山野',
    tone: { ...neutral, temperature: -18, saturation: -12, contrast: 12 },
  },
  {
    id: 'cinematic',
    name: '电影',
    tone: { ...neutral, contrast: 24, highlights: -20, shadows: -12, saturation: -15 },
  },
  {
    id: 'soft',
    name: '柔光',
    tone: { ...neutral, exposure: 0.18, contrast: -24, highlights: -30, shadows: 20 },
  },
];
export function tone(d: SceneDocument): Adjustments {
  const base = filters.find((f) => f.id === d.filter)?.tone ?? neutral;
  return Object.fromEntries(
    Object.keys(neutral).map((k) => [
      k,
      d.adjustments[k as keyof Adjustments] + (base[k as keyof Adjustments] * d.strength) / 100,
    ]),
  ) as Adjustments;
}
const base = (
  id: string,
  kind: SceneNode['kind'],
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): SceneNode => ({
  id,
  kind,
  name,
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  keepRatio: kind === 'photo' || kind === 'image',
  fill: '#252a2b',
  text: '',
  binding: '',
  fontSize: 16,
  fontFamily: 'Stillframe Sans',
  bold: false,
  italic: false,
  underline: false,
  textBoxMode: 'auto',
  align: 'left',
  assetId: '',
  radius: 0,
  anchor: 'canvas',
});
export const makeNode = base;
export function createDocument(w: number, h: number, template = 'classic'): SceneDocument {
  const gallery = template === 'gallery',
    polar = template === 'polaroid',
    overlay = template === 'overlay',
    cinema = template === 'cinema';
  const margin = overlay ? 0 : gallery ? 95 : polar ? 70 : 28;
  const pw = 1000 - margin * 2,
    ph = (pw * h) / w;
  const footer = overlay ? 0 : polar ? 180 : gallery ? 120 : 124;
  const top = cinema ? 90 : margin;
  const height = ph + top + footer + (cinema ? 60 : 0);
  const paper = {
    ...base('paper', 'rect', '相纸背景', 0, 0, 1000, height),
    fill: cinema ? '#161a1d' : '#f8f7f2',
    locked: true,
  };
  const photo = {
    ...base('photo', 'photo', '照片', margin, top, pw, ph),
    anchor: 'photo' as const,
    radius: template === 'blur' ? 6 : 0,
  };
  const color = overlay || cinema ? '#f8f7f2' : '#252a2b';
  const brand = {
    ...base('brand', 'text', '相机品牌', margin + 8, top + ph + (overlay ? -70 : 28), 270, 32),
    fill: color,
    fontSize: 24,
    binding: 'camera',
    anchor: 'footer' as const,
  };
  const params = {
    ...base(
      'parameters',
      'text',
      '拍摄参数',
      overlay ? 350 : 330,
      top + ph + (overlay ? -60 : 32),
      570,
      56,
    ),
    fill: color,
    fontSize: 16,
    binding: 'parameters',
    anchor: 'footer' as const,
  };
  const signature: SceneNode = {
    ...base('signature', 'text', '个人签名', 760, top + ph + (overlay ? -50 : 76), 190, 36),
    fill: color,
    text: '',
    fontFamily: 'Stillframe Serif',
    fontSize: 24,
    align: 'right' as const,
    anchor: 'footer' as const,
  };
  if (gallery) {
    brand.visible = false;
    params.x = margin;
    params.width = pw;
    params.align = 'center';
    params.fontSize = 13;
    signature.x = margin;
    signature.width = pw;
    signature.align = 'center';
  }
  if (polar) {
    brand.visible = false;
    params.x = margin;
    params.width = pw;
    params.align = 'center';
    params.fontSize = 13;
    signature.x = margin;
    signature.width = pw;
    signature.align = 'center';
    signature.y = top + ph + 95;
    signature.fontSize = 32;
  }
  return {
    version: 1,
    template,
    width: 1000,
    height,
    photoHeight: ph,
    nodes: [paper, photo, brand, params, signature],
    adjustments: { ...neutral },
    filter: 'original',
    strength: 100,
    metadataFields: [...defaultMetadataFields],
  };
}
export function reflow(d: SceneDocument, w: number, h: number): SceneDocument {
  const copy = structuredClone(d),
    p = copy.nodes.find((n) => n.kind === 'photo');
  if (!p) return copy;
  const newH = (p.width * h) / w,
    delta = newH - p.height;
  p.height = newH;
  copy.photoHeight = newH;
  copy.height += delta;
  copy.nodes.forEach((n) => {
    if (n.id === 'paper') n.height = copy.height;
    else if (n.anchor === 'footer') n.y += delta;
  });
  return copy;
}
export function textFor(
  n: Pick<SceneNode, 'binding' | 'text'>,
  m: Metadata,
  fields: readonly MetadataKey[] = defaultMetadataFields,
): string {
  if (n.binding === 'camera') {
    const make = matchBrand(m.make, m.model)?.make || m.make;
    return m.model && make && m.model.toLowerCase().startsWith(make.toLowerCase())
      ? m.model
      : [make, m.model].filter(Boolean).join(' ');
  }
  if (n.binding === 'parameters' || metadataKeys.includes(n.binding as MetadataKey)) {
    const values: Record<MetadataKey, string> = {
      focal: m.focal ? `${m.focal.replace(/\s*mm$/i, '')}mm` : '',
      aperture: m.aperture ? `ƒ/${m.aperture.replace(/^[fƒ]\s*\/?\s*/i, '')}` : '',
      shutter: m.shutter ? `${m.shutter.replace(/\s*s$/i, '')}s` : '',
      iso: m.iso ? `ISO ${m.iso.replace(/^ISO\s*/i, '')}` : '',
      lens: m.lens,
      date: m.date,
    };
    if (n.binding !== 'parameters') return values[n.binding as MetadataKey] || '';
    return fields
      .map((key) => values[key])
      .filter(Boolean)
      .join('    ');
  }
  if (n.binding === 'date') return m.date;
  return n.text;
}
export function fitImage(iw: number, ih: number, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / iw, h / ih);
  return { x: x + (w - iw * s) / 2, y: y + (h - ih * s) / 2, width: iw * s, height: ih * s };
}

// Change the frame without discarding the photographer's color work or personal assets.
export function switchTemplate(
  current: SceneDocument,
  w: number,
  h: number,
  id: string,
): SceneDocument {
  const next = createDocument(w, h, id);
  next.adjustments = { ...current.adjustments };
  next.filter = current.filter;
  next.strength = current.strength;
  next.metadataFields = [...current.metadataFields];
  const signature = current.nodes.find((n) => n.id === 'signature');
  const target = next.nodes.find((n) => n.id === 'signature');
  if (signature && target)
    Object.assign(target, {
      text: signature.text,
      fontFamily: signature.fontFamily,
      fontSize: signature.fontSize,
      bold: signature.bold,
      italic: signature.italic,
      underline: signature.underline,
      visible: signature.visible,
      opacity: signature.opacity,
    });
  const builtins = new Set(['paper', 'photo', 'brand', 'parameters', 'signature']);
  const extras = structuredClone(current.nodes.filter((n) => !builtins.has(n.id)));
  for (const n of extras) {
    if (n.anchor === 'footer') n.y += next.height - current.height;
    const scale = Math.min(1, next.width / n.width, next.height / n.height);
    n.width *= scale;
    n.height *= scale;
    n.x = Math.max(0, Math.min(n.x, next.width - n.width));
    n.y = Math.max(0, Math.min(n.y, next.height - n.height));
  }
  next.nodes.push(...extras);
  return next;
}
