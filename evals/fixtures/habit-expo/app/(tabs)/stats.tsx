import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Stats() {
  return (
    <SafeAreaView className="flex-1 bg-background p-4">
      <Text className="text-2xl font-semibold text-foreground">Stats</Text>
    </SafeAreaView>
  );
}
