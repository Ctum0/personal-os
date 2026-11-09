import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'indigo' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({
  className = '',
  variant = 'default',
  size = 'sm',
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const baseStyles =
    'inline-flex items-center gap-1.5 font-medium rounded-md select-none transition-colors';

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 tracking-tight',
    md: 'text-xs px-2.5 py-0.5 tracking-tight',
  }[size];

  const variantStyles = {
    default:
      'bg-zinc-900 text-zinc-300 border border-zinc-800',
    indigo:
      'bg-zinc-900 text-zinc-200 border border-zinc-700',
    success:
      'bg-zinc-900/90 text-emerald-400 border border-emerald-900/50',
    warning:
      'bg-zinc-900/90 text-amber-300 border border-amber-900/50',
    danger:
      'bg-zinc-900/90 text-rose-300 border border-rose-900/50',
    outline:
      'bg-transparent text-zinc-400 border border-zinc-800',
  }[variant];

  const dotColors = {
    default: 'bg-zinc-400',
    indigo: 'bg-zinc-300',
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    danger: 'bg-rose-400',
    outline: 'bg-zinc-500',
  }[variant];

  return (
    <span
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors}`} />}
      {children}
    </span>
  );
}
