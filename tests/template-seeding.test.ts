import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { initialTemplates } from '../src/domain/templates';
import type { SheetTemplate } from '../src/domain/schemas';

it('adds missing cloud templates with organization-specific IDs and preserves existing versions', async () => {
  const saved: SheetTemplate[] = initialTemplates.slice(0, 2).map(t => ({ ...structuredClone(t), id: crypto.randomUUID() }));
  const original = structuredClone(saved);
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    expect(args.p_org).toBe('organization');
    if (name === 'get_workspace') return { templates: structuredClone(saved) };
    if (name === 'save_template') { saved.push(args.p_template as SheetTemplate); return; }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  vi.doMock('../src/lib/supabase', () => ({ supabase: {}, rpc }));
  try {
    const { seedCloudTemplates } = await import('../src/lib/repository');
    await seedCloudTemplates('organization');
    expect(saved.slice(0, 2)).toEqual(original);
    expect(saved[2].code).toBe('TNDO-3P-2026');
    expect(saved[2].id).not.toBe(initialTemplates[2].id);
    await seedCloudTemplates('organization');
    expect(saved[3].version).toBe(2);
    expect(saved[3].id).toBe(saved[2].id);
    expect(saved[3].questions).toHaveLength(54);
    expect(saved.filter(t => t.print_layout === 'a4-25mm').map(t => [t.code, t.version])).toEqual([['TNDO-A20', 2], ['TNDO-A40', 2], ['TNDO-3P-2026', 3]]);
    expect(new Set(saved.filter(t => t.code === 'TNDO-A20').map(t => t.id)).size).toBe(1);
    expect(new Set(saved.filter(t => t.code === 'TNDO-3P-2026').map(t => t.id)).size).toBe(1);
    expect(rpc.mock.calls.filter(([name]) => name === 'save_template')).toHaveLength(5);
    saved.pop();
    const oldVersion = structuredClone(saved[2]);
    await seedCloudTemplates('organization');
    expect(saved[2]).toEqual(oldVersion);
    expect(saved.at(-1)?.id).toBe(oldVersion.id);
    expect(saved.at(-1)?.version).toBe(3);
    expect(rpc.mock.calls.filter(([name]) => name === 'save_template')).toHaveLength(6);
    // A user's older-layout revision may already occupy the built-in version number.
    const a20 = saved.find(t => t.code === 'TNDO-A20' && t.version === 1)!;
    const customized = { ...structuredClone(a20), version: 7, test_note: 'Existing custom layout' };
    saved.splice(saved.findIndex(t => t.code === 'TNDO-A20' && t.print_layout === 'a4-25mm'), 1);
    saved.push(customized);
    await seedCloudTemplates('organization');
    expect(saved.find(t => t.id === a20.id && t.version === 7)).toEqual(customized);
    expect(saved.at(-1)).toMatchObject({ id: a20.id, version: 8, print_layout: 'a4-25mm' });
  } finally { vi.doUnmock('../src/lib/supabase'); }
});
