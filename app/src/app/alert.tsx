import { useLocalSearchParams } from 'expo-router';
import { PriceAlert } from '../screens/PriceAlert';

export default function AlertScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <PriceAlert alertKey={key} />;
}
