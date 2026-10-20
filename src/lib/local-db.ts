import { openDB } from 'idb';
import { initialTemplates } from '../domain/templates';
import type { Workspace } from '../domain/schemas';
const db = (async () => {
  const current = await openDB('tn-do-v1', 1, { upgrade(db) { db.createObjectStore('workspace'); db.createObjectStore('images'); db.createObjectStore('queue', { keyPath: 'id' }); } });
  if (!await current.get('workspace', 'legacy-migration') && typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases();
    if (databases.some(d => d.name === 'tnmaker-studio-v1')) {
      const legacy = await openDB('tnmaker-studio-v1');
      const entries: { store: string; key: IDBValidKey; value: unknown }[] = [];
      for (const name of ['workspace', 'images', 'queue']) if (legacy.objectStoreNames.contains(name)) {
        const tx = legacy.transaction(name), keys = await tx.store.getAllKeys(), values = await tx.store.getAll();
        keys.forEach((key, i) => entries.push({ store: name, key, value: values[i] }));
      }
      const tx = current.transaction(['workspace', 'images', 'queue'], 'readwrite');
      for (const entry of entries) {
        if (await tx.objectStore(entry.store).get(entry.key) !== undefined) continue;
        if (entry.store === 'queue') await tx.objectStore(entry.store).put(entry.value);
        else await tx.objectStore(entry.store).put(entry.value, entry.key);
      }
      await tx.done; legacy.close();
    }
    await current.put('workspace', true, 'legacy-migration');
  }
  return current;
})();
export const emptyWorkspace = (): Workspace => ({ classes: [], students: [], exams: [], templates: structuredClone(initialTemplates), submissions: [] });
export async function loadLocal(): Promise<Workspace> {
  const saved: Workspace | undefined = await (await db).get('workspace', 'local');
  if (!saved) return emptyWorkspace();
  for (const template of initialTemplates) if (!saved.templates.some(t => t.id === template.id)) saved.templates.push(structuredClone(template));
  return saved;
}
export async function saveLocal(value: Workspace) { await (await db).put('workspace', value, 'local'); }
export async function getLocalValue<T>(key: string): Promise<T | undefined> { return (await db).get('workspace', key); }
export async function putLocalValue(key: string, value: unknown) { await (await db).put('workspace', value, key); }
export async function putImage(id: string, kind: string, blob: Blob) { await (await db).put('images', blob, `${id}/${kind}`); }
export async function getImage(id: string, kind: string): Promise<Blob | undefined> { return (await db).get('images', `${id}/${kind}`); }
export async function queuePut(item: unknown) { await (await db).put('queue', item); }
export async function queueAdd(item: unknown) { await (await db).add('queue', item); }
export async function queueGet<T>(): Promise<T[]> { return (await db).getAll('queue'); }
export async function queueDelete(id: string) { await (await db).delete('queue', id); }
