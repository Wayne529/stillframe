import { useEffect, useRef, useState, lazy, Suspense, type ChangeEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Sun,
  Moon,
  Upload,
  ArrowUpRight,
  Undo2,
  Redo2,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Image as ImageIcon,
  Type,
  Plus,
  Trash2,
  Loader2,
  Bookmark,
  ChevronRight,
  RotateCcw,
  Info,
  Download,
  Replace,
} from 'lucide-react';
import { useStore, updateNode } from './app/store';
import {
  createDocument,
  switchTemplate,
  textFor,
  makeNode,
  reflow,
  templates,
  filters,
  documentSchema,
  type Photo,
  type SceneDocument,
  type SceneNode,
  type ExportSettings,
  type Metadata,
} from './domain/model';
import { cameraLogo, matchBrand } from './domain/brands';
import { newId } from './domain/id';
import { validatePhoto } from './features/photos/validate-photo';
import { imageWorker } from './workers/client';
const CanvasEditor = lazy(() =>
  import('./features/editor/CanvasEditor').then((m) => ({ default: m.CanvasEditor })),
);
import { Modal } from './components/ui/Modal';
import { db, savePreset, type Preset } from './storage/database';
import type { Job } from './features/export/export-service';
import styles from './styles/App.module.less';
import { Inspector } from './features/editor/Inspector';
import { TemplatePicker } from './features/editor/TemplatePicker';
export default function App() {
  const s = useStore(),
    p = s.photos.find((p) => p.id === s.activeId),
    d = p?.document,
    node = d?.nodes.find((n) => n.id === s.selectedId);
  const location = useLocation(),
    navigate = useNavigate();
  const gallery = location.pathname === '/',
    panel = new URLSearchParams(location.search).get('panel') || 'layout';
  const category = templates.find(
    (t) => t.id === new URLSearchParams(location.search).get('category'),
  );
  const collectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    collectionRef.current?.scrollTo({ top: 0 });
  }, [category?.id]);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'dark'),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [previewStatus, setPreviewStatus] = useState('本地处理'),
    [saveState, setSaveState] = useState(''),
    [presetOpen, setPresetOpen] = useState(false),
    [presetName, setPresetName] = useState(''),
    [presets, setPresets] = useState<Preset[]>([]),
    [libraryOpen, setLibraryOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [jobs, setJobs] = useState<Job[]>([]),
    [exporting, setExporting] = useState(false),
    [settings, setSettings] = useState<ExportSettings>({
      format: 'image/jpeg',
      quality: 0.92,
      longEdge: 3000,
      keepExif: false,
    });
  const input = useRef<HTMLInputElement>(null),
    logoInput = useRef<HTMLInputElement>(null),
    replacementInput = useRef<HTMLInputElement>(null),
    cancel = useRef<AbortController>(null),
    timer = useRef<ReturnType<typeof setTimeout>>(null);
  const sliderBefore = useRef<SceneDocument | null>(null);
  function beginSlider() {
    if (d) sliderBefore.current = structuredClone(d);
  }
  function finishSlider() {
    if (sliderBefore.current) {
      s.change(() => {}, sliderBefore.current);
      sliderBefore.current = null;
    }
  }
  function adjust(fn: (doc: SceneDocument) => void) {
    s.change(fn, undefined, !sliderBefore.current);
  }
  const [pendingTemplate, setPendingTemplate] = useState('classic');
  const templateIntent = useRef<string | null>(null);
  function notify(t: string) {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 5000);
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('stillframe-theme', theme);
    } catch {
      /* The theme still works when browser storage is unavailable. */
    }
  }, [theme]);
  useEffect(() => {
    db.assets
      .toArray()
      .then((rows) => Promise.all(rows.map((r) => imageWorker.asset(r.id, r.blob))))
      .catch(() => notify('无法读取本地素材存储'));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!s.photos.length) return;
    setSaveState('保存中…');
    const t = setTimeout(() => {
      db.drafts
        .bulkPut(
          s.photos.map((p) => ({
            id: p.id,
            fingerprint: p.fingerprint,
            document: p.document,
            metadata: p.metadata,
          })),
        )
        .then(() => setSaveState('已保存本地草稿'))
        .catch(() => setSaveState('本地保存失败，可继续导出'));
    }, 500);
    return () => clearTimeout(t);
  }, [s.photos]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[role=dialog]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (
        node &&
        !node.locked &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        s.change((doc) =>
          updateNode(doc, node.id, {
            x: node.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
            y: node.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
          }),
        );
      } else if (node && !node.locked && (e.key === 'Delete' || e.key === 'Backspace'))
        s.change((doc) => {
          doc.nodes = doc.nodes.filter((n) => n.id !== node.id);
        });
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [node, s]);
  async function importFiles(files: File[], template = pendingTemplate) {
    if (busy || exporting) return;
    const remaining = 50 - s.photos.length;
    if (remaining < 1) {
      notify('每批最多 50 张照片');
      return;
    }
    setBusy(true);
    const selectedTemplate = templateIntent.current;
    const style = d;
    const added: Photo[] = [];
    const errors: string[] = [];
    for (const file of files.slice(0, remaining)) {
      try {
        const fingerprint = await validatePhoto(file);
        if (
          s.photos.some((p) => p.fingerprint === fingerprint) ||
          added.some((p) => p.fingerprint === fingerprint)
        )
          continue;
        const result = await imageWorker.inspect(file);
        if (result.width * result.height > 32e6) throw Error('单张不能超过 3200 万像素');
        const draft = await db.drafts.where('fingerprint').equals(fingerprint).first();
        const restored = draft ? documentSchema.safeParse(draft.document) : null;
        const document = selectedTemplate
          ? createDocument(result.width, result.height, selectedTemplate)
          : restored?.success
            ? restored.data
            : style
              ? reflow(style, result.width, result.height)
              : createDocument(result.width, result.height, template);
        added.push({
          id: draft?.id || newId(),
          file,
          url: URL.createObjectURL(file),
          ...result,
          originalMetadata: { ...result.metadata },
          metadata: (draft?.metadata as Metadata) || result.metadata,
          document,
          fingerprint,
        });
      } catch (e) {
        errors.push(`${file.name}：${e instanceof Error ? e.message : e}`);
      }
    }
    s.add(added);
    setBusy(false);
    if (added.length) {
      templateIntent.current = null;
      s.activate(added[0].id);
      navigate('/editor?panel=layout');
      notify(
        `已导入 ${added.length} 张照片${errors.length ? `，${errors.length} 张未导入` : ` · 已自动读取 EXIF，${added.filter((v) => Object.values(v.originalMetadata).some(Boolean)).length} 张包含拍摄信息`}`,
      );
    } else notify(errors[0] || '照片已在队列中');
    if (errors.length) console.warn(errors.join('\n'));
    if (input.current) input.current.value = '';
  }
  async function replaceCurrentPhoto(file?: File) {
    if (!file || !p || busy || exporting) return;
    const targetId = p.id;
    setBusy(true);
    try {
      const fingerprint = await validatePhoto(file);
      const current = useStore.getState();
      if (current.photos.some((v) => v.id !== targetId && v.fingerprint === fingerprint))
        throw Error('这张照片已在队列中，请点击底部缩略图切换照片');
      const result = await imageWorker.inspect(file);
      if (result.width * result.height > 32e6) throw Error('单张不能超过 3200 万像素');
      if (useStore.getState().replacePhoto(targetId, { file, fingerprint, ...result })) {
        setJobs([]);
        notify('已替换当前照片，样式已保留，EXIF 已重新读取 · 可撤销');
      }
    } catch (e) {
      notify(`替换失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
      if (replacementInput.current) replacementInput.current.value = '';
    }
  }
  async function demo() {
    setBusy(true);
    try {
      const names = ['mist', 'dusk', 'coast'];
      const files = await Promise.all(
        names.map(
          async (n) =>
            new File([await (await fetch(`/demo/${n}.jpg`)).blob()], `${n}.jpg`, {
              type: 'image/jpeg',
              lastModified: 1,
            }),
        ),
      );
      setBusy(false);
      await importFiles(files);
    } catch {
      setBusy(false);
      notify('示例加载失败');
    }
  }
  function chooseTemplate(id: string) {
    setPendingTemplate(id);
    if (p && d) {
      s.replace(switchTemplate(d, p.width, p.height, id));
      navigate('/editor?panel=templates');
      notify('已切换模板，保留滤镜与个人素材 · 可撤销');
    } else {
      templateIntent.current = id;
      navigate('/editor?panel=templates');
      input.current?.click();
    }
  }
  function patch(patch: Partial<SceneNode>) {
    if (node) s.change((doc) => updateNode(doc, node.id, patch));
  }
  async function uploadLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !d) return;
    try {
      if (!['image/png', 'image/webp'].includes(file.type))
        throw Error('请上传 PNG 或 WebP 透明图片');
      if (file.size > 10 * 1024 * 1024) throw Error('标识请小于 10MB');
      const bitmap = await createImageBitmap(file);
      const id = newId(),
        width = Math.min(160, (d.height * 0.4 * bitmap.width) / bitmap.height),
        height = (width * bitmap.height) / bitmap.width;
      bitmap.close();
      await db.assets.put({ id, blob: file });
      await imageWorker.asset(id, file);
      const n: SceneNode = {
        ...(d.nodes.find((n) => n.id === 'signature') ??
          makeNode('signature', 'text', '个人签名', 0, 0, 160, 60)),
        id,
        kind: 'image',
        keepRatio: true,
        name: file.name.replace(/\.[^.]+$/, ''),
        assetId: id,
        width,
        height,
        x: Math.max(0, d.width - width - 35),
        y: Math.max(0, d.height - height - 25),
        text: '',
        binding: '',
        anchor: 'footer',
      };
      s.change((doc) => doc.nodes.push(n));
      s.select(id);
      navigate('/editor?panel=layout');
      notify('标识已添加，可拖动和缩放');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
    e.target.value = '';
  }
  function addText() {
    if (!d) return;
    const n: SceneNode = {
      ...(d.nodes.find((n) => n.kind === 'text') ??
        makeNode('text', 'text', '文字', 0, 0, 350, 65)),
      id: newId(),
      name: '自定义文字',
      x: 100,
      y: 100,
      width: 350,
      height: 65,
      text: '写下你的故事',
      binding: '',
      fontSize: 28,
      visible: true,
      locked: false,
      anchor: 'canvas',
    };
    s.change((doc) => doc.nodes.push(n));
    s.select(n.id);
    navigate('/editor?panel=layout');
  }
  async function openLibrary() {
    try {
      setPresets(await db.presets.orderBy('updatedAt').reverse().toArray());
      setLibraryOpen(true);
    } catch {
      notify('本地预设读取失败');
    }
  }
  async function save() {
    if (!d) return;
    try {
      if (!presetName.trim()) return;
      await savePreset(presetName.trim(), d);
      setPresetOpen(false);
      notify('个人预设已保存在此浏览器');
    } catch {
      notify('保存失败，请检查浏览器存储空间');
    }
  }
  async function startExport(onlyFailed = false) {
    if (exporting) return;
    const photos = onlyFailed
      ? s.photos.filter((p) => jobs.some((j) => j.id === p.id && j.status === 'failed'))
      : s.photos;
    if (!photos.length) return;
    setExporting(true);
    cancel.current = new AbortController();
    try {
      const { exportPhotos } = await import('./features/export/export-service');
      const result = await exportPhotos(photos, settings, cancel.current.signal, setJobs);
      notify(
        result.some((j) => j.status === 'failed')
          ? '部分照片导出失败，可单独重试'
          : cancel.current.signal.aborted
            ? '已取消，已完成文件仍可下载'
            : '作品已生成，已开始下载',
      );
    } catch (e) {
      notify(`打包失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setExporting(false);
    }
  }
  const align = (type: string) => {
    if (!d || !node || node.locked) return;
    patch(
      type === 'left'
        ? { x: 0 }
        : type === 'right'
          ? { x: d.width - node.width }
          : type === 'center'
            ? { x: (d.width - node.width) / 2 }
            : type === 'top'
              ? { y: 0 }
              : type === 'bottom'
                ? { y: d.height - node.height }
                : { y: (d.height - node.height) / 2 },
    );
  };
  return (
    <div
      className={styles.app}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={input}
        data-testid="add-photos-input"
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => void importFiles(Array.from(e.target.files || []))}
      />
      <input
        ref={replacementInput}
        data-testid="replace-photo-input"
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => void replaceCurrentPhoto(e.target.files?.[0])}
      />
      <input
        ref={logoInput}
        data-testid="logo-input"
        hidden
        type="file"
        accept="image/png,image/webp"
        onChange={uploadLogo}
      />
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label="定格 Stillframe 首页">
          <svg className={styles.monogram} viewBox="0 0 545 540" aria-hidden="true">
            <use href="/brand/stillframe-polaris.svg#stillframe-polaris" />
          </svg>
          <span>
            定格<small>STILLFRAME</small>
          </span>
        </Link>
        <nav>
          <Link className={gallery ? styles.active : ''} to="/">
            边框模板
          </Link>
          <Link className={!gallery ? styles.active : ''} to="/editor?panel=layout">
            编辑工作台
          </Link>
          {p && (
            <span className={styles.headerProject} title={p.file.name}>
              {p.file.name}
            </span>
          )}
        </nav>
        <div className={styles.headerTools}>
          <button
            className="quiet"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="切换主题"
          >
            {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
            <span>切换主题</span>
          </button>
          <button
            disabled={!d}
            onClick={() => {
              setPresetName('我的出片预设');
              setPresetOpen(true);
            }}
          >
            <Bookmark size={14} />
            另存预设
          </button>
          {p && (
            <button
              className="primary"
              aria-label="导出照片"
              onClick={() => navigate('/editor?panel=export')}
            >
              <Download size={15} />
              <span>导出照片</span>
            </button>
          )}
          <button
            className={p ? '' : 'primary'}
            onClick={() => input.current?.click()}
            disabled={busy || exporting}
          >
            {busy ? <Loader2 className="spin" size={15} /> : <Upload size={15} />}
            {p ? '添加照片' : '导入照片'}
          </button>
        </div>
      </header>
      {gallery ? (
        <main className={styles.gallery}>
          <aside>
            <p className="eyebrow">YOUR LIBRARY</p>
            <h3>边框收藏</h3>
            <button
              className={!category ? styles.sideActive : undefined}
              aria-pressed={!category}
              onClick={() => navigate('/')}
            >
              全部边框 <span>{String(templates.length).padStart(2, '0')}</span>
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                className={category?.id === t.id ? styles.sideActive : undefined}
                aria-pressed={category?.id === t.id}
                onClick={() => navigate(`/?category=${t.id}`)}
              >
                {t.name.split(' · ')[0]}
              </button>
            ))}
            <hr />
            <button onClick={openLibrary}>
              <Bookmark size={15} />
              个人出片预设
            </button>
            <button onClick={() => setInfoOpen(true)}>
              <Info size={15} />
              关于定格
            </button>
            <div className={styles.sideFoot}>
              <p className="eyebrow">MADE FOR YOUR MOMENTS</p>每一张，都值得被珍藏。
            </div>
          </aside>
          <section className={styles.collection} ref={collectionRef}>
            <div className={styles.collectionTitle}>
              <div>
                <p className="eyebrow">THE FRAME COLLECTION / 2026</p>
                <h1>{category ? category.name : '影像，值得被珍藏。'}</h1>
                <p>照片信息自动读取 EXIF，缺失时可手动填写，布局也能自由调整。</p>
                <p className="hint" aria-live="polite">
                  {category ? `当前分类 · 1 款边框` : `全部分类 · ${templates.length} 款边框`} ·
                  缩略图参数为样式示意
                </p>
              </div>
              <div className={styles.demo}>
                <button onClick={demo} disabled={busy}>
                  <ImageIcon size={15} />
                  体验示例照片
                </button>
                <span>无需登录 · 本地处理</span>
              </div>
            </div>
            <div className={styles.cards}>
              {templates.map(
                (t, i) =>
                  (!category || category.id === t.id) && (
                    <button
                      id={`template-${t.id}`}
                      className={styles.card}
                      key={t.id}
                      onClick={() => chooseTemplate(t.id)}
                    >
                      <div className={`${styles.cardVisual} ${styles[`template_${t.id}`]}`}>
                        <div className={styles.samplePaper}>
                          <img
                            src={`/demo/${['mist', 'coast', 'dusk'][i % 3]}.jpg`}
                            alt={`${t.name}效果参考`}
                          />
                          <div className={styles.sampleCaption}>
                            <b>
                              <img
                                className={styles.sampleBrand}
                                src={`/brands/${['nikon-yellow', 'fujifilm', 'canon', 'leica', 'hasselblad', 'sony'][i]}.png`}
                                alt={`${['尼康', '富士', '佳能', '徕卡', '哈苏', '索尼'][i]} Logo 示例`}
                              />
                            </b>
                            <span>35mm · ƒ/2.8 · 1/250s · ISO 100</span>
                          </div>
                        </div>
                      </div>
                      <h3>
                        {t.name}
                        <ArrowUpRight size={19} />
                      </h3>
                      <p>
                        {t.description}
                        <span>使用此模板</span>
                      </p>
                    </button>
                  ),
              )}
            </div>
          </section>
        </main>
      ) : !p ? (
        <main className={styles.empty}>
          <p className="eyebrow">YOUR NEXT FRAME</p>
          <h1>
            {templateIntent.current
              ? `已选「${templates.find((t) => t.id === pendingTemplate)?.name}」`
              : '从一张照片开始。'}
          </h1>
          <p>拖入 JPG、PNG 或 WebP，自动读取拍摄信息。照片始终留在你的设备上。</p>
          <div>
            <button className="primary" onClick={() => input.current?.click()} disabled={busy}>
              <Upload size={16} />
              导入照片
            </button>
            <button onClick={demo} disabled={busy}>
              体验示例
            </button>
          </div>
        </main>
      ) : (
        <main className={styles.workspace}>
          <aside className={styles.sidebar}>
            <nav className={styles.workspaceTools} aria-label="工作台工具">
              {[
                ['templates', '模板'],
                ['filters', '滤镜'],
                ['branding', '文字与标识'],
                ['layout', '图层'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={panel === id}
                  onClick={() => navigate(`/editor?panel=${id}`)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <p className="eyebrow">EDITABLE SCENE</p>
            <h2>
              {panel === 'templates'
                ? '选择边框'
                : panel === 'filters'
                  ? '色彩与情绪'
                  : panel === 'branding'
                    ? '你的专属落款'
                    : '图层与元素'}
            </h2>
            <p className="hint">
              {panel === 'templates'
                ? '选择喜欢的画面布局，点击即可应用。'
                : '选中元素，拖动或拉动边角调整。'}
            </p>
            {panel === 'templates' ? (
              <TemplatePicker photo={p} onChoose={chooseTemplate} />
            ) : panel === 'filters' ? (
              <div className={styles.filterList}>
                {filters.map((f) => (
                  <button
                    key={f.id}
                    className={d!.filter === f.id ? styles.chosen : ''}
                    aria-pressed={d!.filter === f.id}
                    onClick={() => s.change((doc) => (doc.filter = f.id))}
                  >
                    <img
                      src={p.url}
                      alt=""
                      style={{
                        filter:
                          f.id === 'silver'
                            ? 'grayscale(1)'
                            : f.id === 'warm'
                              ? 'sepia(.25)'
                              : 'none',
                      }}
                    />
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className={styles.layerHeading}>
                  <span>{d!.nodes.length} 个元素</span>
                  <span>显隐 / 锁定</span>
                </div>
                <div className={styles.layers}>
                  {[...d!.nodes].reverse().map((n) => (
                    <div key={n.id} className={s.selectedId === n.id ? styles.selectedLayer : ''}>
                      <button
                        className={styles.layerName}
                        onClick={() => {
                          s.select(n.id);
                          if (panel !== 'layout' && panel !== 'branding')
                            navigate('/editor?panel=layout');
                        }}
                      >
                        {n.kind === 'text' ? (
                          <Type size={15} />
                        ) : n.kind === 'rect' ? (
                          <Layers size={15} />
                        ) : (
                          <ImageIcon size={15} />
                        )}
                        <span style={{ opacity: n.visible ? 1 : 0.45 }}>{n.name}</span>
                      </button>
                      <button
                        aria-label={`${n.visible ? '隐藏' : '显示'}${n.name}`}
                        onClick={() =>
                          s.change((doc) => updateNode(doc, n.id, { visible: !n.visible }))
                        }
                      >
                        {n.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        aria-label={`${n.locked ? '解锁' : '锁定'}${n.name}`}
                        onClick={() =>
                          s.change((doc) => updateNode(doc, n.id, { locked: !n.locked }))
                        }
                      >
                        {n.locked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
                <button className="wide" onClick={addText}>
                  <Plus size={14} />
                  添加文字
                </button>
                <button className="wide" onClick={() => logoInput.current?.click()}>
                  <Upload size={14} />
                  上传 Logo / 签名
                </button>
              </>
            )}
            <div className={styles.recipe}>
              <p className="eyebrow">BASED ON A PRESET</p>
              <h3>{templates.find((t) => t.id === d!.template)?.name || '自定义布局'}</h3>
              <p>模板是起点，每个元素都可以编辑。</p>
              <button className="wide" onClick={openLibrary}>
                我的个人预设
                <ChevronRight size={14} />
              </button>
              <button
                className="wide"
                onClick={() => {
                  if (confirm('恢复初始布局？可撤销。'))
                    s.replace(createDocument(p.width, p.height, d!.template));
                }}
              >
                <RotateCcw size={13} />
                重置此模板
              </button>
            </div>
          </aside>
          <section className={styles.center}>
            <nav className={styles.editingActions} aria-label="编辑操作">
              <button disabled={busy || exporting} onClick={() => input.current?.click()}>
                <Plus size={14} />
                添加照片 <small>{s.photos.length} 张</small>
              </button>
              <button
                disabled={busy || exporting}
                onClick={() => replacementInput.current?.click()}
              >
                <Replace size={14} />
                替换照片
              </button>
              <button
                aria-pressed={panel === 'templates'}
                onClick={() => navigate('/editor?panel=templates')}
              >
                <Layers size={14} />
                模板{' '}
                <small>{templates.find((t) => t.id === d!.template)?.name.split(' · ')[0]}</small>
              </button>
              <button
                aria-pressed={panel === 'filters'}
                onClick={() => navigate('/editor?panel=filters')}
              >
                <Sun size={14} />
                滤镜 <small>{filters.find((f) => f.id === d!.filter)?.name}</small>
              </button>
              <button
                aria-pressed={panel === 'export'}
                onClick={() => navigate('/editor?panel=export')}
              >
                <Download size={14} />
                导出
              </button>
            </nav>
            <div className={styles.canvasBar}>
              <div className={styles.photoInfo} title={p.file.name}>
                {cameraLogo(p.metadata.make, p.metadata.model) && (
                  <img
                    src={cameraLogo(p.metadata.make, p.metadata.model)}
                    alt={`${matchBrand(p.metadata.make, p.metadata.model)?.name}相机 Logo`}
                  />
                )}
                <span data-testid="photo-summary">
                  {[
                    textFor({ binding: 'camera', text: '' }, p.metadata),
                    textFor({ binding: 'parameters', text: '' }, p.metadata),
                  ]
                    .filter(Boolean)
                    .join(' · ') || '已自动检查 EXIF · 未找到拍摄信息，可手动补填'}
                </span>
                <button onClick={() => navigate('/editor?panel=metadata')}>编辑信息</button>
              </div>
              <div>
                <button
                  className="icon-button"
                  aria-label="撤销"
                  disabled={!s.past.length || busy || exporting}
                  onClick={s.undo}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="重做"
                  disabled={!s.future.length || busy || exporting}
                  onClick={s.redo}
                >
                  <Redo2 size={16} />
                </button>
                <span title={saveState}>{previewStatus}</span>
              </div>
            </div>
            <Suspense fallback={<div className="canvas-viewport">正在准备画布…</div>}>
              <CanvasEditor
                key={p.id}
                photo={p}
                theme={theme}
                onStatus={setPreviewStatus}
                onNodeSelect={() => {
                  if (panel !== 'layout' && panel !== 'branding') navigate('/editor?panel=layout');
                }}
              />
            </Suspense>
            <div className={styles.filmstrip}>
              <div className={styles.filmTitle}>
                <span className="eyebrow">切换照片</span>
                <span>{s.photos.length} 张 · 选中 1 张</span>
              </div>
              <div className={styles.queue}>
                {s.photos.map((v) => (
                  <div key={v.id} className={v.id === p.id ? styles.activePhoto : ''}>
                    <button
                      className={styles.photoSelect}
                      aria-label={`切换照片：${v.file.name}`}
                      aria-pressed={v.id === p.id}
                      disabled={busy || exporting}
                      onClick={() => s.activate(v.id)}
                    >
                      <img src={v.url} alt={v.file.name} />
                      <span>{v.file.name}</span>
                    </button>
                    <button
                      className={styles.remove}
                      aria-label={`移除${v.file.name}`}
                      disabled={busy || exporting}
                      onClick={() => s.remove(v.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className={styles.addPhoto}
                  onClick={() => input.current?.click()}
                  disabled={busy || exporting}
                >
                  <Plus size={18} />
                  添加照片
                </button>
              </div>
            </div>
          </section>
          <Inspector
            {...{
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
            }}
          />
        </main>
      )}
      <footer className={styles.footer}>
        <span>STILLFRAME / 为每一刻，留下自己的印记。</span>
        <button className="quiet" onClick={() => setInfoOpen(true)}>
          本地处理 · 摄影素材来源
        </button>
      </footer>
      {toast && (
        <div role="status" className={styles.toast}>
          {toast}
        </div>
      )}
      <Modal open={presetOpen} onOpenChange={setPresetOpen} title="留住你的专属布局">
        <p className="hint">保存布局、调色和标识，拍摄参数继续绑定每张照片自己的 EXIF。</p>
        <label className="field">
          预设名称
          <input
            autoFocus
            value={presetName}
            maxLength={40}
            onChange={(e) => setPresetName(e.target.value)}
          />
        </label>
        <button className="primary wide" disabled={!presetName.trim()} onClick={save}>
          保存个人预设
        </button>
      </Modal>
      <Modal open={libraryOpen} onOpenChange={setLibraryOpen} title="我的个人预设">
        {!presets.length ? (
          <p className="hint">还没有个人预设。编辑照片后，可将你的布局另存为预设。</p>
        ) : (
          presets.map((v) => (
            <div key={v.id} className={styles.presetItem}>
              <button
                disabled={!p}
                onClick={() => {
                  if (!p) return;
                  try {
                    const doc = documentSchema.parse(v.document);
                    s.replace(reflow(doc, p.width, p.height));
                    setLibraryOpen(false);
                    navigate('/editor?panel=layout');
                    notify('已应用预设，可继续编辑');
                  } catch {
                    notify('此预设版本无法读取');
                  }
                }}
              >
                {v.name}
                <ArrowUpRight size={15} />
              </button>
              <button
                aria-label={`删除预设${v.name}`}
                onClick={async () => {
                  await db.presets.delete(v.id);
                  setPresets((rows) => rows.filter((r) => r.id !== v.id));
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
        {!p && <p className="hint">先导入照片，再应用个人预设。</p>}
      </Modal>
      <Modal open={infoOpen} onOpenChange={setInfoOpen} title="定格 · Stillframe">
        <p>为每一刻，留下自己的印记。</p>
        <p className="hint">
          照片只在浏览器本地处理。预设、标识和草稿保存在此浏览器；刷新后请重新导入同一原图恢复编辑。浏览器清理数据会删除这些本地记录。
        </p>
        <p className="hint">
          示例照片来自 Unsplash：
          <a href="https://unsplash.com/photos/rQVOlHFFLzs" target="_blank" rel="noreferrer">
            Stephen Coetsee
          </a>
          、
          <a href="https://unsplash.com/photos/_MMP5j_fCqw" target="_blank" rel="noreferrer">
            Willian Justen de Vasconcellos
          </a>
          、
          <a href="https://unsplash.com/photos/fzSJecmxtVQ" target="_blank" rel="noreferrer">
            Simon Fevery
          </a>
          。默认 Your name 为演示署名。
        </p>
      </Modal>
    </div>
  );
}
