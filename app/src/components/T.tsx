// Tekst met de juiste lettertypen: Manrope voor UI, Source Serif 4 voor bedragen en koppen.
import { Text, type TextProps, type TextStyle } from 'react-native';
import { font } from '../theme/tokens';
import { useColors } from '../state/app';

type Weight = 400 | 500 | 600 | 700;
const SANS: Record<Weight, string> = { 400: font.sans, 500: font.sansMedium, 600: font.sansSemi, 700: font.sansBold };

type Props = TextProps & {
  size?: number;
  w?: Weight;
  serif?: boolean;
  color?: string;
  /** Cijfers even breed (tabular-nums), voor bedragen. */
  num?: boolean;
  lh?: number;
  style?: TextStyle | TextStyle[];
};

export function T({ size = 15, w = 400, serif, color, num, lh, style, ...rest }: Props) {
  const c = useColors();
  return (
    <Text
      allowFontScaling={false}
      {...rest}
      style={[
        {
          fontFamily: serif ? (w >= 500 ? font.serifMedium : font.serif) : SANS[w],
          fontSize: size,
          color: color ?? c.ink,
          lineHeight: lh ? size * lh : undefined,
          fontVariant: num ? ['tabular-nums'] : undefined,
        },
        style as TextStyle,
      ]}
    />
  );
}
