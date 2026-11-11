import { cameraLogo } from '../domain/brands';
import { expose, transfer } from 'comlink';
import ExifReader from 'exifreader';
import { tone, type SceneDocument, type Metadata, type ExportSettings } from '../domain/model';
import { filtered } from '../engine/gpu';
import { compose } from '../engine/compose';
let fontPromise: Promise<void> | undefined;
const bitmaps = new Map<string, ImageBitmap>();
async function fonts() {
  fontPromise ??= Promise.all(
    [
      ['Stillframe Sans', 'sans.woff2'],
      ['Stillframe Serif', 'serif.woff2'],
    ].map(async ([name, file]) => {
      const f = new FontFace(name, `url(${new URL(`${import.meta.env.BASE_URL}fonts/${file}`, self.location.origin)})`);
      await f.load();
      (self as any).fonts.add(f);
    }),
  ).then(() => {});
  return fontPromise;
}
async function bitmap(file: Blob, max?: number) {
  const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
  if (!max || Math.max(b.width, b.height) <= max) return b;
  const ratio = max / Math.max(b.width, b.height);
  const small = await createImageBitmap(b, {
    resizeWidth: Math.round(b.width * ratio),
    resizeHeight: Math.round(b.height * ratio),
    resizeQuality: 'high',
  });
  b.close();
  return small;
}
const api = {
  async inspect(file: File) {
    let tags: any = {};
    try {
      tags = await ExifReader.load(file);
    } catch {
      /* Missing or invalid metadata must not prevent pixel editing. */
    }
    const val = (k: string) => String(tags[k]?.description ?? '');
    const raw = (k: string) => {
      const v = tags[k]?.value;
      if (Array.isArray(v) && Array.isArray(v[0])) return v[0][1] ? v[0][0] / v[0][1] : undefined;
      if (
        Array.isArray(v) &&
        v.length === 2 &&
        typeof v[0] === 'number' &&
        typeof v[1] === 'number'
      )
        return v[1] ? v[0] / v[1] : undefined;
      return Array.isArray(v) ? v[0] : v;
    };
    const clean = (k: string) => {
      const n = Number(raw(k));
      return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : '';
    };
    const shutter = Number(raw('ExposureTime'));
    const headerW = Number(tags['Image Width']?.value),
      headerH = Number(tags['Image Height']?.value);
    if (headerW * headerH > 32e6) throw new Error('单张不能超过 3200 万像素');
    const b = await bitmap(file);
    const out = {
      width: b.width,
      height: b.height,
      metadata: {
        make: val('Make'),
        model: val('Model'),
        lens: val('LensModel'),
        focal: clean('FocalLength'),
        aperture: clean('FNumber'),
        shutter:
          shutter > 0 ? (shutter < 1 ? `1/${Math.round(1 / shutter)}` : String(shutter)) : '',
        iso: val('ISOSpeedRatings') || val('PhotographicSensitivity'),
        date: val('DateTimeOriginal'),
      } as Metadata,
    };
    b.close();
    return out;
  },
  async preview(file: File, d: SceneDocument) {
    const b = await bitmap(file, 1600);
    try {
      const { canvas, backend } = await filtered(b, tone(d));
      const image = canvas.transferToImageBitmap();
      return transfer({ image, backend }, [image]);
    } finally {
      b.close();
    }
  },
  async asset(id: string, blob: Blob) {
    bitmaps.get(id)?.close();
    bitmaps.set(id, await bitmap(blob));
  },
  async render(file: File, d: SceneDocument, m: Metadata, settings: ExportSettings) {
    await fonts();
    const logo = cameraLogo(m.make, m.model);
    if (
      logo &&
      d.nodes.some((n) => n.visible && n.kind === 'text' && n.binding === 'camera') &&
      !bitmaps.has(logo)
    ) {
      const response = await fetch(new URL(logo, self.location.origin));
      if (!response.ok) throw new Error('相机 Logo 加载失败，请重试');
      bitmaps.set(logo, await bitmap(await response.blob()));
    }
    for (const n of d.nodes)
      if (n.visible && n.kind === 'image' && !bitmaps.has(n.assetId))
        throw new Error('标识素材尚未加载或丢失，请重新上传后重试');
    const b = await bitmap(file);
    try {
      const photoNode = d.nodes.find((n) => n.kind === 'photo');
      const wanted = settings.longEdge ? settings.longEdge / Math.max(d.width, d.height) : Infinity;
      const native = photoNode
        ? Math.min(b.width / photoNode.width, b.height / photoNode.height)
        : 1;
      const scale = Math.min(wanted, native);
      const width = Math.round(d.width * scale),
        height = Math.round(d.height * scale);
      if (width * height > 48e6 || Math.max(width, height) > 16000)
        throw new Error('输出尺寸过大，请降低长边像素后重试');
      const { canvas, backend } = await filtered(b, tone(d));
      const out = new OffscreenCanvas(width, height),
        ctx = out.getContext('2d', { colorSpace: 'srgb' })!;
      if (settings.format === 'image/jpeg') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
      }
      compose(ctx, d, canvas, m, bitmaps, scale);
      let blob = await out.convertToBlob({ type: settings.format, quality: settings.quality });
      if (blob.type !== settings.format)
        throw new Error('当前浏览器不支持所选输出格式，请改用 PNG');
      if (settings.keepExif && settings.format === 'image/jpeg')
        blob = await writeExif(blob, m, width, height);
      return { blob, width, height, backend };
    } finally {
      b.close();
    }
  },
  dispose() {
    bitmaps.forEach((b) => b.close());
    bitmaps.clear();
  },
};
async function writeExif(blob: Blob, m: Metadata, width: number, height: number) {
  const { default: piexif } = await import('piexifjs');
  const zeroth: Record<number, any> = { 256: width, 257: height, 274: 1 };
  if (m.make) zeroth[271] = m.make;
  if (m.model) zeroth[272] = m.model;
  const exif: Record<number, any> = { 40962: width, 40963: height };
  const rational = (s: string) => {
    const v = s.includes('/')
      ? s
          .split('/')
          .map(Number)
          .reduce((a, b) => a / b)
      : Number(s);
    return Number.isFinite(v) && v > 0 ? [Math.round(v * 100000), 100000] : null;
  };
  for (const [key, value] of [
    [33434, m.shutter],
    [33437, m.aperture],
    [37386, m.focal],
  ] as const) {
    const r = rational(value);
    if (r) exif[key] = r;
  }
  if (m.iso && Number(m.iso) > 0) exif[34855] = Number(m.iso);
  if (m.lens) exif[42036] = m.lens;
  if (m.date) exif[36867] = m.date;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let str = '';
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = piexif.insert(
    piexif.dump({ '0th': zeroth, Exif: exif, GPS: {}, '1st': {}, thumbnail: null }),
    str,
  );
  return new Blob([Uint8Array.from(result, (c: string) => c.charCodeAt(0))], {
    type: 'image/jpeg',
  });
}
expose(api);
export type ImageWorker = typeof api;
