// Voorbeelddata uit het prototype (persona Joris, 26 jaar). Wordt later vervangen door data van de server.
import type { Period } from '../lib/series';

export type Category = 'eq' | 'cr' | 'cash' | 'gold';
/** Kleurvak van een positie: 1 aandelen, 2 crypto, 3 sparen, 4 betaal, 5 goud. */
export type Tile = 1 | 2 | 3 | 4 | 5;

export type Wallet = { name: string; qty: string; value: number; icon: 'lock' | 'currency_exchange'; note: string };

export type Position = {
  id: string;
  tk: string;
  name: string;
  cls: 'ETF' | 'Aandeel' | 'Crypto' | 'Cash' | 'Goud';
  cat: Category;
  src: string;
  value: number;
  tile: Tile;
  qty?: number;
  unit?: string;
  price?: number;
  cur?: 'EUR' | 'USD';
  cost?: number;
  fees?: string;
  /** Rendement in % per periode, in de volgorde 1D, 1W, 1M, 1J, Alles. */
  returns?: [number, number, number, number, number];
  /** Broker waarmee je deze belegging handelt. */
  trade?: 'Trading 212' | 'OKX';
  /** Maximaal te verkopen bedrag (BTC: alleen het OKX-deel). */
  sellMax?: number;
  wallets?: Wallet[];
  dividend?: string[];
  rate?: string;
  note?: string;
  manual?: boolean;
};

export const POSITIONS: Position[] = [
  { id: 'vwce', tk: 'VWCE', name: 'Vanguard FTSE All-World', cls: 'ETF', cat: 'eq', src: 'Trading 212', qty: 142.3, unit: 'st', price: 128.04, cur: 'EUR', value: 18220, cost: 14950, fees: '€ 0,00', returns: [0.71, 1.4, 2.1, 17.2, 61], tile: 1, trade: 'Trading 212', dividend: ['Uitkerend · per kwartaal · TER 0,22%', 'Laatste: 29 sep · € 70,10', 'Volgende: ~24 dec · ~€ 71'] },
  { id: 'sxr8', tk: 'SXR8', name: 'iShares Core S&P 500', cls: 'ETF', cat: 'eq', src: 'Trading 212', qty: 6.9, unit: 'st', price: 680.7, cur: 'EUR', value: 4697, cost: 4105, fees: '€ 0,00', returns: [0.52, 1.1, 2.4, 14.1, 44], tile: 1, trade: 'Trading 212' },
  { id: 'asml', tk: 'ASML', name: 'ASML Holding', cls: 'Aandeel', cat: 'eq', src: 'Trading 212', qty: 7, unit: 'st', price: 702.8, cur: 'EUR', value: 4920, cost: 4410, fees: '€ 0,00', returns: [1.84, 3.2, -4.6, 9.8, 11.6], tile: 1, trade: 'Trading 212', dividend: ['€ 1,60 per aandeel · per kwartaal', 'Volgende: ~6 nov · ~€ 11,20'] },
  { id: 'aapl', tk: 'AAPL', name: 'Apple', cls: 'Aandeel', cat: 'eq', src: 'Trading 212', qty: 18, unit: 'st', price: 245.1, cur: 'USD', value: 3803, cost: 3120, fees: '€ 5,62 valuta', returns: [-0.42, 0.8, 3.9, 12.4, 21.9], tile: 1, trade: 'Trading 212', dividend: ['$ 0,26 per aandeel · 15% bronbelasting', 'Volgende: ~13 nov · ~$ 4,70'] },
  { id: 'btc', tk: 'BTC', name: 'Bitcoin', cls: 'Crypto', cat: 'cr', src: 'Trezor Safe 5 · OKX', qty: 0.1452, unit: 'BTC', price: 91810, cur: 'EUR', value: 13331, cost: 9870, fees: '€ 4,12', returns: [-0.52, 3.4, -4.4, 41, 35], tile: 2, trade: 'OKX', sellMax: 3461,
    wallets: [
      { name: 'Trezor Safe 5', qty: '0,1075 BTC', value: 9870, icon: 'lock', note: 'Cold storage · alleen-lezen' },
      { name: 'OKX', qty: '0,0377 BTC', value: 3461, icon: 'currency_exchange', note: 'Exchange · handelen via API' },
    ] },
  { id: 'eth', tk: 'ETH', name: 'Ethereum', cls: 'Crypto', cat: 'cr', src: 'OKX', qty: 0.82, unit: 'ETH', price: 2480, cur: 'EUR', value: 2034, cost: 2210, fees: '€ 1,90', returns: [-0.31, 2.1, -6.2, -8, -8], tile: 2, trade: 'OKX' },
  { id: 'sol', tk: 'SOL', name: 'Solana', cls: 'Crypto', cat: 'cr', src: 'OKX', qty: 4.3, unit: 'SOL', price: 145.3, cur: 'EUR', value: 625, cost: 520, fees: '€ 0,58', returns: [1.12, 4.8, -2.9, 18, 20], tile: 2, trade: 'OKX' },
  { id: 'spaar', tk: 'ING', name: 'Oranje Spaarrekening', cls: 'Cash', cat: 'cash', src: 'ING', value: 12400, tile: 3, rate: '2,25% rente', note: 'Rente wordt maandelijks bijgeschreven. Deze rekening is gekoppeld aan je doel Noodbuffer.' },
  { id: 'betaal', tk: 'ING', name: 'Betaalrekening', cls: 'Cash', cat: 'cash', src: 'ING', value: 2850, tile: 4, note: 'Saldo via PSD2-koppeling, elk uur bijgewerkt.' },
  { id: 'goud', tk: 'XAU', name: 'Goud · 22 g', cls: 'Goud', cat: 'gold', src: 'Handmatig', qty: 22, unit: 'g', price: 88.64, cur: 'EUR', value: 1950, cost: 1620, fees: '—', returns: [0.3, 0.9, 3.1, 28, 20], tile: 5, manual: true, note: 'Fysiek goud, handmatig ingevoerd. Waarde volgt de spotprijs.' },
];

