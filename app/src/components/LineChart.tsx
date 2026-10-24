// Lijngrafiek met scrubben: sleep over de grafiek om de waarde op dat moment te zien.
import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import { Animated, Platform, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Svg, { G, Path } from 'react-native-svg';
import { chartGeometry } from '../lib/series';
import { useReveal } from './motion';
import { T } from './T';

export type Line = {
  arr: number[]; show: boolean; stroke: string; width: number;
  dash?: string; opacity?: number; round?: boolean;
};

type Props = {
  lines: Line[];
  labels: string[];
  height: number;
  /** Fractie 0–1 van de scrub-positie, of null. */
  scrub: number | null;
  onScrub: (frac: number | null) => void;
  areaFill: string;
  areaOpacity: number;
  axisColor: string;
  scrubLine: string;
  dot: { color: string; border?: string };
  /** Eindpunt met halo als er niet gescrubd wordt (alleen hero). */
  endDot?: { color: string; halo: string };
  /** Verandert de sleutel (bijv. periode), dan tekent de grafiek zich opnieuw. */
  revealKey: unknown;
  axisTop?: number;
};

export function LineChart(p: Props) {
  const [w, setW] = useState(0);
  const reveal = useReveal(p.revealKey);
  const g = useMemo(
    () => (w ? chartGeometry(p.lines, p.scrub, p.labels, w, p.height) : null),
    [w, p.lines, p.scrub, p.labels, p.height],
  );

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const lastIndex = useRef<number | null>(null);
  const n = p.lines[0].arr.length;
  const track = (x: number) => {
    if (!w) return;
    const frac = Math.min(Math.max(x / w, 0), 1);
    // Een klein tikje bij elk nieuw punt, zoals in beleggingsapps.
    const i = Math.round(frac * (n - 1));
    if (lastIndex.current != null && i !== lastIndex.current && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    lastIndex.current = i;
    p.onScrub(frac);
  };
  const end = () => {
    lastIndex.current = null;
    p.onScrub(null);
  };

  // Horizontaal vegen = scrubben. Beweeg je eerst verticaal, dan geeft de grafiek het
  // gebaar af aan de pagina, zodat scrollen gewoon blijft werken.
  const pan = usePanGesture({
    runOnJS: true,
    disableReanimated: true,
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onBegin: (e) => track(e.x),
    onUpdate: (e) => track(e.x),
    onFinalize: end,
  });

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View onLayout={onLayout} style={{ height: p.height }}>
          {g ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, top: -4, bottom: -4, overflow: 'hidden', width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, w + 8] }) }}
              >
                {/* 4px ruimte boven en onder zodat een lijn op de rand niet wordt afgeknipt. */}
                <Svg width={w} height={p.height + 8}>
                  <G transform="translate(0 4)">
                    <Path d={g.area} fill={p.areaFill} fillOpacity={p.areaOpacity} />
                    {p.lines.map((l, i) => (l.show && i > 0 ? (
                      <Path key={i} d={g.paths[i]} fill="none" stroke={l.stroke} strokeOpacity={l.opacity ?? 1} strokeWidth={l.width} strokeDasharray={l.dash} strokeLinecap={l.round ? 'round' : 'butt'} />
                    ) : null))}
                    <Path d={g.paths[0]} fill="none" stroke={p.lines[0].stroke} strokeWidth={p.lines[0].width} strokeLinejoin="round" />
                  </G>
                </Svg>
              </Animated.View>
              {g.index != null ? (
                <>
                  <View pointerEvents="none" style={{ position: 'absolute', top: -8, bottom: 0, left: (g.sx / 100) * w, width: 1, backgroundColor: p.scrubLine }} />
                  <View pointerEvents="none" style={{ position: 'absolute', left: (g.sx / 100) * w - 5, top: (g.sy / 100) * p.height - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: p.dot.color, borderWidth: p.dot.border ? 2 : 0, borderColor: p.dot.border }} />
                </>
              ) : p.endDot ? (
                <View pointerEvents="none" style={{ position: 'absolute', left: w - 4, top: (g.ey / 100) * p.height - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: p.endDot.color, boxShadow: `0 0 0 4px ${p.endDot.halo}` }} />
              ) : null}
            </>
          ) : null}
        </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: p.axisTop ?? 8 }}>
        {(g?.axis ?? ['', '', '', '']).map((a, i) => (
          <T key={i} size={11} num color={p.axisColor}>{a}</T>
        ))}
      </View>
    </View>
  );
}

/** Index in de reeks bij een scrub-fractie (zelfde afronding als de grafiek). */
export const scrubIndex = (frac: number | null, n: number) => (frac == null ? null : Math.round(frac * (n - 1)));
