import type { Tile } from '../data/sample';
import type { Palette } from './tokens';

/** Achtergrond en tekstkleur van het ticker-vak per klasse. */
export function tileColors(c: Palette, tile: Tile): [string, string] {
  switch (tile) {
    case 1: return [c.t1, c.t1i];
    case 2: return [c.t2, c.t2i];
    case 3: return [c.t3, c.t3i];
    case 4: return [c.t4, c.ink];
    case 5: return [c.t5, c.ink];
  }
}
