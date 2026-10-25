// Gedeelde app-status: thema, privacymodus, melding onderin en de actieve tab.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getItem, KEYS, setItem } from '../lib/storage';
import { refreshWidgets } from '../widgets/update';
import { dark, light, type Palette } from '../theme/tokens';
import type { Filter } from '../lib/portfolio';

export type ThemeName = 'dark' | 'light';
export type TabName = 'overview' | 'portfolio' | 'goals' | 'activity';
export type PortfolioView = { group: 'cat' | 'src'; metric: 'dag' | 'tot'; filter: Filter };

type AppState = {
  theme: ThemeName;
  colors: Palette;
  setTheme: (t: ThemeName) => void;
  privacy: boolean;
  togglePrivacy: () => void;
  toast: string | null;
  say: (msg: string) => void;
  tab: TabName;
  /** Wisselt van tab; optioneel met een portefeuille-filter (vanuit "Waar het staat"). */
  goTab: (tab: TabName, view?: Partial<PortfolioView>) => void;
  portfolioView: PortfolioView;
  setPortfolioView: (v: Partial<PortfolioView>) => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [privacy, setPrivacy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<TabName>('overview');
  const [portfolioView, setView] = useState<PortfolioView>({ group: 'cat', metric: 'dag', filter: 'Alles' });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Privacymodus onthouden; de widgets op je startscherm volgen hem ook.
  useEffect(() => {
    getItem(KEYS.privacy).then((v) => v === 'on' && setPrivacy(true)).catch(() => {});
  }, []);
  const togglePrivacy = useCallback(() => {
    const next = !privacy;
    setPrivacy(next);
    setItem(KEYS.privacy, next ? 'on' : 'off').then(() => refreshWidgets(null, true)).catch(() => {});
  }, [privacy]);

  const say = useCallback((msg: string) => {
    clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  const setPortfolioView = useCallback((v: Partial<PortfolioView>) => setView((s) => ({ ...s, ...v })), []);
  const goTab = useCallback((t: TabName, view?: Partial<PortfolioView>) => {
    if (view) setView((s) => ({ ...s, ...view }));
    setTab(t);
  }, []);

  const value = useMemo<AppState>(() => ({
    theme, colors: theme === 'dark' ? dark : light, setTheme,
    privacy, togglePrivacy,
    toast, say, tab, goTab, portfolioView, setPortfolioView,
  }), [theme, privacy, togglePrivacy, toast, say, tab, goTab, portfolioView, setPortfolioView]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp buiten AppProvider');
  return v;
}

export const useColors = () => useApp().colors;
