// Pushmeldingen: toestemming vragen en het adres (Expo push-token) van deze telefoon ophalen.
// Werkt alleen in de eigen Meridian-app (APK), niet in Expo Go: daar heeft Expo push op Android uitgezet.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

export class PushError extends Error {}

/** Meldingen ook tonen als de app open is. */
export function configureNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function getPushToken(): Promise<string> {
  if (Platform.OS === 'web') throw new PushError('Meldingen werken alleen op je telefoon.');
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    throw new PushError('Meldingen werken niet in Expo Go. Installeer de Meridian-app (zie docs/MELDINGEN.md).');
  }
  if (!Device.isDevice) throw new PushError('Meldingen werken alleen op een echte telefoon.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new PushError('Deze app is nog niet gekoppeld aan Expo (eas init ontbreekt).');

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Meridian', importance: AndroidImportance.HIGH, lightColor: '#D9BC82',
  });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new PushError('Geen toestemming voor meldingen. Zet ze aan bij Android-instellingen → Apps → Meridian.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
