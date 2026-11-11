import Dexie, { type EntityTable } from 'dexie';
import { documentSchema, type SceneDocument } from '../domain/model';
import { newId } from '../domain/id';
export type Preset = { id: string; name: string; document: SceneDocument; updatedAt: number };
export const db = new Dexie('stillframe') as Dexie & {
  presets: EntityTable<Preset, 'id'>;
  assets: EntityTable<{ id: string; blob: Blob }, 'id'>;
  drafts: EntityTable<
    { id: string; fingerprint: string; document: SceneDocument; metadata: Record<string, string> },
    'id'
  >;
};
db.version(1).stores({ presets: 'id,updatedAt', assets: 'id', drafts: 'id,fingerprint' });
export async function savePreset(name: string, document: SceneDocument) {
  const d = documentSchema.parse(document);
  await db.presets.put({ id: newId(), name, document: d, updatedAt: Date.now() });
}
