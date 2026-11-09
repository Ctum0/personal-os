import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hairline' | 'ghost';
}

export function Card({
  className = '',
  variant = 'default',
  children,
  ...props
}: CardProps) {
  const variantStyles = {
    default: 'rounded-xl border border-white/[0.07] bg-zinc-900/40 text-zinc-100 shadow-xs',
    hairline: 'border-b border-white/[0.06] bg-transparent text-zinc-100',
    ghost: 'bg-transparent text-zinc-100',
  }[variant];

  return (
    <div
      className={`${variantStyles} transition-colors ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col space-y-1 p-4 sm:p-5 border-b border-white/[0.05] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-sm font-semibold tracking-tight text-zinc-100 ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-xs text-zinc-400 leading-relaxed ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-4 sm:p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center p-4 sm:p-5 pt-0 border-t border-white/[0.05] mt-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
