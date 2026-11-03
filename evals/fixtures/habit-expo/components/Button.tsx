import { Pressable, Text } from 'react-native';

type Props = { label: string; onPress: () => void; disabled?: boolean };

export function Button({ label, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className="min-h-12 items-center justify-center rounded-lg bg-primary px-4 active:opacity-80 disabled:opacity-40"
    >
      <Text className="font-medium text-primary-foreground">{label}</Text>
    </Pressable>
  );
}
