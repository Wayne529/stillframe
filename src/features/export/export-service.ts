import { ZipWriter, BlobReader, BlobWriter } from '@zip.js/zip.js';
import { imageWorker } from '../../workers/client';
import type { Photo, ExportSettings } from '../../domain/model';
export type Job = {
  id: string;
  name: string;
  status: 'waiting' | 'rendering' | 'success' | 'failed' | 'cancelled';
  error?: string;
  width?: number;
  height?: number;
};
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportPhotos(
  photos: Photo[],
  settings: ExportSettings,
  signal: AbortSignal,
  onUpdate: (j: Job[]) => void,
) {
  const items = photos.map((p) => ({
      ...p,
      document: structuredClone(p.document),
      metadata: { ...p.metadata },
    })),
    jobs: Job[] = items.map((p) => ({ id: p.id, name: p.file.name, status: 'waiting' }));
  onUpdate([...jobs]);
  let zip: ZipWriter<Blob> | undefined,
    zipSize = 0,
    part = 1,
    hasEntries = false;
  const names = new Set<string>();
  async function flush() {
    if (zip && hasEntries) {
      const blob = await zip.close();
      download(blob, `Stillframe_${part++}.zip`);
    }
    zip = undefined;
    zipSize = 0;
    hasEntries = false;
  }
  for (let i = 0; i < items.length; i++) {
    if (signal.aborted) {
      for (let k = i; k < jobs.length; k++) jobs[k].status = 'cancelled';
      break;
    }
    const p = items[i];
    jobs[i].status = 'rendering';
    onUpdate(jobs.map((j) => ({ ...j })));
    try {
      const out = await imageWorker.render(p.file, p.document, p.metadata, settings);
      const ext =
        settings.format === 'image/jpeg' ? 'jpg' : settings.format === 'image/png' ? 'png' : 'webp';
      // File-system forbidden characters include control codes.
      // eslint-disable-next-line no-control-regex
      const base = p.file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
      let name = `${base}_stillframe.${ext}`,
        n = 2;
      while (names.has(name)) name = `${base}_stillframe_${n++}.${ext}`;
      names.add(name);
      if (items.length === 1) download(out.blob, name);
      else if (out.blob.size > 100 * 1024 * 1024) {
        await flush();
        download(out.blob, name);
      } else {
        if (zipSize + out.blob.size > 100 * 1024 * 1024) await flush();
        zip ??= new ZipWriter(new BlobWriter('application/zip'), { level: 0 });
        await zip.add(name, new BlobReader(out.blob));
        zipSize += out.blob.size;
        hasEntries = true;
      }
      jobs[i] = { ...jobs[i], status: 'success', width: out.width, height: out.height };
    } catch (error) {
      jobs[i] = {
        ...jobs[i],
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    onUpdate(jobs.map((j) => ({ ...j })));
  }
  await flush();
  onUpdate(jobs.map((j) => ({ ...j })));
  return jobs;
}
