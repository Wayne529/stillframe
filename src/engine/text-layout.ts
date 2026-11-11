import type { SceneNode } from '../domain/model';
type MeasureContext = Pick<
  CanvasRenderingContext2D,
  'font' | 'textAlign' | 'textBaseline' | 'measureText'
>;
type TextStyle = Pick<
  SceneNode,
  'width' | 'height' | 'fontSize' | 'fontFamily' | 'align' | 'fill'
> &
  Partial<Pick<SceneNode, 'bold' | 'italic' | 'underline'>>;
export function textFont(n: Pick<TextStyle, 'fontSize' | 'fontFamily' | 'bold' | 'italic'>) {
  return `${n.italic ? 'italic ' : ''}${n.bold ? 'bold ' : ''}${n.fontSize}px "${n.fontFamily}"`;
}
export function wrapLines(ctx: Pick<MeasureContext, 'measureText'>, text: string, width: number) {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > width) {
        result.push(line);
        line = char;
      } else line += char;
    }
    result.push(line);
  }
  return result;
}
export function layoutText(ctx: MeasureContext, n: TextStyle, text: string) {
  ctx.font = textFont(n);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const metrics = wrapLines(ctx, text, n.width).map((text) => ({
    text,
    metric: ctx.measureText(text),
  }));
  const ascent = Math.max(0, ...metrics.map(({ metric }) => metric.actualBoundingBoxAscent));
  const descent = Math.max(
    n.underline ? n.fontSize * 0.12 : 0,
    ...metrics.map(({ metric }) => metric.actualBoundingBoxDescent),
  );
  const lineHeight = n.fontSize * 1.25;
  const inkHeight = ascent + descent + (metrics.length - 1) * lineHeight;
  const firstBaseline = (n.height - inkHeight) / 2 + ascent;
  const rows = metrics.map(({ text, metric }, i) => ({
    text,
    x:
      n.align === 'right'
        ? n.width - metric.width
        : n.align === 'center'
          ? (n.width - metric.width) / 2
          : 0,
    y: firstBaseline + i * lineHeight,
    metric,
  }));
  const left = Math.min(...rows.map((r) => r.x - r.metric.actualBoundingBoxLeft));
  const right = Math.max(...rows.map((r) => r.x + r.metric.actualBoundingBoxRight));
  return {
    rows,
    bounds: {
      x: left - 2,
      y: (n.height - inkHeight) / 2 - 2,
      width: Math.max(4, right - left + 4),
      height: Math.max(4, inkHeight + 4),
    },
  };
}
export function paintText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  n: TextStyle,
  text: string,
) {
  const layout = layoutText(ctx, n, text);
  ctx.fillStyle = n.fill;
  for (const row of layout.rows) {
    ctx.fillText(row.text, row.x, row.y);
    if (n.underline && row.text)
      ctx.fillRect(
        row.x,
        row.y + n.fontSize * 0.06,
        row.metric.width,
        Math.max(1, n.fontSize * 0.045),
      );
  }
}