/** Belegd vermogen (beleggingen + spaargeld), zoals in de hero. */
export const TOTAL = 64830.42;
export const DAY_CHANGE = 412.18;
export const FEES_YTD = 38.4;
/** Rendement volgens de drie methodes; de app toont standaard IRR. */
export const RETURN_TWR = 16.6;
export const RETURN_IRR = 11.2;

export type Transaction = { month: string; date: string; title: string; sub: string; amount: number; tk?: string };

export const TRANSACTIONS: Transaction[] = [
  { month: 'Oktober 2026', date: '15 okt', title: 'Koop VWCE', sub: 'Trading 212 · periodiek · 1,56 st', amount: -200, tk: 'VWCE' },
  { month: 'Oktober 2026', date: '12 okt', title: 'Koop BTC', sub: 'OKX · periodiek · 0,00207 BTC', amount: -190, tk: 'BTC' },
  { month: 'Oktober 2026', date: '10 okt', title: 'Storting Trading 212', sub: 'ING → Trading 212', amount: 650 },
  { month: 'Oktober 2026', date: '3 okt', title: 'Verkoop SOL', sub: 'OKX · 1,2 SOL à € 151,10', amount: 181.32, tk: 'SOL' },
  { month: 'Oktober 2026', date: '1 okt', title: 'Rente spaarrekening', sub: 'ING · 2,25%', amount: 23.18 },
  { month: 'September 2026', date: '29 sep', title: 'Dividend VWCE', sub: 'Trading 212 · 142,3 st', amount: 70.1, tk: 'VWCE' },
  { month: 'September 2026', date: '25 sep', title: 'Koop ASML', sub: 'Trading 212 · 1 st à € 688,40', amount: -688.4, tk: 'ASML' },
  { month: 'September 2026', date: '15 sep', title: 'Koop VWCE', sub: 'Trading 212 · periodiek · 1,59 st', amount: -200, tk: 'VWCE' },
  { month: 'September 2026', date: '12 sep', title: 'Koop BTC', sub: 'OKX · periodiek · 0,00212 BTC', amount: -190, tk: 'BTC' },
  { month: 'September 2026', date: '10 sep', title: 'Storting Trading 212', sub: 'ING → Trading 212', amount: 650 },
  { month: 'September 2026', date: '2 sep', title: 'Opname naar Trezor', sub: 'OKX → Trezor Safe 5 · 0,02 BTC', amount: 0, tk: 'BTC' },
  { month: 'September 2026', date: '1 sep', title: 'Rente spaarrekening', sub: 'ING · 2,25%', amount: 22.94 },
  { month: 'Augustus 2026', date: '14 aug', title: 'Dividend AAPL', sub: '$ 4,68 bruto · 15% bronbelasting', amount: 3.41, tk: 'AAPL' },
  { month: 'Augustus 2026', date: '7 aug', title: 'Dividend ASML', sub: 'Trading 212 · € 1,60 per aandeel', amount: 11.2, tk: 'ASML' },
];

