// Het Meridian-icoon (blauwe tegel met gouden M) als onderdeel, voor het opstartscherm.
import { View } from 'react-native';
import { T } from './T';

const BG = 'radial-gradient(130% 90% at 100% 0%, #4361D6 0%, #2840A8 42%, #141F5A 100%)';
const EDGE = 'linear-gradient(135deg, rgba(232,207,154,0.85), rgba(217,188,130,0.1) 38%, rgba(217,188,130,0.08) 62%, rgba(232,207,154,0.6))';

/** Maten uit het ontwerp (tegel van 96 px), geschaald naar `size`. */
export function BrandMark({ size = 112 }: { size?: number }) {
  const k = size / 96;
  return (
    <View style={{ width: size, height: size, padding: k, borderRadius: 26.88 * k, backgroundImage: EDGE, boxShadow: `0 ${19.2 * k}px ${38.4 * k}px ${-19.2 * k}px rgba(30,50,170,0.9)` }}>
      <View style={{ flex: 1, borderRadius: 25.88 * k, backgroundImage: BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 6.72 * k, left: 6.72 * k, right: 6.72 * k, bottom: 6.72 * k, borderWidth: 1, borderColor: 'rgba(217,188,130,0.22)', borderRadius: 20.16 * k }} />
        <T serif size={51.84 * k} lh={1} color="#F6E7C4" style={{ marginTop: -3.84 * k }}>M</T>
        <View style={{ position: 'absolute', bottom: 19.2 * k, left: '50%', width: 21.12 * k, marginLeft: -10.56 * k, height: 1.5, backgroundColor: '#D9BC82' }} />
      </View>
    </View>
  );
}
