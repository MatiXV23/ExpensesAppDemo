import * as SwitchPrimitive from '@radix-ui/react-switch';
export function Switch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (value: boolean) => void; label: string }) { return <SwitchPrimitive.Root className="switch" checked={checked} onCheckedChange={onCheckedChange} aria-label={label}><SwitchPrimitive.Thumb className="switch-thumb"/></SwitchPrimitive.Root>; }
