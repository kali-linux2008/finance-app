// Meldingen: de app haalt ze zelf bij je server op en toont ze als melding op de telefoon.
// Geen Google, geen Expo-account, geen andere app. In de eigen Meridian-app kijkt hij ook
// op de achtergrond (Android bepaalt wanneer, ongeveer elk kwartier); in Expo Go alleen als de app open is.
import * as BackgroundTask from 'expo-background-task';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getEvents, type ServerConfig, type ServerEvent } from './api';
import { getItem, KEYS, setItem } from './storage';

export const TASK = 'meridian-meldingen';
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const native = Platform.OS !== 'web';

// Pas laden als het nodig is: zo blijft de webversie (en Expo Go) gewoon werken.
const notifications = () => import('expo-notifications');

async function storedServer(): Promise<ServerConfig | null> {
  const raw = await getItem(KEYS.server);
  return raw ? (JSON.parse(raw) as ServerConfig) : null;
}

/** Welke meldingen zijn nieuw sinds de vorige keer? De eerste keer onthouden we alleen waar we zijn. */
export function newSince(events: ServerEvent[], last: number | null): ServerEvent[] {
  if (last == null) return [];
  return events.filter((e) => e.id > last);
}

/** Nieuwe meldingen ophalen en (als meldingen aan staan) op de telefoon tonen. */
export async function checkEvents(cfg?: ServerConfig | null): Promise<ServerEvent[]> {
  const server = cfg ?? (await storedServer());
  if (!server) return [];
  const raw = await getItem(KEYS.lastEvent);
  const last = raw ? Number(raw) : null;
  const events = await getEvents(server, last ?? 0);
  if (!events.length) return [];
  await setItem(KEYS.lastEvent, String(events[events.length - 1].id));
  const fresh = newSince(events, last);
  if (native && fresh.length && (await getItem(KEYS.notify)) === 'on') {
    const N = await notifications();
    for (const e of fresh) {
      await N.scheduleNotificationAsync({ content: { title: e.title, body: e.body }, trigger: null });
    }
  }
  return fresh;
}

// De achtergrondtaak moet bij het opstarten bekend zijn, ook als de app zelf niet geopend wordt.
if (native) {
  TaskManager.defineTask(TASK, async () => {
    try {
      await checkEvents();
      // Widgets ook bijwerken (Android doet dat zelf maar elk half uur).
      await (await import('../widgets/update')).refreshWidgets(null, true).catch(() => {});
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Meldingen ook tonen als de app open is. */
export async function configureNotifications() {
  if (!native) return;
  const N = await notifications();
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function enableNotifications(): Promise<void> {
  if (!native) throw new Error('Meldingen werken alleen op je telefoon.');
  const N = await notifications();
  // Op het vergrendelscherm zonder inhoud: daar horen geen bedragen te staan.
  await N.setNotificationChannelAsync('default', {
    name: 'Meridian', importance: N.AndroidImportance.HIGH, lightColor: '#D9BC82',
    lockscreenVisibility: N.AndroidNotificationVisibility.PRIVATE,
  });
  let { status } = await N.getPermissionsAsync();
  if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Geen toestemming. Zet meldingen aan bij Android-instellingen → Apps → Meridian.');
  await setItem(KEYS.notify, 'on');
  if (!inExpoGo) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
}

export async function disableNotifications(): Promise<void> {
  await setItem(KEYS.notify, 'off');
  if (native && !inExpoGo && (await TaskManager.isTaskRegisteredAsync(TASK))) await BackgroundTask.unregisterTaskAsync(TASK);
}
