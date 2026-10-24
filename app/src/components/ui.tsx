// Kleine bouwstenen die op elk scherm terugkomen.
import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useColors } from '../state/app';
import { radius } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { T } from './T';

/** Kaart met zacht verloop en haarlijn (luxe-stijl). */
export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const c = useColors();
  const s: ViewStyle = { backgroundImage: c.surfaceGrad, borderRadius: radius.card, boxShadow: `inset 0 0 0 1px ${c.line}`, ...style };
  return onPress ? <Pressable onPress={onPress} style={s}>{children}</Pressable> : <View style={s}>{children}</View>;
}

/** Kaart met alleen een rand (voor zaken buiten belegd vermogen). */
export function OutlineCard({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const c = useColors();
  const s: ViewStyle = { borderWidth: 1, borderColor: c.line, borderRadius: radius.card, ...style };
  return onPress ? <Pressable onPress={onPress} style={s}>{children}</Pressable> : <View style={s}>{children}</View>;
}

/** Sectiekop in serif met optionele link rechts ("Inzichten", "Beheren"). */
export function SectionTitle({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  const c = useColors();
  return (
    <View style={{ paddingTop: 30, paddingHorizontal: 24, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <T serif size={20}>{title}</T>
      {link ? <T size={13} w={600} color={c.accent} onPress={onLink} suppressHighlighting>{link}</T> : null}
    </View>
  );
}

/** Gouden kopje in hoofdletters met een streepje ervoor. */
export function GoldCaption({ children }: { children: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 14, height: 1, backgroundColor: c.gold }} />
      <T size={11} w={600} color={c.gold} style={{ letterSpacing: 11 * 0.14, textTransform: 'uppercase' }}>{children}</T>
    </View>
  );
}

/** Ronde icoonknop van 44×44 (minimale aanraakgrootte). */
export function IconButton({ name, onPress, size = 22, color, children, label }: { name?: IconName; onPress?: () => void; size?: number; color?: string; children?: ReactNode; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={2} accessibilityLabel={label} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      {children ?? (name ? <Icon name={name} size={size} color={color} /> : null)}
    </Pressable>
  );
}

/** Pil-schakelaar (Categorie/Bron, Dag/Totaal, periodes). Actief = oppervlak met gouden haarlijn. */
export function Segmented<K extends string>({ items, value, onChange, stretch = true, weights = [600, 600], style }: {
  items: [K, string][]; value: K; onChange: (k: K) => void; stretch?: boolean;
  /** Letterdikte [actief, inactief]. */
  weights?: [600 | 700, 500 | 600]; style?: ViewStyle;
}) {
  const c = useColors();
  return (
    <View style={[{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.surface2 }, stretch && { flex: 1 }, style]}>
      {items.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={{ flex: stretch ? 1 : undefined, paddingHorizontal: stretch ? 0 : 12, paddingVertical: 7, borderRadius: 999, alignItems: 'center', backgroundColor: on ? c.surface : 'transparent', boxShadow: on ? c.goldRing : undefined }}
          >
            <T size={13} w={on ? weights[0] : weights[1]} color={on ? c.ink : c.muted}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Filterchip: actief = inkt-kleur gevuld. */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={{ height: 32, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.chip, borderWidth: 1, borderColor: on ? c.ink : c.line, backgroundColor: on ? c.ink : 'transparent' }}>
      <T size={13} w={600} color={on ? c.bg : c.ink}>{label}</T>
    </Pressable>
  );
}

/**
 * Knop van 52px: `primary` blauw verloop, `outline` gouden rand (Verkopen), `surface` neutraal.
 * Standaard deelt hij de ruimte in een rij (flex: 1); met `block` staat hij los op volle breedte.
 */
export function Button({ label, onPress, variant = 'primary', icon, style, block }: {
  label: string; onPress: () => void; variant?: 'primary' | 'outline' | 'surface'; icon?: IconName; style?: ViewStyle; block?: boolean;
}) {
  const c = useColors();
  const look: Record<typeof variant, [ViewStyle, string]> = {
    primary: [{ backgroundImage: c.btnBg, boxShadow: c.btnShadow }, c.onAccent],
    outline: [{ boxShadow: `inset 0 0 0 1px ${c.goldLine}` }, c.gold],
    surface: [{ backgroundColor: c.surface2 }, c.ink],
  };
  const [bg, ink] = look[variant];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { ...(block ? { alignSelf: 'stretch' as const } : { flex: 1 }), height: 52, borderRadius: radius.button, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] },
        bg,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={ink} /> : null}
      <T size={15} w={700} color={ink}>{label}</T>
    </Pressable>
  );
}

/** Ticker-vak van 40×40 in de kleur van de klasse. */
export function TickerBox({ tk, bg, fg }: { tk: string; bg: string; fg: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <T size={10} w={700} color={fg} style={{ letterSpacing: 0.2 }}>{tk}</T>
    </View>
  );
}
