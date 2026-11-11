import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../src/app/store';
import { createDocument, type Photo } from '../src/domain/model';
function photo(id: string): Photo {
  const file = new File([id], `${id}.jpg`, { type: 'image/jpeg' });
  const metadata = {
    make: 'Nikon',
    model: 'Z8',
    iso: '100',
    lens: '',
    focal: '',
    aperture: '',
    shutter: '',
    date: '',
  };
  return {
    id,
    file,
    url: URL.createObjectURL(file),
    width: 1600,
    height: 1000,
    metadata,
    originalMetadata: { ...metadata },
    fingerprint: id,
    document: createDocument(1600, 1000),
  };
}
beforeEach(() =>
  useStore.setState({
    photos: [],
    activeId: '',
    past: [],
    future: [],
    histories: {},
    selectedId: 'signature',
  }),
);
describe('photo replacement history', () => {
  it('undoes and redoes the complete photo source while retaining style and metadata edits from before replacement', () => {
    const original = photo('a');
    useStore.getState().add([original]);
    useStore.getState().change((d) => {
      d.filter = 'warm';
      d.nodes.find((n) => n.id === 'signature')!.text = '留住光';
    });
    useStore.getState().metadata({ iso: '999' });
    const next = photo('new');
    useStore
      .getState()
      .replacePhoto('a', {
        ...next,
        width: 1000,
        height: 1600,
        metadata: { ...next.metadata, make: 'Canon', iso: '400' },
      });
    const replaced = useStore.getState().photos[0];
    expect(replaced.document.filter).toBe('warm');
    expect(replaced.document.nodes.find((n) => n.id === 'signature')!.text).toBe('留住光');
    expect(replaced.originalMetadata.iso).toBe('400');
    expect(replaced.metadata.iso).toBe('400');
    useStore.getState().undo();
    expect(useStore.getState().photos[0].file).toBe(original.file);
    expect(useStore.getState().photos[0].metadata.iso).toBe('999');
    expect(useStore.getState().photos[0].originalMetadata.iso).toBe('100');
    useStore.getState().redo();
    expect(useStore.getState().photos[0]).toBe(replaced);
  });
  it('keeps histories when switching photos and releases URLs only after snapshots are discarded', () => {
    const original = photo('a'),
      other = photo('b'),
      next = photo('new');
    useStore.getState().add([original, other]);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    useStore.getState().replacePhoto('a', next);
    const replacementUrl = useStore.getState().photos[0].url;
    expect(revoke).not.toHaveBeenCalledWith(original.url);
    useStore.getState().activate('b');
    useStore.getState().activate('a');
    useStore.getState().undo();
    expect(useStore.getState().photos[0].url).toBe(original.url);
    expect(revoke).not.toHaveBeenCalledWith(replacementUrl);
    useStore.getState().change((d) => {
      d.filter = 'silver';
    });
    expect(revoke).toHaveBeenCalledWith(replacementUrl);
    useStore.getState().remove('a');
    expect(revoke).toHaveBeenCalledWith(original.url);
    URL.revokeObjectURL(next.url);
    revoke.mockRestore();
  });
});
