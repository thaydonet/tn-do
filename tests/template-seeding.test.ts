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
    expect(rpc.mock.calls.filter(([name]) => name === 'save_template')).toHaveLength(2);
    saved.pop();
    const oldVersion = structuredClone(saved[2]);
    await seedCloudTemplates('organization');
    expect(saved[2]).toEqual(oldVersion);
    expect(saved[3].id).toBe(oldVersion.id);
    expect(saved[3].version).toBe(2);
    expect(rpc.mock.calls.filter(([name]) => name === 'save_template')).toHaveLength(3);
  } finally { vi.doUnmock('../src/lib/supabase'); }
});
