// Praten met je eigen Meridian-server. Elk verzoek heeft een tijdslimiet en een begrijpelijke foutmelding.
import type { Outside, Position, Source } from '../data/sample';
import type { Period } from './series';

export type ServerConfig = { url: string; token: string };

export type PortfolioResponse = {
  asOf: number;
  total: number;
  dayChange: number | null;
  invested: number;
  cost: number;
  positions: Position[];
  sources: Source[];
  outside: Outside | null;
  warnings: string[];
};

export type Point = { t: number; v: number };

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** "192.168.1.20:8000" → "http://192.168.1.20:8000" (zonder / aan het eind). */
export function normalizeUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  return url;
}

async function request<T>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    throw new ApiError('Server niet bereikbaar. Staat hij aan en zit je telefoon op hetzelfde netwerk?');
  } finally {
    clearTimeout(timer);
  }
  let body: { detail?: string } & Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // geen JSON: dan is dit waarschijnlijk niet de Meridian-server
  }
  if (!res.ok) throw new ApiError(typeof body.detail === 'string' ? body.detail : `Server gaf fout ${res.status}`, res.status);
  return body as T;
}

const auth = (cfg: ServerConfig) => ({ headers: { Authorization: `Bearer ${cfg.token}` } });

export async function checkServer(url: string): Promise<void> {
  const h = await request<{ name?: string }>(`${url}/api/health`, {}, 8000);
  if (h.name !== 'meridian') throw new ApiError('Op dit adres draait geen Meridian-server.');
}

export async function pairDevice(url: string, code: string, device: string): Promise<string> {
  const r = await request<{ token: string }>(`${url}/api/koppel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.replace(/\s/g, ''), device }),
  });
  return r.token;
}

export const getPortfolio = (cfg: ServerConfig, refresh = false) =>
  request<PortfolioResponse>(`${cfg.url}/api/portfolio${refresh ? '?refresh=true' : ''}`, auth(cfg), 30000);

export const getHistory = async (cfg: ServerConfig, period: Period) =>
  (await request<{ points: Point[] }>(`${cfg.url}/api/history?period=${period}`, auth(cfg))).points;

export const getCandles = async (cfg: ServerConfig, ccy: string, period: Period) =>
  (await request<{ points: Point[] }>(`${cfg.url}/api/candles/${encodeURIComponent(ccy)}?period=${period}`, auth(cfg), 20000)).points;
