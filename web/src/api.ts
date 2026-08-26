/** Tanak API klijent: token iz URL fragmenta (#token=...) ili localStorage. */

const TOKEN_KEY = 'kpnotifi_token';

export function initToken(): string | null {
  const m = /#token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  if (m && m[1]) {
    localStorage.setItem(TOKEN_KEY, m[1]);
    history.replaceState(null, '', window.location.pathname); // skloni token iz URL-a
    return m[1];
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const res = await fetch(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearToken();
    throw new ApiError(res.status, (data as any).error ?? `Greška ${res.status}`);
  }
  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Category {
  id: number;
  name: string;
}
export interface Group {
  id: number;
  name: string;
}
export interface Location {
  id: number;
  name: string;
  big: boolean;
}
export interface AttributeDef {
  code: string;
  display_name: string;
  is_multi: boolean;
  data_type: string;
  ui_control: string;
}
export interface Preview {
  params: Record<string, string>;
  kpUrl: string;
  /** true kad KP ne daje podatke našem serveru — pregled nedostupan, snimanje radi */
  unavailable?: boolean;
  total: number;
  filterName: string;
  sample: {
    id: number;
    name: string;
    priceText: string;
    location: string;
    image: string;
    adUrl: string;
  }[];
}
export interface SearchItem {
  id: number;
  name: string;
  isEnabled: boolean;
  params: Record<string, string>;
  createdAt: string;
  lastNotifiedAt: string | null;
}

export const api = {
  me: () => call<{ firstName: string }>('GET', '/api/me'),
  categories: () => call<Category[]>('GET', '/api/catalog/categories'),
  locations: () => call<Location[]>('GET', '/api/catalog/locations'),
  groups: (categoryId: number) =>
    call<Group[]>('GET', `/api/catalog/categories/${categoryId}/groups`),
  attributes: (categoryId: number) =>
    call<AttributeDef[]>('GET', `/api/catalog/categories/${categoryId}/attributes`),
  preview: (input: { params?: Record<string, string>; kpUrl?: string }) =>
    call<Preview>('POST', '/api/preview', input),
  listSearches: () => call<SearchItem[]>('GET', '/api/searches'),
  createSearch: (input: { name: string; params?: Record<string, string>; kpUrl?: string }) =>
    call<{ id?: number; code?: string; telegramUrl?: string }>('POST', '/api/searches', input),
  claim: (code: string) => call<{ claimed: boolean; token?: string }>('GET', `/api/claim/${code}`),
  toggleSearch: (id: number, isEnabled: boolean) =>
    call<{ ok: true }>('PATCH', `/api/searches/${id}`, { isEnabled }),
  deleteSearch: (id: number) => call<{ ok: true }>('DELETE', `/api/searches/${id}`),
};
