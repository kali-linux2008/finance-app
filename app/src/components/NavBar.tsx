// Zwevende navigatiebalk met vier tabs en de ronde Handelen-knop.
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useColors, type TabName } from '../state/app';
import { Icon, type IconName } from './Icon';
import { T } from './T';

const TABS: [TabName, IconName, string][] = [
  ['overview', 'home', 'Overzicht'],
  ['portfolio', 'donut_small', 'Portefeuille'],
  ['goals', 'flag', 'Doelen'],
  ['activity', 'receipt_long', 'Activiteit'],
];

export function NavBar() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tab, goTab, say } = useApp();
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16 + insets.bottom, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <View style={{ flex: 1, height: 64, borderRadius: 32, backgroundColor: c.nav, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.22)' }}>
        {TABS.map(([id, icon, label]) =>
          id === tab ? (
            <Pressable key={id} onPress={() => goTab(id)} style={{ height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: c.navOn, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={icon} size={20} fill color={c.navOnInk} />
              <T size={13} w={700} color={c.navOnInk}>{label}</T>
            </Pressable>
          ) : (
            <Pressable key={id} onPress={() => goTab(id)} accessibilityLabel={label} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={22} color={c.navIcon} />
            </Pressable>
          ),
        )}
      </View>
      <Pressable
        onPress={() => say('Handelen komt in een volgende stap')}
        accessibilityLabel="Handelen"
        style={{ width: 64, height: 64, borderRadius: 32, backgroundImage: c.btnBg, boxShadow: `${c.btnShadow}, 0 8px 24px rgba(59,91,219,0.35)`, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="swap_vert" size={26} color={c.onAccent} />
      </Pressable>
    </View>
  );
}
