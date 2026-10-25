// Waar de cijfers vandaan komen: je eigen server (als die gekoppeld is) of anders de voorbeelddata.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { DAY_CHANGE, OUTSIDE, POSITIONS, SOURCES, TOTAL, type Outside, type Position, type Source } from '../data/sample';
import { checkEvents } from '../lib/alerts';
import { ApiError, checkServer, getAppBuild, getEvents, getPortfolio, normalizeUrl, pairDevice, type AppBuild, type PortfolioResponse, type ServerConfig, type ServerEvent } from '../lib/api';
import { investedAndCost } from '../lib/portfolio';
import { deleteItem, getItem, KEYS, setItem } from '../lib/storage';
import { canUpdate, installedVersion, isNewer } from '../lib/update';
import { refreshWidgets } from '../widgets/update';
import { useLock } from './lock';

export type Holdings = {
  /** true = echte data van je server, false = voorbeelddata uit het ontwerp. */
  live: boolean;
  positions: Position[];
  total: number;
  dayChange: number | null;
  invested: number;
  cost: number;
  sources: Source[];
  outside: Outside | null;
  warnings: string[];
  asOf: number | null;
};

type DataState = Holdings & {
  server: ServerConfig | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  /** Meldingen van de server (nieuwste eerst) en hoeveel daarvan je nog niet gezien hebt. */
  events: ServerEvent[];
  unseen: number;
  markSeen: () => void;
  /** Nieuwere app-versie op de server, of null als deze app de nieuwste is. */
  update: AppBuild | null;
  pair: (url: string, code: string) => Promise<void>;
  unpair: () => Promise<void>;
};

const sampleCost = investedAndCost(POSITIONS);
export const SAMPLE: Holdings = {
  live: false, positions: POSITIONS, total: TOTAL, dayChange: DAY_CHANGE,
  invested: sampleCost.invested, cost: sampleCost.cost, sources: SOURCES, outside: OUTSIDE, warnings: [], asOf: null,
};

const EMPTY_LIVE: Holdings = { ...SAMPLE, live: true, positions: [], total: 0, dayChange: null, invested: 0, cost: 0, sources: [], outside: null };
const POLL_MS = 60_000;

export function fromResponse(r: PortfolioResponse): Holdings {
  return {
    live: true, positions: r.positions, total: r.total, dayChange: r.dayChange, invested: r.invested,
    cost: r.cost, sources: r.sources, outside: r.outside, warnings: r.warnings, asOf: r.asOf,
  };
}

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { phase } = useLock();
  const [server, setServer] = useState<ServerConfig | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [seen, setSeen] = useState(0);
  const [update, setUpdate] = useState<AppBuild | null>(null);

  useEffect(() => {
    getItem(KEYS.server)
      .then((raw) => raw && setServer(JSON.parse(raw) as ServerConfig))
      .catch(() => {});
    getItem(KEYS.seenEvent).then((raw) => raw && setSeen(Number(raw))).catch(() => {});
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!server || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      setHoldings(fromResponse(await getPortfolio(server, force)));
      setError(null);
      refreshWidgets(server).catch(() => {});  // hooguit elke 5 minuten
      // Meldingen: nieuwe tonen op de telefoon, en de lijst bijwerken voor het belletje.
      await checkEvents(server).catch(() => {});
      setEvents((await getEvents(server).catch(() => [])).slice().reverse());
      if (canUpdate) {
        const build = await getAppBuild(server).catch(() => null);
        setUpdate(isNewer(build, installedVersion()) ? build : null);
      }
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401
        ? 'De koppeling met je server is verlopen. Koppel opnieuw via Meer → Server.'
        : e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [server]);

  // Ophalen zodra de app open is, daarna elke minuut zolang hij op de voorgrond staat.
  useEffect(() => {
    if (!server || phase !== 'open') return;
    const first = setTimeout(() => refresh(), 0);
    let timer = setInterval(() => refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      clearInterval(timer);
      if (s === 'active') {
        refresh();
        timer = setInterval(() => refresh(), POLL_MS);
      }
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
    };
  }, [server, phase, refresh]);

  const pair = useCallback(async (rawUrl: string, code: string) => {
    const url = normalizeUrl(rawUrl);
    await checkServer(url);
    const token = await pairDevice(url, code, Platform.OS === 'android' ? 'Android-telefoon' : Platform.OS);
    const cfg = { url, token };
    await setItem(KEYS.server, JSON.stringify(cfg));
    setHoldings(null);
    setError(null);
    setServer(cfg);
  }, []);

  const unpair = useCallback(async () => {
    await deleteItem(KEYS.server);
    setServer(null);
    setHoldings(null);
    setError(null);
  }, []);

  const markSeen = useCallback(() => {
    const top = events[0]?.id ?? 0;
    setSeen(top);
    setItem(KEYS.seenEvent, String(top)).catch(() => {});
  }, [events]);
  const unseen = events.filter((e) => e.id > seen).length;

  const value = useMemo<DataState>(() => ({
    ...(server ? holdings ?? EMPTY_LIVE : SAMPLE),
    server, loading, error, refresh, pair, unpair, events, unseen, markSeen, update,
  }), [server, holdings, loading, error, refresh, pair, unpair, events, unseen, markSeen, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData buiten DataProvider');
  return v;
}
