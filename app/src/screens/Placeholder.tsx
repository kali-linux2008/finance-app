// Tijdelijk scherm voor tabs die in een volgende stap worden gebouwd.
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { T } from '../components/T';
import { Card } from '../components/ui';
import { useColors } from '../state/app';

export function Placeholder({ title, text }: { title: string; text: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <T serif size={30} style={{ paddingTop: 16, paddingHorizontal: 24 }}>{title}</T>
      <Card style={{ marginTop: 14, marginHorizontal: 16, padding: 20, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Icon name="construction" size={22} color={c.gold} />
        <T size={14} lh={1.5} color={c.muted} style={{ flex: 1 }}>{text}</T>
      </Card>
    </View>
  );
}
