import { createContext, useContext, useState, type ReactNode } from 'react';
import { ZodError } from 'zod';
import type { Workspace } from '../domain/schemas';
import type { Organization } from '../lib/repository';
export interface AppContextValue { workspace: Workspace; orgId: string; userId: string; organization?: Organization; reload: () => Promise<void>; refreshOrganizations: () => Promise<void>; notify: (message: string, error?: boolean) => void; navigate: (page: string) => void }
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() { const c = useContext(AppContext); if (!c) throw new Error('Missing app context'); return c; }
export function useTask() {
  const [busy, setBusy] = useState(false), { notify } = useApp();
  const run = async (fn: () => Promise<void>, success?: string) => { setBusy(true); try { await fn(); if (success) notify(success); return true; } catch (e) { notify(e instanceof ZodError ? [...new Set(e.issues.map(issue => issue.message))].join('\n') : e instanceof Error ? e.message : String(e), true); return false; } finally { setBusy(false); } };
  return { busy, run };
}
export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Đóng">×</button></header>{children}</section></div>;
}
export function Empty({ text, children }: { text: string; children?: ReactNode }) { return <div className="empty"><span className="empty-icon">◎</span><h3>{text}</h3>{children}</div>; }
export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
