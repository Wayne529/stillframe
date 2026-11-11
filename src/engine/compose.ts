import { paintText, textFont } from './text-layout';
import { cameraLogo, cameraModel, cameraLayout } from '../domain/brands';
import { fitImage, textFor, type SceneDocument, type Metadata } from '../domain/model';
export type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
export { wrapLines as lines } from './text-layout';
export function compose(
  ctx: Context,
  d: SceneDocument,
  photo: CanvasImageSource,
  metadata: Metadata,
  assets: Map<string, ImageBitmap>,
  scale: number,
) {
  ctx.save();
  ctx.scale(scale, scale);
  if (d.template === 'blur') {
    ctx.save();
    ctx.filter = 'blur(25px)';
    ctx.drawImage(photo, -40, -40, d.width + 80, d.height + 80);
    ctx.restore();
    ctx.fillStyle = '#18202466';
    ctx.fillRect(0, 0, d.width, d.height);
  }
  for (const n of d.nodes) {
    if (!n.visible) continue;
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate((n.rotation * Math.PI) / 180);
    ctx.globalAlpha = n.opacity;
    if (n.kind === 'rect') {
      ctx.fillStyle = d.template === 'blur' && n.id === 'paper' ? '#ffffff00' : n.fill;
      ctx.beginPath();
      ctx.roundRect(0, 0, n.width, n.height, n.radius);
      ctx.fill();
    } else if (n.kind === 'photo' || n.kind === 'image') {
      const image = n.kind === 'photo' ? photo : assets.get(n.assetId);
      if (image) {
        ctx.beginPath();
        ctx.roundRect(0, 0, n.width, n.height, n.radius);
        ctx.clip();
        const src = image as { width: number; height: number };
        const f = fitImage(src.width, src.height, 0, 0, n.width, n.height);
        ctx.drawImage(image, f.x, f.y, f.width, f.height);
      }
    } else if (n.binding === 'camera' && cameraLogo(metadata.make, metadata.model)) {
      const image = assets.get(cameraLogo(metadata.make, metadata.model)!);
      if (!image) throw new Error('相机 Logo 尚未加载，请重试');
      const model = cameraModel(metadata.make, metadata.model);
      const layout = cameraLayout(n.width, n.height, image.width, image.height, model);
      const f = layout.logo;
      ctx.drawImage(image, f.x, f.y, f.width, f.height);
      ctx.font = textFont(n);
      let label = model;
      while (label && ctx.measureText(label).width > layout.textWidth) label = label.slice(0, -1);
      if (label !== model) {
        while (label && ctx.measureText(label + '…').width > layout.textWidth)
          label = label.slice(0, -1);
        label = ctx.measureText('…').width <= layout.textWidth ? label + '…' : '';
      }
      ctx.translate(layout.textX, 0);
      paintText(ctx, { ...n, width: layout.textWidth }, label);
    } else {
      if (n.textBoxMode === 'fixed') {
        ctx.beginPath();
        ctx.rect(0, 0, n.width, n.height);
        ctx.clip();
      }
      paintText(ctx, n, textFor(n, metadata, d.metadataFields));
    }
    ctx.restore();
  }
  ctx.restore();
}
