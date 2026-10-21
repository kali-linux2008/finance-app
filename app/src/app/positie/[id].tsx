import { useLocalSearchParams } from 'expo-router';
import { Detail } from '../../screens/Detail';

export default function PositionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Detail id={id} />;
}
