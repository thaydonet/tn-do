import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { expect, it } from 'vitest';
import { initialTemplates } from '../src/domain/templates';

it('preserves old workspace geometry, original image and pending captures during rebranding', async () => {
  const legacy = await openDB('tnmaker-studio-v1', 1, { upgrade(db) { db.createObjectStore('workspace'); db.createObjectStore('images'); db.createObjectStore('queue', { keyPath: 'id' }); } });
  const oldTemplate = { ...structuredClone(initialTemplates[0]), id: '10000000-0000-4000-8000-000000000020', code: 'DEV-20', name: 'Mẫu lưu trữ' };
  const oldWorkspace = { classes: [], students: [], exams: [], templates: [oldTemplate], submissions: [] };
  await legacy.put('workspace', oldWorkspace, 'local');
  await legacy.put('images', new Blob(['evidence']), 'capture/original');
  await legacy.put('queue', { id: 'capture', user_id: 'local', org_id: 'local', original: new Blob(['pending']) });
  const { loadLocal, getImage, queueGet } = await import('../src/lib/local-db');
  const migrated = await loadLocal();
  expect(migrated.templates.find(t => t.id === oldTemplate.id)?.questions).toEqual(oldTemplate.questions);
  expect(migrated.templates.some(t => t.code === 'TNDO-A20')).toBe(true);
  expect(await getImage('capture', 'original')).toBeTruthy();
  expect((await queueGet<{ id: string }>()).map(q => q.id)).toContain('capture');
  expect((await legacy.get('workspace', 'local')).templates).toHaveLength(1);
  legacy.close();
});
