import {
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  Download,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
} from 'lucide-react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { useStore } from '../../app/store';
import {
  neutral,
  templates,
  type SceneDocument,
  type Photo,
  type SceneNode,
  type ExportSettings,
} from '../../domain/model';
import type { Job } from '../export/export-service';
import { cameraBrands, matchBrand, cameraLogo } from '../../domain/brands';
import { defaultMetadataFields, metadataKeys } from '../../domain/model';
import { NumberField } from '../../components/ui/NumberField';
import styles from '../../styles/App.module.less';
type Props = {
  panel: string;
  p: Photo;
  settings: ExportSettings;
  setSettings: Dispatch<SetStateAction<ExportSettings>>;
  jobs: Job[];
  exporting: boolean;
  busy: boolean;
  startExport: (retry?: boolean) => Promise<void>;
  cancel: RefObject<AbortController | null>;
  patch: (patch: Partial<SceneNode>) => void;
  align: (type: string) => void;
  notify: (message: string) => void;
  beginSlider: () => void;
  finishSlider: () => void;
  adjust: (fn: (d: SceneDocument) => void) => void;
};
export function Inspector({
  panel,
  p,
  settings,
  setSettings,
  jobs,
  exporting,
  busy,
  startExport,
  cancel,
  patch,
  align,
  notify,
  beginSlider,
  finishSlider,
  adjust,
}: Props) {
  const s = useStore(),
    d = p.document,
    node = d.nodes.find((n) => n.id === s.selectedId);
  return (
    <aside className={styles.inspector}>
      <p className="eyebrow">
        {panel === 'export'
          ? 'EXPORT SETTINGS'
          : panel === 'metadata'
            ? 'PHOTO METADATA'
            : panel === 'filters'
              ? 'COLOR SETTINGS'
              : 'ELEMENT PROPERTIES'}
      </p>
      <h2>
        {panel === 'templates'
          ? '边框设置'
          : panel === 'export'
            ? '导出作品'
            : panel === 'metadata'
              ? '拍摄参数'
              : panel === 'filters'
                ? '光线与色彩'
                : '元素属性'}
      </h2>
      <p className="hint">
        {panel === 'export'
          ? '生成独立副本，原始照片始终保留。'
          : panel === 'metadata'
            ? '修改展示内容，不覆盖原始照片。'
            : '为每一刻，留下自己的印记。'}
      </p>
      <hr />
      {panel === 'templates' ? (
        <>
          <h3>{templates.find((t) => t.id === d.template)?.name}</h3>
          <p className="hint">
            从左侧选择边框，画布实时预览。换模板会保留滤镜、签名与个人素材，布局调整可撤销。
          </p>
          <label className="field">
            相纸底色
            <input
              type="color"
              aria-label="相纸底色"
              value={d.nodes.find((n) => n.id === 'paper')?.fill || '#f8f7f2'}
              onChange={(e) =>
                s.change((doc) => {
                  const paper = doc.nodes.find((n) => n.id === 'paper');
                  if (paper) paper.fill = e.target.value;
                })
              }
            />
          </label>
          <NumberField
            label="照片圆角"
            min={0}
            value={d.nodes.find((n) => n.id === 'photo')?.radius || 0}
            onChange={(radius) =>
              s.change((doc) => {
                const photo = doc.nodes.find((n) => n.id === 'photo');
                if (photo) photo.radius = Math.max(0, radius);
              })
            }
          />
          <p className="hint">选中画布元素可进一步拖动、缩放和旋转。</p>
        </>
      ) : panel === 'metadata' ? (
        <>
          <p className="hint">自动读取原图 EXIF；未读取到的字段留空，可手动补填。ISO 即感光度。</p>
          <label className="field">
            相机品牌
            <select
              aria-label="相机品牌"
              value={
                matchBrand(p.metadata.make, p.metadata.model)?.id ||
                (p.metadata.make ? 'custom' : '')
              }
              onChange={(e) => {
                const brand = cameraBrands.find((b) => b.id === e.target.value);
                s.metadata({ make: brand?.make || (e.target.value === 'custom' ? '其他' : '') });
              }}
            >
              <option value="">未读取，请选择品牌</option>
              {cameraBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.make}
                </option>
              ))}
              <option value="custom">其他 / 自定义品牌</option>
            </select>
          </label>
          {cameraLogo(p.metadata.make, p.metadata.model) ? (
            <div className={styles.brandPreview}>
              <img
                src={cameraLogo(p.metadata.make, p.metadata.model)}
                alt={`${matchBrand(p.metadata.make, p.metadata.model)?.name} Logo`}
              />
              <span>品牌 Logo · 随照片参数自动匹配</span>
            </div>
          ) : (
            <p className="hint">当前品牌未提供 Logo，画布将显示品牌文字。</p>
          )}
          <p className="hint">可手动切换品牌；恢复原始 EXIF 可重新使用照片中的品牌。</p>
          <div className={styles.metadataFields}>
            {(
              ['make', 'model', 'lens', 'focal', 'aperture', 'shutter', 'iso', 'date'] as const
            ).map((key, i) => (
              <label className="field" key={key}>
                {
                  [
                    '品牌名称',
                    '相机型号',
                    '镜头型号',
                    '焦距 mm',
                    '光圈 F',
                    '快门 s',
                    'ISO 感光度',
                    '拍摄日期',
                  ][i]
                }
                <span className="hint" aria-hidden="true">
                  {p.metadata[key] === p.originalMetadata[key]
                    ? p.originalMetadata[key]
                      ? 'EXIF 自动读取'
                      : '未读取'
                    : '手动填写'}
                </span>
                <input
                  aria-label={
                    [
                      '品牌名称',
                      '相机型号',
                      '镜头型号',
                      '焦距 mm',
                      '光圈 F',
                      '快门 s',
                      'ISO 感光度',
                      '拍摄日期',
                    ][i]
                  }
                  value={p.metadata[key]}
                  onChange={(e) => s.metadata({ [key]: e.target.value })}
                  placeholder="未读取，可手动补充"
                />
              </label>
            ))}
          </div>
          <hr />
          <h4>模板中显示的拍摄信息</h4>
          <div className={styles.grid2}>
            {metadataKeys.map((key, i) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  aria-label={
                    '显示' + ['焦距', '光圈', '快门', 'ISO 感光度', '镜头型号', '拍摄日期'][i]
                  }
                  checked={(d.metadataFields ?? defaultMetadataFields).includes(key)}
                  onChange={(e) =>
                    s.change((doc) => {
                      const fields = doc.metadataFields ?? [...defaultMetadataFields];
                      doc.metadataFields = e.target.checked
                        ? metadataKeys.filter((f) => fields.includes(f) || f === key)
                        : fields.filter((f) => f !== key);
                    })
                  }
                />
                {['焦距', '光圈', '快门', 'ISO 感光度', '镜头型号', '拍摄日期'][i]}
              </label>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={d.nodes.find((n) => n.id === 'brand')?.visible ?? false}
              onChange={(e) =>
                s.change((doc) => {
                  const n = doc.nodes.find((n) => n.id === 'brand');
                  if (n) n.visible = e.target.checked;
                })
              }
            />
            显示相机品牌与型号
          </label>
          <button className="wide" onClick={() => s.metadata(p.originalMetadata)}>
            恢复原始 EXIF 读取值
          </button>
          <p className="hint">照片没有 EXIF 时仍可编辑。地点与 GPS 默认不展示、不导出。</p>
        </>
      ) : panel === 'filters' ? (
        <>
          <label className="range-field">
            滤镜强度 <span>{d!.strength}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={d!.strength}
              onPointerDown={beginSlider}
              onPointerUp={finishSlider}
              onPointerCancel={finishSlider}
              onBlur={finishSlider}
              onChange={(e) =>
                adjust((doc) => {
                  doc.strength = +e.target.value;
                })
              }
            />
          </label>
          <hr />
          {(
            ['exposure', 'contrast', 'highlights', 'shadows', 'temperature', 'saturation'] as const
          ).map((key, i) => (
            <label className="range-field" key={key}>
              {['曝光 EV', '对比度', '高光', '阴影', '色温', '饱和度'][i]}
              <span>{d!.adjustments[key]}</span>
              <input
                aria-label={key}
                type="range"
                min={key === 'exposure' ? -2 : -100}
                max={key === 'exposure' ? 2 : 100}
                step={key === 'exposure' ? 0.05 : 1}
                value={d!.adjustments[key]}
                onPointerDown={beginSlider}
                onPointerUp={finishSlider}
                onPointerCancel={finishSlider}
                onBlur={finishSlider}
                onChange={(e) =>
                  adjust((doc) => {
                    doc.adjustments[key] = +e.target.value;
                  })
                }
              />
            </label>
          ))}
          <button
            className="wide"
            onClick={() =>
              s.change((doc) => {
                doc.adjustments = { ...neutral };
                doc.filter = 'original';
              })
            }
          >
            恢复原图色彩
          </button>
        </>
      ) : panel === 'export' ? (
        <>
          <label className="field">
            输出格式
            <select
              value={settings.format}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  format: e.target.value as ExportSettings['format'],
                  keepExif: false,
                })
              }
            >
              <option value="image/jpeg">JPG · 照片分享</option>
              <option value="image/png">PNG · 无损编码</option>
              <option value="image/webp">WebP</option>
            </select>
          </label>
          {settings.format !== 'image/png' && (
            <label className="range-field">
              编码质量<span>{Math.round(settings.quality * 100)}%</span>
              <input
                type="range"
                min=".5"
                max="1"
                step=".01"
                value={settings.quality}
                onChange={(e) => setSettings({ ...settings, quality: +e.target.value })}
              />
            </label>
          )}
          <label className="field">
            输出尺寸（包含边框）
            <select
              value={settings.longEdge}
              onChange={(e) => setSettings({ ...settings, longEdge: +e.target.value })}
            >
              <option value={3000}>长边 3000px</option>
              <option value={2000}>长边 2000px</option>
              <option value={1080}>长边 1080px</option>
              <option value={0}>原尺寸 · 不放大照片</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              disabled={settings.format !== 'image/jpeg'}
              checked={settings.keepExif}
              onChange={(e) => setSettings({ ...settings, keepExif: e.target.checked })}
            />
            保留拍摄参数（仅 JPG，不含 GPS）
          </label>
          <p className="hint">仅保存机型、镜头、曝光和日期字段，不复制位置、序列号和原缩略图。</p>
          <hr />
          <p className="hint">
            {s.photos.length} 张照片 · 串行处理 · 多张打包 ZIP，超过 100MiB 自动分包。
          </p>
          <button
            className="primary wide"
            disabled={exporting || busy}
            onClick={() => void startExport()}
          >
            {exporting ? <Loader2 className="spin" size={15} /> : <Download size={15} />}{' '}
            {exporting ? '正在生成作品…' : `生成并下载 ${s.photos.length} 张`}
          </button>
          {exporting && (
            <button className="wide" onClick={() => cancel.current?.abort()}>
              完成当前照片后取消
            </button>
          )}
          {jobs.length > 0 && (
            <div className={styles.jobs}>
              {jobs.map((j) => (
                <div key={j.id}>
                  <span>{j.name}</span>
                  <small className={j.status === 'failed' ? styles.error : ''}>
                    {j.status === 'success'
                      ? `${j.width}×${j.height} ✓`
                      : j.status === 'rendering'
                        ? '生成中…'
                        : j.status === 'failed'
                          ? j.error
                          : j.status === 'cancelled'
                            ? '已取消'
                            : '等待中'}
                  </small>
                </div>
              ))}
              {jobs.some((j) => j.status === 'failed') && !exporting && (
                <button onClick={() => void startExport(true)}>重试失败项</button>
              )}
            </div>
          )}
        </>
      ) : node ? (
        <>
          <div className={styles.elementHeading}>
            <h3>{node.name}</h3>
            <span>{node.locked ? '已锁定' : '可自由编辑'}</span>
          </div>
          <fieldset disabled={node.locked}>
            <div className={styles.grid2}>
              <NumberField label="X 位置" value={node.x} onChange={(x) => patch({ x })} />
              <NumberField label="Y 位置" value={node.y} onChange={(y) => patch({ y })} />
              <NumberField
                label="宽度"
                min={10}
                value={node.width}
                onChange={(width) =>
                  patch({
                    width: Math.max(10, width),
                    height: node.keepRatio
                      ? (node.height * Math.max(10, width)) / node.width
                      : node.height,
                  })
                }
              />
              <NumberField
                label="高度"
                min={10}
                value={node.height}
                onChange={(height) =>
                  patch({
                    height: Math.max(10, height),
                    width: node.keepRatio
                      ? (node.width * Math.max(10, height)) / node.height
                      : node.width,
                  })
                }
              />
              <NumberField
                label="旋转 °"
                value={node.rotation}
                onChange={(rotation) => patch({ rotation })}
              />
              <NumberField
                label="不透明度 %"
                min={0}
                max={100}
                value={node.opacity * 100}
                onChange={(v) => patch({ opacity: Math.max(0, Math.min(1, v / 100)) })}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={node.keepRatio}
                onChange={(e) => patch({ keepRatio: e.target.checked })}
              />
              缩放保持比例
            </label>
            {node.kind === 'text' && (
              <>
                <label className="field">
                  内容绑定
                  <select value={node.binding} onChange={(e) => patch({ binding: e.target.value })}>
                    <option value="">自定义文字</option>
                    <option value="camera">每张照片的机型</option>
                    <option value="parameters">每张照片的拍摄参数</option>
                    <option value="aperture">单项 · 光圈</option>
                    <option value="iso">单项 · ISO 感光度</option>
                    <option value="focal">单项 · 焦距</option>
                    <option value="shutter">单项 · 快门</option>
                    <option value="lens">单项 · 镜头型号</option>
                    <option value="date">拍摄日期</option>
                  </select>
                </label>
                {!node.binding && (
                  <label className="field">
                    文字内容
                    <textarea value={node.text} onChange={(e) => patch({ text: e.target.value })} />
                  </label>
                )}
                <div className={styles.grid2}>
                  <NumberField
                    label="字号"
                    min={6}
                    value={node.fontSize}
                    onChange={(fontSize) => patch({ fontSize: Math.max(6, fontSize) })}
                  />
                  <label className="field">
                    字体
                    <select
                      value={node.fontFamily}
                      onChange={(e) => patch({ fontFamily: e.target.value })}
                    >
                      <option>Stillframe Sans</option>
                      <option>Stillframe Serif</option>
                    </select>
                  </label>
                </div>
                <div className="field">
                  <span>文字对齐</span>
                  <div className={styles.textToolbar} role="group" aria-label="文字对齐">
                    {(
                      [
                        ['left', '左对齐', AlignLeft],
                        ['center', '居中', AlignCenter],
                        ['right', '右对齐', AlignRight],
                      ] as const
                    ).map(([align, label, Icon]) => (
                      <button
                        key={align}
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-pressed={node.align === align}
                        onClick={() => patch({ align })}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>文字样式</span>
                  <div className={styles.textToolbar} role="group" aria-label="文字样式">
                    {(
                      [
                        ['bold', '加粗', Bold],
                        ['italic', '斜体', Italic],
                        ['underline', '下划线', Underline],
                      ] as const
                    ).map(([key, label, Icon]) => (
                      <button
                        key={key}
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-pressed={node[key]}
                        onClick={() => patch({ [key]: !node[key] })}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>
                <p className="hint">拖动边框仅调整文字区域，字号保持不变；区域变窄时自动换行。</p>
                <button className="wide" onClick={() => patch({ textBoxMode: 'auto' })}>
                  边框贴合文字
                </button>
              </>
            )}
            {(node.kind === 'rect' || node.kind === 'text') && (
              <label className="field">
                颜色
                <input
                  type="color"
                  value={node.fill}
                  onChange={(e) => patch({ fill: e.target.value })}
                />
              </label>
            )}
            <hr />
            <h4>对齐到画布</h4>
            <div className={styles.alignGrid}>
              {[
                ['left', '左'],
                ['center', '水平居中'],
                ['right', '右'],
                ['top', '上'],
                ['middle', '垂直居中'],
                ['bottom', '下'],
              ].map(([key, label]) => (
                <button key={key} onClick={() => align(key)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <hr />
          <div className={styles.grid2}>
            <button onClick={() => patch({ locked: !node.locked })}>
              {node.locked ? <Unlock size={13} /> : <Lock size={13} />}{' '}
              {node.locked ? '解锁' : '锁定'}
            </button>
            <button onClick={() => patch({ visible: !node.visible })}>
              {node.visible ? <EyeOff size={13} /> : <Eye size={13} />}{' '}
              {node.visible ? '隐藏' : '显示'}
            </button>
            <button
              disabled={node.locked}
              onClick={() =>
                s.change((doc) => {
                  const i = doc.nodes.findIndex((n) => n.id === node.id);
                  if (i < doc.nodes.length - 1)
                    [doc.nodes[i], doc.nodes[i + 1]] = [doc.nodes[i + 1], doc.nodes[i]];
                })
              }
            >
              上移一层
            </button>
            <button
              disabled={node.locked}
              onClick={() =>
                s.change((doc) => {
                  const i = doc.nodes.findIndex((n) => n.id === node.id);
                  if (i > 0) [doc.nodes[i], doc.nodes[i - 1]] = [doc.nodes[i - 1], doc.nodes[i]];
                })
              }
            >
              下移一层
            </button>
          </div>
          <button
            className="wide danger"
            disabled={node.locked}
            onClick={() =>
              s.change((doc) => {
                doc.nodes = doc.nodes.filter((n) => n.id !== node.id);
              })
            }
          >
            <Trash2 size={13} />
            删除元素
          </button>
        </>
      ) : (
        <p className="hint">请从画布或图层列表选择元素。</p>
      )}
      {panel !== 'export' && (
        <div className={styles.inspectorFoot}>
          <button
            className="wide"
            disabled={exporting}
            onClick={() => {
              s.applyAll();
              notify('已同步布局与调色；每张照片保留自己的拍摄参数');
            }}
          >
            将样式应用到全部 {s.photos.length} 张照片
          </button>
        </div>
      )}
    </aside>
  );
}
