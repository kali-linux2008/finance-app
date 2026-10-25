// App-updates van je eigen server: geen Play Store of EAS. De server biedt de APK aan die
// build/android/bouw.sh maakte; de app downloadt hem en opent het Android-installatiescherm.
// Android installeert hem alleen als hij met dezelfde sleutel is ondertekend als deze app.
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { inExpoGo } from './alerts';
import type { AppBuild, ServerConfig } from './api';

/** In Expo Go of de webversie is er niets te updaten. */
export const canUpdate = Platform.OS === 'android' && !inExpoGo;

/** Versienummer van deze app (minuten sinds 1970 op het moment van bouwen), of null. */
export function installedVersion(raw: string | null = Application.nativeBuildVersion): number | null {
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function isNewer(build: AppBuild | null, installed: number | null): build is AppBuild {
  return !!build && installed !== null && build.versionCode > installed;
}

/** "25-10 14:30" uit een versienummer; oude builds zonder datum heten "eerste versie". */
export function versionLabel(code: number | null): string {
  if (!code) return 'onbekend';
  if (code < 1_000_000) return 'eerste versie';
  const d = new Date(code * 60_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Downloadt de nieuwe APK en opent het installatiescherm van Android. */
export async function downloadAndInstall(cfg: ServerConfig, onProgress: (fraction: number) => void): Promise<void> {
  // Pas laden als het nodig is: zo blijven de webversie en de tests werken.
  const { File, Paths } = await import('expo-file-system');
  const { getContentUriAsync } = await import('expo-file-system/legacy');
  const IntentLauncher = await import('expo-intent-launcher');

  const dest = new File(Paths.cache, 'meridian-update.apk');
  let file: InstanceType<typeof File>;
  try {
    file = await File.downloadFileAsync(`${cfg.url}/api/app/apk`, dest, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && onProgress(bytesWritten / totalBytes),
    });
  } catch {
    throw new Error('Downloaden mislukt. Is de server bereikbaar en staat er een nieuwe versie klaar?');
  }
  onProgress(1);
  const uri = await getContentUriAsync(file.uri);
  // FLAG_GRANT_READ_URI_PERMISSION (1): het installatiescherm mag het bestand lezen.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}
