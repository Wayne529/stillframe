import { create } from 'zustand';
import { produce } from 'immer';
import {
  reflow,
  type Photo,
  type SceneDocument,
  type SceneNode,
  type Metadata,
} from '../domain/model';
type History = { past: Photo[]; future: Photo[] };
type Replacement = Pick<Photo, 'file' | 'width' | 'height' | 'metadata' | 'fingerprint'>;
type Store = History & {
  photos: Photo[];
  activeId: string;
  selectedId: string;
  histories: Record<string, History>;
  add: (p: Photo[]) => void;
  activate: (id: string) => void;
  select: (id: string) => void;
  change: (fn: (d: SceneDocument) => void, before?: SceneDocument, record?: boolean) => void;
  replace: (d: SceneDocument) => void;
  replacePhoto: (id: string, source: Replacement) => boolean;
  undo: () => void;
  redo: () => void;
  remove: (id: string) => void;
  metadata: (m: Partial<Metadata>) => void;
  applyAll: () => void;
};
const emptyHistory = (): History => ({ past: [], future: [] });
export const useStore = create<Store>((set, get) => ({
  photos: [],
  activeId: '',
  selectedId: 'signature',
  ...emptyHistory(),
  histories: {},
  add: (ps) => {
    if (!ps.length) return;
    set((s) => ({ photos: [...s.photos, ...ps], activeId: s.activeId || ps[0].id }));
  },
  activate: (id) => {
    const s = get();
    if (s.activeId === id || !s.photos.some((p) => p.id === id)) return;
    const histories = {
      ...s.histories,
      ...(s.activeId ? { [s.activeId]: { past: s.past, future: s.future } } : {}),
    };
    const history = histories[id] || emptyHistory();
    delete histories[id];
    set({ activeId: id, histories, ...history });
  },
  select: (id) => set({ selectedId: id }),
  change: (fn, before, record = true) => {
    const s = get(),
      p = s.photos.find((p) => p.id === s.activeId);
    if (!p) return;
    const document = produce(p.document, (draft) => {
      fn(draft);
    });
    set({
      photos: s.photos.map((v) => (v.id === p.id ? { ...v, document } : v)),
      past: record ? [...s.past.slice(-49), before ? { ...p, document: before } : p] : s.past,
      future: [],
    });
  },
  replace: (d) => get().change((doc) => Object.assign(doc, structuredClone(d))),
  replacePhoto: (id, source) => {
    const s = get(),
      p = s.photos.find((p) => p.id === id);
    if (!p) return false;
    const document = reflow(p.document, source.width, source.height);
    for (const n of document.nodes) {
      if (n.id === 'paper' || n.kind === 'photo') continue;
      n.x = Math.max(0, Math.min(n.x, Math.max(0, document.width - n.width)));
      n.y = Math.max(0, Math.min(n.y, Math.max(0, document.height - n.height)));
    }
    const next: Photo = {
      ...p,
      file: source.file,
      width: source.width,
      height: source.height,
      fingerprint: source.fingerprint,
      url: URL.createObjectURL(source.file),
      originalMetadata: { ...source.metadata },
      metadata: { ...source.metadata },
      document,
    };
    const history =
      id === s.activeId ? { past: s.past, future: s.future } : s.histories[id] || emptyHistory();
    const updated = { past: [...history.past.slice(-49), p], future: [] };
    set({
      photos: s.photos.map((v) => (v.id === id ? next : v)),
      ...(id === s.activeId ? updated : { histories: { ...s.histories, [id]: updated } }),
    });
    return true;
  },
  undo: () => {
    const s = get(),
      previous = s.past.at(-1),
      p = s.photos.find((p) => p.id === s.activeId);
    if (!previous || !p) return;
    set({
      photos: s.photos.map((v) => (v.id === p.id ? previous : v)),
      past: s.past.slice(0, -1),
      future: [...s.future, p],
    });
  },
  redo: () => {
    const s = get(),
      next = s.future.at(-1),
      p = s.photos.find((p) => p.id === s.activeId);
    if (!next || !p) return;
    set({
      photos: s.photos.map((v) => (v.id === p.id ? next : v)),
      past: [...s.past, p],
      future: s.future.slice(0, -1),
    });
  },
  remove: (id) => {
    const s = get(),
      photos = s.photos.filter((p) => p.id !== id),
      histories = { ...s.histories };
    delete histories[id];
    const activeId = s.activeId === id ? photos[0]?.id || '' : s.activeId;
    const history =
      s.activeId === id
        ? histories[activeId] || emptyHistory()
        : { past: s.past, future: s.future };
    delete histories[activeId];
    set({ photos, activeId, histories, ...history });
  },
  metadata: (m) => {
    const s = get(),
      p = s.photos.find((p) => p.id === s.activeId);
    if (!p) return;
    set({
      photos: s.photos.map((v) =>
        v.id === p.id ? { ...p, metadata: { ...p.metadata, ...m } } : v,
      ),
      past: [...s.past.slice(-49), p],
      future: [],
    });
  },
  applyAll: () => {
    const s = get(),
      active = s.photos.find((p) => p.id === s.activeId);
    if (!active) return;
    const histories = { ...s.histories };
    for (const p of s.photos) {
      if (p.id === s.activeId) continue;
      const history = histories[p.id] || emptyHistory();
      histories[p.id] = { past: [...history.past.slice(-49), p], future: [] };
    }
    set({
      photos: s.photos.map((p) => ({ ...p, document: reflow(active.document, p.width, p.height) })),
      histories,
      past: [...s.past.slice(-49), active],
      future: [],
    });
  },
}));
// Object URLs remain alive while an undo/redo snapshot needs them, then are released.
function photoUrls(s: Store) {
  return new Set(
    [
      ...s.photos,
      ...s.past,
      ...s.future,
      ...Object.values(s.histories).flatMap((h) => [...h.past, ...h.future]),
    ].map((p) => p.url),
  );
}
useStore.subscribe((s, before) => {
  const current = photoUrls(s);
  for (const url of photoUrls(before)) if (!current.has(url)) URL.revokeObjectURL(url);
});
export function updateNode(d: SceneDocument, id: string, patch: Partial<SceneNode>) {
  const n = d.nodes.find((n) => n.id === id);
  if (n) Object.assign(n, patch);
}
