import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';

export default function Today() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="p-4 gap-3">
        <Text className="text-2xl font-semibold text-foreground">Today</Text>
        <Text className="text-muted-foreground">No habits yet.</Text>
        <Button label="Add a habit" onPress={() => {}} />
      </View>
    </SafeAreaView>
  );
}
