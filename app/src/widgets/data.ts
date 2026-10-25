// Gegevens voor de widgets ophalen bij je server. Werkt ook als de app dicht is (Android
// start dan alleen dit stukje JavaScript). Lukt het niet, dan de laatst bewaarde stand.
import { getHistory, getPortfolio, type ServerConfig } from '../lib/api';
import { getItem, KEYS, setItem } from '../lib/storage';
import { downsample, topMovers, view, type WidgetData, type WidgetView } from './model';

export type WidgetResult = { view: WidgetView | null; message?: string };

async function storedServer(): Promise<ServerConfig | null> {
  const raw = await getItem(KEYS.server);
  return raw ? (JSON.parse(raw) as ServerConfig) : null;
}

export async function loadWidgetData(cfg?: ServerConfig | null): Promise<WidgetResult> {
  const server = cfg ?? (await storedServer());
  if (!server) return { view: null, message: 'Open de app om te koppelen' };
  const privacy = (await getItem(KEYS.privacy)) === 'on';
  let data: WidgetData | null = null;
  try {
    const p = await getPortfolio(server);
    const hist = await getHistory(server, '1D').catch(() => []);
    data = {
      total: p.total,
      delta: p.dayChange,
      at: Date.now(),
      spark: downsample(hist.map((x) => Math.round(x.v))),
      movers: topMovers(p.positions),
    };
    await setItem(KEYS.widget, JSON.stringify(data)).catch(() => {});
  } catch {
    const raw = await getItem(KEYS.widget).catch(() => null);
    if (raw) data = JSON.parse(raw) as WidgetData;
  }
  if (!data) return { view: null, message: 'Server niet bereikbaar' };
  return { view: view(data, privacy) };
}
