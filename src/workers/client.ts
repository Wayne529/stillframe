import { wrap } from 'comlink';
import type { ImageWorker } from './image.worker';
const worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
const remote = wrap<ImageWorker>(worker);
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = tail.then(fn);
  tail = p.catch(() => {});
  return p;
}
export const imageWorker = {
  inspect: remote.inspect,
  asset: remote.asset,
  preview: (...args: Parameters<ImageWorker['preview']>) => serial(() => remote.preview(...args)),
  render: (...args: Parameters<ImageWorker['render']>) => serial(() => remote.render(...args)),
};
