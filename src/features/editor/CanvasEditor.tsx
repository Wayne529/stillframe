import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Image as KImage, Text, Shape, Transformer, Group } from 'react-konva';
import type Konva from 'konva';
import { useStore, updateNode } from '../../app/store';
import { fitImage, textFor, type SceneNode, type Photo } from '../../domain/model';
import { imageWorker } from '../../workers/client';
import { db } from '../../storage/database';
import { cameraLogo, cameraModel, cameraLayout } from '../../domain/brands';
import { layoutText, paintText } from '../../engine/text-layout';
import { fontsReady } from '../../engine/fonts';
const textMeasure = document.createElement('canvas').getContext('2d')!;
export function useAsset(id: string) {
  const [image, set] = useState<HTMLImageElement>();
  useEffect(() => {
    let disposed = false,
      url = '';
    set(undefined);
    if (id.startsWith('/brands/')) {
      const im = new Image();
      im.onload = () => {
        if (!disposed) set(im);
      };
      im.src = id;
    } else if (id)
      db.assets.get(id).then((row) => {
        if (!row) return;
        url = URL.createObjectURL(row.blob);
        const im = new Image();
        im.onload = () => {
          if (!disposed) set(im);
        };
        im.src = url;
      });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return image;
}
function Element({
  node: n,
  photo,
  bitmap,
  onSelect,
}: {
  node: SceneNode;
  photo: Photo;
  bitmap?: ImageBitmap;
  onSelect: () => void;
}) {
  const logoUrl =
    n.kind === 'text' && n.binding === 'camera'
      ? cameraLogo(photo.metadata.make, photo.metadata.model)
      : undefined;
  const logo = useAsset(logoUrl ?? '');
  const model = cameraModel(photo.metadata.make, photo.metadata.model);
  const layout = logo ? cameraLayout(n.width, n.height, logo.width, logo.height, model) : undefined;
  const asset = useAsset(n.assetId),
    change = useStore((s) => s.change);
  const content = textFor(n, photo.metadata, photo.document.metadataFields);
  const textLayout =
    n.kind === 'text' && !logoUrl && content.trim()
      ? layoutText(textMeasure, n, content)
      : undefined;
  if (!n.visible) return null;
  const image = n.kind === 'photo' ? bitmap : asset;
  const f = image ? fitImage(image.width, image.height, 0, 0, n.width, n.height) : null;
  return (
    <Group
      id={n.id}
      x={n.x}
      y={n.y}
      width={n.width}
      height={n.height}
      rotation={n.rotation}
      opacity={n.opacity}
      draggable={!n.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => change((d) => updateNode(d, n.id, { x: e.target.x(), y: e.target.y() }))}
      onTransformEnd={(e) => {
        const g = e.target;
        const sx = g.scaleX(),
          sy = g.scaleY();
        g.scaleX(1);
        g.scaleY(1);
        const resizing = Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001;
        const bounds =
          n.kind === 'text' && resizing && n.textBoxMode !== 'fixed'
            ? textLayout?.bounds
            : undefined;
        const angle = (g.rotation() * Math.PI) / 180;
        const offsetX = (bounds?.x ?? 0) * sx,
          offsetY = (bounds?.y ?? 0) * sy;
        change((d) =>
          updateNode(d, n.id, {
            x: g.x() + Math.cos(angle) * offsetX - Math.sin(angle) * offsetY,
            y: g.y() + Math.sin(angle) * offsetX + Math.cos(angle) * offsetY,
            width: Math.max(10, (bounds?.width ?? n.width) * sx),
            height: Math.max(10, (bounds?.height ?? n.height) * sy),
            rotation: g.rotation(),
            ...(n.kind === 'text' && resizing ? { textBoxMode: 'fixed' as const } : {}),
          }),
        );
      }}
    >
      {n.kind !== 'rect' && (!textLayout || n.textBoxMode === 'fixed') && (
        <Rect width={n.width} height={n.height} fill="rgba(0,0,0,0)" />
      )}
      {n.kind === 'rect' ? (
        <Rect
          width={n.width}
          height={n.height}
          fill={photo.document.template === 'blur' && n.id === 'paper' ? 'transparent' : n.fill}
          cornerRadius={n.radius}
        />
      ) : logoUrl ? (
        <>
          {logo && layout && (
            <>
              <KImage image={logo} {...layout.logo} />
              <Text
                text={model}
                x={layout.textX}
                y={0}
                width={layout.textWidth}
                height={n.height}
                fontSize={n.fontSize}
                fontFamily={n.fontFamily}
                fontStyle={
                  [n.bold && 'bold', n.italic && 'italic'].filter(Boolean).join(' ') || 'normal'
                }
                textDecoration={n.underline ? 'underline' : undefined}
                fill={n.fill}
                align={n.align}
                verticalAlign="middle"
                wrap="none"
                ellipsis
              />
            </>
          )}
        </>
      ) : textLayout ? (
        <Shape
          x={n.textBoxMode === 'fixed' ? 0 : textLayout.bounds.x}
          y={n.textBoxMode === 'fixed' ? 0 : textLayout.bounds.y}
          width={n.textBoxMode === 'fixed' ? n.width : textLayout.bounds.width}
          height={n.textBoxMode === 'fixed' ? n.height : textLayout.bounds.height}
          fill={n.fill}
          sceneFunc={(ctx, shape) => {
            ctx.save();
            const parent = shape.getParent();
            const sx = parent?.scaleX() ?? 1,
              sy = parent?.scaleY() ?? 1;
            if (Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001) {
              ctx.scale(1 / sx, 1 / sy);
              const width = (n.textBoxMode === 'fixed' ? n.width : textLayout.bounds.width) * sx;
              const height = (n.textBoxMode === 'fixed' ? n.height : textLayout.bounds.height) * sy;
              ctx.beginPath();
              ctx.rect(0, 0, width, height);
              ctx.clip();
              paintText(ctx._context, { ...n, width, height }, content);
            } else {
              if (n.textBoxMode === 'fixed') {
                ctx.beginPath();
                ctx.rect(0, 0, n.width, n.height);
                ctx.clip();
              } else ctx.translate(-textLayout.bounds.x, -textLayout.bounds.y);
              paintText(ctx._context, n, content);
            }
            ctx.restore();
          }}
          hitFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.rect(
              0,
              0,
              n.textBoxMode === 'fixed' ? n.width : textLayout.bounds.width,
              n.textBoxMode === 'fixed' ? n.height : textLayout.bounds.height,
            );
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
        />
      ) : n.kind === 'text' ? null : f && image ? (
        <KImage image={image} {...f} />
      ) : (
        <Rect width={n.width} height={n.height} fill="#202a2d" />
      )}
    </Group>
  );
}
export function CanvasEditor({
  photo,
  theme,
  onStatus,
  onNodeSelect,
}: {
  photo: Photo;
  theme: string;
  onStatus: (s: string) => void;
  onNodeSelect?: () => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null),
    stage = useRef<Konva.Stage>(null),
    tr = useRef<Konva.Transformer>(null),
    [width, setWidth] = useState(800),
    [height, setHeight] = useState(650),
    [bitmap, setBitmap] = useState<ImageBitmap>(),
    [fontTick, fontUpdate] = useState(0),
    [backdrop, setBackdrop] = useState<HTMLCanvasElement>();
  const { selectedId, select } = useStore();
  const d = photo.document;
  useEffect(() => {
    const o = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
      setHeight(entries[0].contentRect.height);
    });
    if (wrapper.current) o.observe(wrapper.current);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    fontsReady
      .then(() => fontUpdate((t) => t + 1))
      .catch(() => onStatus('字体加载失败，请刷新后重试'));
  }, []);
  useEffect(() => {
    let alive = true;
    let current: ImageBitmap | undefined;
    const timer = setTimeout(() => {
      onStatus('正在生成预览…');
      imageWorker
        .preview(photo.file, d)
        .then((result) => {
          if (!alive) {
            result.image.close();
            return;
          }
          current = result.image;
          setBitmap((old) => {
            old?.close();
            return current;
          });
          onStatus(
            result.backend === 'CPU'
              ? 'CPU 调色模式'
              : result.backend === 'original'
                ? '原图预览'
                : 'GPU 调色模式',
          );
        })
        .catch((e) => onStatus(`预览失败：${e.message}`));
    }, 70);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [photo.id, photo.file, JSON.stringify(d.adjustments), d.filter, d.strength]);
  useEffect(
    () => () => {
      setBitmap((old) => {
        old?.close();
        return undefined;
      });
    },
    [],
  );
  useEffect(() => {
    if (!bitmap || d.template !== 'blur') {
      setBackdrop(undefined);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = d.width;
    canvas.height = d.height;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'blur(25px)';
    ctx.drawImage(bitmap, -40, -40, d.width + 80, d.height + 80);
    ctx.filter = 'none';
    ctx.fillStyle = '#18202466';
    ctx.fillRect(0, 0, d.width, d.height);
    setBackdrop(canvas);
  }, [bitmap, d.template, d.width, d.height]);
  const zoom = Math.min((width - 60) / d.width, Math.max(100, height - 54) / d.height, 1.2);
  const node = d.nodes.find((n) => n.id === selectedId);
  useEffect(() => {
    const target = stage.current?.findOne('#' + selectedId);
    tr.current?.nodes(target && node?.visible && !node.locked ? [target] : []);
  }, [selectedId, d.nodes, bitmap, zoom, fontTick]);
  return (
    <div ref={wrapper} className="canvas-viewport">
      <div className="paper-shadow" style={{ width: d.width * zoom, height: d.height * zoom }}>
        <Stage
          ref={stage}
          width={d.width * zoom}
          height={d.height * zoom}
          scaleX={zoom}
          scaleY={zoom}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) select('');
          }}
        >
          <Layer>
            {backdrop && (
              <KImage image={backdrop} width={d.width} height={d.height} listening={false} />
            )}
            {d.nodes.map((n) => (
              <Element
                key={n.id}
                node={n}
                photo={photo}
                bitmap={bitmap}
                onSelect={() => {
                  select(n.id);
                  onNodeSelect?.();
                }}
              />
            ))}
          </Layer>
          <Layer>
            <Transformer
              ref={tr}
              rotateEnabled
              keepRatio={node?.keepRatio ?? true}
              flipEnabled={false}
              borderStroke={theme === 'light' ? '#526da6' : '#c8ad82'}
              anchorStroke={theme === 'light' ? '#526da6' : '#c8ad82'}
              anchorFill={theme === 'light' ? '#fcfdfe' : '#17181b'}
              anchorSize={7}
              boundBoxFunc={(old, b) =>
                Math.abs(b.width) < 10 || Math.abs(b.height) < 10 ? old : b
              }
            />
          </Layer>
        </Stage>
      </div>
      <span className="canvas-dimensions">
        {Math.round(d.width)} × {Math.round(d.height)} 逻辑单位 · 选框不会进入成片
      </span>
    </div>
  );
}
