// Material Symbols Outlined als SVG; `fill` geeft de gevulde variant (actieve tab).
import Svg, { Path } from 'react-native-svg';
import { ICON_PATHS, type IconName } from './iconPaths';
import { useColors } from '../state/app';

export type { IconName };

export function Icon({ name, size = 22, color, fill }: { name: IconName; size?: number; color?: string; fill?: boolean }) {
  const c = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d={ICON_PATHS[name][fill ? 1 : 0]} fill={color ?? c.ink} />
    </Svg>
  );
}
