// De vier hoofdtabs met de zwevende navigatiebalk. Een tab-wissel speelt de inschuif-animatie af.
import { View } from 'react-native';
import { NavBar } from '../components/NavBar';
import { ScreenIn } from '../components/motion';
import { useApp, useColors } from '../state/app';
import { Overview } from './Overview';
import { Placeholder } from './Placeholder';
import { Portfolio } from './Portfolio';

export function Tabs() {
  const c = useColors();
  const { tab } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenIn key={tab}>
        {tab === 'overview' ? <Overview /> : null}
        {tab === 'portfolio' ? <Portfolio /> : null}
        {tab === 'goals' ? <Placeholder title="Doelen" text="FIRE-projectie met schuifregelaars en de noodbuffer komen in een volgende stap." /> : null}
        {tab === 'activity' ? <Placeholder title="Activiteit" text="Alle transacties per maand, met filters, komen in een volgende stap." /> : null}
      </ScreenIn>
      <NavBar />
    </View>
  );
}
