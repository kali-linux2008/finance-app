// De widgets op je startscherm (ontwerp 5d). Android tekent ze zelf; daarom alleen de bouwstenen
// van react-native-android-widget (geen gewone React Native-onderdelen).
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg, sparkSvg, type WidgetView } from './model';

export const NAMES = ['MeridianGroot', 'MeridianTotaal', 'MeridianDoel', 'MeridianSmal'] as const;
export type WidgetName = (typeof NAMES)[number];

const SERIF = 'SourceSerif4_400Regular';
const SEMI = 'Manrope_600SemiBold';
const BOLD = 'Manrope_700Bold';
const INK = '#F6E7C4';
const GOLD = '#D9BC82';
const MUTED = '#C4CCEF';
const POS = '#8FE0AE';
const NEG = '#F2A08E';

// Het blauwe verloop van de hero, met een dunne gouden rand.
const card = {
  backgroundGradient: { from: '#4361D6', to: '#141F5A', orientation: 'TR_BL' },
  borderWidth: 1,
  borderColor: 'rgba(217, 188, 130, 0.45)',
} as const;

function Caption({ text }: { text: string }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <FlexWidget style={{ width: 14, height: 1, backgroundColor: GOLD, marginRight: 8 }} />
      <TextWidget text={text.toUpperCase()} style={{ fontSize: 10, fontFamily: BOLD, color: GOLD, letterSpacing: 0.14 }} />
    </FlexWidget>
  );
}

/** 4×2: belegd, dagverandering, grafiek van vandaag en de drie grootste bewegers. */
function Big({ v, w }: { v: WidgetView; w: number }) {
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...card, height: 'match_parent', width: 'match_parent', borderRadius: 22, padding: 16, flexDirection: 'column' }}>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <Caption text="Belegd" />
        <TextWidget text={v.time} style={{ fontSize: 10, fontFamily: SEMI, color: MUTED }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent', marginTop: 8, flex: 1 }}>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={v.total} style={{ fontSize: 26, fontFamily: SERIF, color: INK }} />
          <TextWidget text={v.deltaLine} style={{ fontSize: 11, fontFamily: SEMI, color: v.up ? POS : NEG, marginTop: 2 }} />
        </FlexWidget>
        <SvgWidget svg={sparkSvg(v.spark, Math.round(w * 0.32), 32)} style={{ width: Math.round(w * 0.32), height: 32 }} />
      </FlexWidget>
      <FlexWidget style={{ height: 1, width: 'match_parent', backgroundColor: 'rgba(255, 255, 255, 0.14)', marginVertical: 10 }} />
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        {v.movers.map((m) => (
          <FlexWidget key={m.tk} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextWidget text={m.tk} style={{ fontSize: 11, fontFamily: BOLD, color: '#FFFFFF', marginRight: 4 }} />
            <TextWidget text={m.pct} style={{ fontSize: 11, fontFamily: SEMI, color: m.up ? POS : NEG }} />
          </FlexWidget>
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

/** 2×2: totaal met grafiek. */
function Total({ v, w }: { v: WidgetView; w: number }) {
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...card, height: 'match_parent', width: 'match_parent', borderRadius: 22, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text="M" style={{ fontSize: 16, fontFamily: SERIF, color: INK }} />
        <TextWidget text="1D" style={{ fontSize: 10, fontFamily: SEMI, color: MUTED }} />
      </FlexWidget>
      <SvgWidget svg={sparkSvg(v.spark, Math.max(60, w - 28), 30)} style={{ width: Math.max(60, w - 28), height: 30 }} />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text={v.total} style={{ fontSize: 22, fontFamily: SERIF, color: INK }} />
        <TextWidget text={v.pctText} style={{ fontSize: 11, fontFamily: SEMI, color: v.up ? POS : NEG, marginTop: 2 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** 2×2: voortgang naar het FIRE-doel. */
function Goal({ v }: { v: WidgetView }) {
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...card, height: 'match_parent', width: 'match_parent', borderRadius: 22, padding: 12, flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
      <FlexWidget style={{ width: 'match_parent' }}>
        <Caption text="FIRE-doel" />
      </FlexWidget>
      <OverlapWidget style={{ width: 72, height: 72 }}>
        <SvgWidget svg={ringSvg(v.fire.pct, 72)} style={{ width: 72, height: 72 }} />
        <FlexWidget style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget text={`${Math.round(v.fire.pct)}%`} style={{ fontSize: 18, fontFamily: SERIF, color: INK }} />
        </FlexWidget>
      </OverlapWidget>
      <TextWidget text={v.fire.label} maxLines={2} style={{ fontSize: 10, fontFamily: SEMI, color: MUTED, textAlign: 'center' }} />
    </FlexWidget>
  );
}

/** 4×1: smal, voor naast andere widgets. */
function Slim({ v, w }: { v: WidgetView; w: number }) {
  const sw = Math.round(Math.min(110, w * 0.28));
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...card, height: 'match_parent', width: 'match_parent', borderRadius: 28, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text="M" style={{ fontSize: 16, fontFamily: SERIF, color: INK, marginRight: 14 }} />
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={v.total} style={{ fontSize: 18, fontFamily: SERIF, color: INK }} />
          <TextWidget text={`Belegd · ${v.time}`} style={{ fontSize: 10, fontFamily: SEMI, color: MUTED }} />
        </FlexWidget>
      </FlexWidget>
      <SvgWidget svg={sparkSvg(v.spark, sw, 22)} style={{ width: sw, height: 22 }} />
      <FlexWidget style={{ backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
        <TextWidget text={v.pctText} style={{ fontSize: 11, fontFamily: BOLD, color: v.up ? POS : NEG }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Als de app (nog) niet gekoppeld is of de server niet bereikbaar was. */
function Message({ text }: { text: string }) {
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...card, height: 'match_parent', width: 'match_parent', borderRadius: 22, padding: 14, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <TextWidget text="Meridian" style={{ fontSize: 16, fontFamily: SERIF, color: INK }} />
      <TextWidget text={text} maxLines={2} style={{ fontSize: 11, fontFamily: SEMI, color: MUTED, textAlign: 'center', marginTop: 4 }} />
    </FlexWidget>
  );
}

export function renderWidget(name: string, v: WidgetView | null, width: number, message = 'Open de app om te koppelen') {
  if (!v) return <Message text={message} />;
  switch (name) {
    case 'MeridianGroot': return <Big v={v} w={width} />;
    case 'MeridianDoel': return <Goal v={v} />;
    case 'MeridianSmal': return <Slim v={v} w={width} />;
    default: return <Total v={v} w={width} />;
  }
}
