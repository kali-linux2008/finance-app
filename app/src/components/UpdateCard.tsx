// Nieuwe app-versie van je server: een balk op het overzicht en een regel onder Meer.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { canUpdate, downloadAndInstall, installedVersion, versionLabel } from '../lib/update';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { Icon } from './Icon';
import { T } from './T';

function useInstall() {
  const { server, update } = useData();
  const { say } = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const start = async () => {
    if (!server || progress !== null) return;
    setProgress(0);
    try {
      await downloadAndInstall(server, setProgress);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setProgress(null);
    }
  };
  const action = progress === null ? 'Updaten' : progress >= 1 ? 'Installeren…' : `${Math.round(progress * 100)}%`;
  return { update, start, action, busy: progress !== null };
}

/** Balk bovenaan het overzicht, alleen als er een nieuwere versie klaarstaat. */
export function UpdateBanner() {
  const c = useColors();
  const { update, start, action } = useInstall();
  if (!update) return null;
  return (
    <Pressable
      onPress={start}
      style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: c.surface, boxShadow: `inset 0 0 0 1px ${c.gold}`, flexDirection: 'row', gap: 12, alignItems: 'center' }}
    >
      <Icon name="system_update" size={20} color={c.gold} />
      <View style={{ flex: 1 }}>
        <T size={13} w={600}>Nieuwe app-versie klaar</T>
        <T size={12} color={c.muted} style={{ marginTop: 2 }}>Versie van {versionLabel(update.versionCode)}</T>
      </View>
      <T size={13} w={600} color={c.accent}>{action}</T>
    </Pressable>
  );
}

/** Regel onder Meer: welke versie je hebt en of er een nieuwere is. */
export function UpdateRow() {
  const c = useColors();
  const { server } = useData();
  const { update, start, action, busy } = useInstall();
  const mine = versionLabel(installedVersion());
  const sub = !canUpdate
    ? 'Alleen in de eigen Meridian-app (niet in Expo Go)'
    : update
      ? `Nieuw: versie van ${versionLabel(update.versionCode)} · jij hebt ${mine}`
      : `Versie van ${mine}${server ? ' · dit is de nieuwste' : ''}`;
  return (
    <Pressable onPress={update ? start : undefined} disabled={!update || busy} style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
      <Icon name="system_update" size={22} color={update ? c.gold : c.muted} />
      <View style={{ flex: 1 }}>
        <T size={15} w={600}>App-versie</T>
        <T size={12} color={c.muted} style={{ marginTop: 2 }}>{sub}</T>
      </View>
      {update ? <T size={13} w={600} color={c.accent}>{action}</T> : null}
    </Pressable>
  );
}
