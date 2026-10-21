// Animaties uit het ontwerp: scherm schuift in, regels verschijnen na elkaar, grafiek tekent zich.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { motion } from '../theme/tokens';

const OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

/** translateX 28px → 0 + vervagen, 400ms. */
export function ScreenIn({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const [k] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(k, { toValue: 1, duration: motion.screenIn, easing: OUT, useNativeDriver: true }).start();
  }, [k]);
  const translateX = k.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  return <Animated.View style={[{ flex: 1, opacity: k, transform: [{ translateX }] }, style]}>{children}</Animated.View>;
}

/** Lijstregel die 14px omhoog schuift en invaagt; `index` bepaalt de vertraging (max. 12 regels). */
export function FadeUp({ children, index = 0, step = motion.rowStagger, style }: { children: ReactNode; index?: number; step?: number; style?: ViewStyle }) {
  const [k] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(k, { toValue: 1, duration: motion.rowDuration, delay: Math.min(index, motion.maxRows) * step, easing: OUT, useNativeDriver: true }).start();
  }, [k, index, step]);
  const translateY = k.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[{ opacity: k, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

/** Telt op van 0 naar 1 met ease-out quart (voor het hero-totaal). Start opnieuw als `key` verandert. */
export function useCountUp(duration = motion.countUp, key: unknown = 0): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min((Date.now() - t0) / duration, 1);
      setV(1 - Math.pow(1 - k, 4));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [duration, key]);
  return v;
}

/** Breedte van 0 → 100% (clip), zodat een grafiek zich van links naar rechts tekent. */
export function useReveal(key: unknown): Animated.Value {
  const [k] = useState(() => new Animated.Value(0));
  useEffect(() => {
    k.setValue(0);
    Animated.timing(k, { toValue: 1, duration: motion.chartDraw, easing: Easing.bezier(0.3, 0.7, 0.2, 1), useNativeDriver: false }).start();
  }, [k, key]);
  return k;
}
