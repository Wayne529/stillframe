import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import { templates, createDocument, tone, type Photo } from '../../domain/model';
import { cameraLogo } from '../../domain/brands';
import { imageWorker } from '../../workers/client';
import { compose } from '../../engine/compose';
import { fontsReady } from '../../engine/fonts';
import styles from '../../styles/App.module.less';

export function TemplatePicker({
  photo,
  onChoose,
}: {
  photo: Photo;
  onChoose: (id: string) => void;
}) {
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const [status, setStatus] = useState('正在生成布局预览…');
  const colorKey = JSON.stringify(tone(photo.document));
  const signature = photo.document.nodes.find((n) => n.id === 'signature')?.text || '';
  useEffect(() => {
    let disposed = false;
    setStatus('正在生成布局预览…');
    // One filtered proxy is shared by all six thumbnails. Never decode six full-size originals.
    void (async () => {
      let image: ImageBitmap | undefined;
      let logo: ImageBitmap | undefined;
      try {
        const preview = await imageWorker.preview(photo.file, photo.document);
        image = preview.image;
        if (disposed) return;
        await fontsReady;
        const url = cameraLogo(photo.metadata.make, photo.metadata.model);
        const assets = new Map<string, ImageBitmap>();
        if (url) {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Logo 加载失败');
          logo = await createImageBitmap(await response.blob());
          assets.set(url, logo);
        }
        if (disposed) return;
        for (const template of templates) {
          const canvas = canvases.current.get(template.id);
          const ctx = canvas?.getContext('2d');
          if (!canvas || !ctx) continue;
          const d = createDocument(photo.width, photo.height, template.id);
          d.nodes.find((n) => n.id === 'signature')!.text = signature;
          const scale = Math.min((canvas.width - 36) / d.width, (canvas.height - 28) / d.height);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.translate(
            (canvas.width - d.width * scale) / 2,
            (canvas.height - d.height * scale) / 2,
          );
          compose(ctx, d, image, photo.metadata, assets, scale);
          ctx.restore();
        }
        setStatus('使用当前照片预览边框布局');
      } catch {
        if (!disposed) setStatus('预览暂不可用，仍可选择模板');
      } finally {
        image?.close();
        logo?.close();
      }
    })();
    return () => {
      disposed = true;
    };
    // Layout changes do not require another proxy; color changes do.
  }, [photo.file, photo.width, photo.height, photo.metadata, colorKey, signature]);
  return (
    <div className={styles.workspaceTemplates}>
      <p className={styles.templatePreviewHint} aria-live="polite">
        {status}
      </p>
      {templates.map((t) => (
        <button
          key={t.id}
          aria-pressed={photo.document.template === t.id}
          onClick={() => onChoose(t.id)}
        >
          <div className={styles.templateThumbnail}>
            <canvas
              width={400}
              height={280}
              aria-hidden="true"
              ref={(el) => {
                if (el) canvases.current.set(t.id, el);
                else canvases.current.delete(t.id);
              }}
            />
            {photo.document.template === t.id && (
              <span className={styles.templateCheck} aria-hidden="true">
                <Check size={12} />
              </span>
            )}
          </div>
          <span className={styles.templateCardName}>{t.name}</span>
          <small>{t.description}</small>
        </button>
      ))}
      <Link to="/">
        浏览完整模板库 <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