export type Source = { id: string; name: string; value: number; change?: number; sub?: string };

export const SOURCES: Source[] = [
  { id: 't212', name: 'Trading 212', value: 31640, change: 0.82 },
  { id: 'ing', name: 'ING', value: 15250, sub: '2,25% rente' },
  { id: 'trezor', name: 'Trezor Safe 5', value: 9870, change: -0.52 },
  { id: 'okx', name: 'OKX', value: 6120, change: -0.24 },
];

export type Instrument = { tk: string; name: string; type: 'ETF' | 'Aandeel' | 'Crypto'; price: number; cur: 'EUR' | 'USD' | 'DKK'; change: number };

/** Volglijst (dagbeweging). */
export const WATCHLIST: Instrument[] = [
  { tk: 'NVDA', name: 'NVIDIA', type: 'Aandeel', price: 182.4, cur: 'USD', change: 2.31 },
  { tk: 'IWDA', name: 'iShares Core MSCI World', type: 'ETF', price: 108.22, cur: 'EUR', change: 0.64 },
  { tk: 'ADYEN', name: 'Adyen', type: 'Aandeel', price: 1512, cur: 'EUR', change: 0.95 },
  { tk: 'LINK', name: 'Chainlink', type: 'Crypto', price: 15.62, cur: 'EUR', change: 2.8 },
  { tk: 'NOVO', name: 'Novo Nordisk', type: 'Aandeel', price: 412, cur: 'DKK', change: -1.12 },
  { tk: 'EMIM', name: 'iShares Core MSCI EM IMI', type: 'ETF', price: 36.18, cur: 'EUR', change: -0.21 },
];
/** Tickers met een koersalert krijgen een gouden rand in de volglijst. */
export const WATCH_ALERTS = ['NVDA', 'ADYEN', 'NOVO'];

export type Plan = { tk: string; amount: number; freq: 'Maandelijks' | 'Wekelijks'; active: boolean };
export const PLANS: Plan[] = [
  { tk: 'VWCE', amount: 200, freq: 'Maandelijks', active: true },
  { tk: 'BTC', amount: 190, freq: 'Maandelijks', active: true },
  { tk: 'ETH', amount: 25, freq: 'Wekelijks', active: false },
];
export const OPEN_ORDERS = 3;
/** Doelverdeling voor herbalanceren, in %. */
export const TARGETS: Record<Category, number> = { eq: 55, cr: 20, cash: 20, gold: 5 };

export const OUTSIDE = { pension: 14300, woz: 285000, mortgage: 262400, equity: 22600 };
export const BOX3 = { base: 58900, free: 57684, tax: 22 };
export const GOALS = { fire: 500000, buffer: 15000, bufferSaved: 12400, monthly: 650, returnPct: 7 };

export const DEFAULT_PERIOD: Period = 'Alles';
