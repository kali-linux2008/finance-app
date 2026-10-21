// Korte melding onderin (2,4 s), schuift omhoog in beeld.
import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { T } from './T';

export function Toast() {
  const { toast, colors: c } = useApp();
  const insets = useSafeAreaInsets();
  const [k] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!toast) return;
    k.setValue(0);
    Animated.timing(k, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [toast, k]);
  if (!toast) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 24, right: 24, bottom: 96 + insets.bottom, zIndex: 30,
        paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.ink,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        opacity: k, transform: [{ translateY: k.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }],
      }}
    >
      <T size={14} w={600} color={c.bg}>{toast}</T>
    </Animated.View>
  );
}
