// Browser-local project storage plus file import/export.
import { type Project, validateProject } from './model';

const INDEX_KEY = 'midad:index';
const LAST_KEY = 'midad:last';
const projectKey = (id: string) => `midad:project:${id}`;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = safeGet(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveProject(p: Project): boolean {
  const ok = safeSet(projectKey(p.id), JSON.stringify(p));
  if (!ok) return false;
  const list = listProjects().filter((m) => m.id !== p.id);
  list.unshift({ id: p.id, name: p.name, updatedAt: p.updatedAt });
  safeSet(INDEX_KEY, JSON.stringify(list));
  safeSet(LAST_KEY, p.id);
  return true;
}

export function loadProject(id: string): Project | null {
  const raw = safeGet(projectKey(id));
  if (!raw) return null;
  try {
    return validateProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function deleteProject(id: string) {
  try {
    localStorage.removeItem(projectKey(id));
  } catch {
    /* ignore */
  }
  safeSet(INDEX_KEY, JSON.stringify(listProjects().filter((m) => m.id !== id)));
}

export function lastProjectId(): string | null {
  return safeGet(LAST_KEY);
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 1);
}

export function parseProjectFile(text: string): Project {
  return validateProject(JSON.parse(text));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(name: string): string {
  return (name.trim() || 'midad').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}
