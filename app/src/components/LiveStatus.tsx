// Melding als de server niet bereikbaar is, plus begroeting en datum voor echte data.
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useColors } from '../state/app';
import { useData } from '../state/data';
import { Icon } from './Icon';
import { T } from './T';

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
}

/** "24 oktober 2026" */
export const longDate = (d = new Date()) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export function ErrorBanner() {
  const c = useColors();
  const { live, error, refresh, asOf } = useData();
  if (!live || !error) return null;
  return (
    <Pressable
      onPress={() => router.push('/server')}
      style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: c.surface, boxShadow: `inset 0 0 0 1px ${c.neg}`, flexDirection: 'row', gap: 12, alignItems: 'center' }}
    >
      <Icon name="sync" size={20} color={c.neg} />
      <View style={{ flex: 1 }}>
        <T size={13} w={600}>{asOf ? 'Bijwerken mislukt, je ziet de laatste stand' : 'Kan je server niet bereiken'}</T>
        <T size={12} color={c.muted} style={{ marginTop: 2 }}>{error}</T>
      </View>
      <T size={13} w={600} color={c.accent} onPress={() => refresh(true)} suppressHighlighting>Opnieuw</T>
    </Pressable>
  );
}
