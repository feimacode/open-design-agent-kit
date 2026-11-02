import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('inline-flex items-center justify-center rounded-md text-sm font-medium', {
  variants: {
    variant: { default: 'bg-primary text-primary-foreground', outline: 'border border-border', ghost: 'hover:bg-muted', destructive: 'bg-destructive text-white' },
    size: { sm: 'h-8 px-3', default: 'h-10 px-4', lg: 'h-11 px-6' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
