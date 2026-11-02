import * as SwitchPrimitive from '@radix-ui/react-switch';

type SwitchProps = { checked: boolean; onCheckedChange: (v: boolean) => void; size: 'sm' | 'md' };
export function Switch({ checked, onCheckedChange, size }: SwitchProps) {
  return <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} data-size={size} />;
}
