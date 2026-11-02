import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva('inline-flex rounded-full px-2 text-xs', {
  variants: { tone: { neutral: 'bg-muted', success: 'bg-brand-50 text-brand-700', warning: 'bg-amber-100 text-amber-800', danger: 'bg-red-100 text-red-700' } },
});
export interface BadgeProps extends VariantProps<typeof badgeVariants> { children: React.ReactNode }
export function Badge({ tone, children }: BadgeProps) {
  return <span className={badgeVariants({ tone })}>{children}</span>;
}
