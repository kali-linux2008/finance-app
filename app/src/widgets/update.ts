// Widgets bijwerken vanuit de app (na het verversen, of als je privacymodus omzet).
// Alleen in de eigen Meridian-app: Expo Go en de webversie hebben geen widgets.
import { Platform } from 'react-native';
import { inExpoGo } from '../lib/alerts';
import type { ServerConfig } from '../lib/api';

export const widgetsSupported = Platform.OS === 'android' && !inExpoGo;
const EVERY = 5 * 60_000;
let last = 0;

export async function refreshWidgets(cfg?: ServerConfig | null, force = false): Promise<void> {
  if (!widgetsSupported || (!force && Date.now() - last < EVERY)) return;
  last = Date.now();
  // Pas hier laden: de bibliotheek bestaat alleen in de eigen app.
  const { requestWidgetUpdate } = await import('react-native-android-widget');
  const { NAMES, renderWidget } = await import('./Widgets');
  const { loadWidgetData } = await import('./data');
  const res = await loadWidgetData(cfg);
  for (const name of NAMES) {
    await requestWidgetUpdate({ widgetName: name, renderWidget: (info) => renderWidget(name, res.view, info.width, res.message) });
  }
}
