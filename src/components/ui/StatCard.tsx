import React from 'react';

export interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  valueColor?: string;
}

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  badge,
  icon,
  className = '',
  valueColor,
}: StatCardProps) {
  return (
    <div
      className={`rounded-xl border border-white/[0.07] bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700/60 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        {icon ? (
          <span className="text-zinc-500">{icon}</span>
        ) : (
          badge
        )}
      </div>

      <div className="mt-3">
        <div
          className={`text-2xl font-semibold tracking-tight font-mono tabular-nums ${
            valueColor || 'text-zinc-100'
          }`}
        >
          {value}
        </div>

        {(subtitle || trend) && (
          <div className="flex items-center gap-2 mt-1">
            {trend && (
              <span
                className={`text-[11px] font-medium inline-flex items-center gap-0.5 ${
                  trend.direction === 'up'
                    ? 'text-emerald-400'
                    : trend.direction === 'down'
                    ? 'text-rose-400'
                    : 'text-zinc-400'
                }`}
              >
                {trend.direction === 'up' && '↑'}
                {trend.direction === 'down' && '↓'}
                {trend.value}
              </span>
            )}
            {subtitle && (
              <span className="text-[11px] text-zinc-500 leading-none">{subtitle}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
