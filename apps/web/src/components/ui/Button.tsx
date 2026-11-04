import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';

export type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-label transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus data-[focus-visible]:outline-solid';
const variants: Record<Variant, string> = {
  primary: 'bg-orange text-on-orange hover:bg-orange-strong data-[pressed]:bg-orange-strong',
  secondary:
    'border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken data-[pressed]:bg-surface-sunken',
  danger: 'bg-red text-on-red hover:brightness-95 data-[pressed]:brightness-90',
  ghost: 'text-ink hover:bg-surface-sunken data-[pressed]:bg-surface-sunken',
};

export function buttonClass(variant: Variant = 'secondary', extra = '') {
  return `${base} ${variants[variant]} ${extra}`;
}

export function Button({
  variant = 'secondary',
  className,
  ...props
}: AriaButtonProps & { variant?: Variant; className?: string }) {
  return <AriaButton {...props} className={buttonClass(variant, className)} />;
}

/** A router link styled as a button. */
export function LinkButton({
  variant = 'secondary',
  className,
  children,
  ...props
}: LinkProps & { variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link {...props} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}
