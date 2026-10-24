// Startpunt: lettertypen laden, app-status, en de schermstapel.
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { SourceSerif4_400Regular, SourceSerif4_500Medium } from '@expo-google-fonts/source-serif-4';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toast } from '../components/Toast';
import { TradeSheet } from '../components/TradeSheet';
import { configureNotifications } from '../lib/alerts';
import { Loading } from '../screens/Loading';
import { LockScreen } from '../screens/LockScreen';
import { AppProvider, useApp } from '../state/app';
import { DataProvider } from '../state/data';
import { LockProvider, useLock } from '../state/lock';
import { TradeProvider } from '../state/trade';

SplashScreen.preventAutoHideAsync();
configureNotifications().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold,
    SourceSerif4_400Regular, SourceSerif4_500Medium,
  });
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <LockProvider>
            <DataProvider>
              <TradeProvider>
                <Shell />
              </TradeProvider>
            </DataProvider>
          </LockProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { theme, colors } = useApp();
  const { phase } = useLock();
  const locked = phase === 'setup' || phase === 'locked';
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={locked || theme === 'dark' ? 'light' : 'dark'} />
      {/* Zolang de app vergrendeld is, worden de schermen met bedragen niet eens getekend. */}
      {locked ? <LockScreen /> : null}
      {phase === 'loading' ? <Loading /> : null}
      {phase === 'open' ? (
        // Eigen inschuif-animatie per scherm, daarom geen animatie van de stapel zelf.
        <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: colors.bg } }} />
      ) : null}
      {phase === 'open' ? <TradeSheet /> : null}
      <Toast />
    </View>
  );
}
