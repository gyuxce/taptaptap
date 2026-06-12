import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  tone = 'neutral',
  icon,
  className,
}) => {
  return (
    <div
      className={cn(
        'bg-white border border-[#e5e3db] rounded-2xl p-6 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-gray-300 select-none',
        className
      )}
    >
      <div className="flex flex-col gap-1 text-left flex-1 min-w-0">
        <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider truncate">
          {label}
        </span>
        <span className="text-2xl font-black text-[#1e293b] mt-0.5 truncate">
          {value}
        </span>
        {subtext && (
          <span className="text-[10px] text-[#64748b] font-semibold flex items-center gap-0.5 mt-1 truncate">
            {subtext}
          </span>
        )}
      </div>
      {icon && (
        <div
          className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-colors duration-200 ml-4',
            {
              'bg-[#E1F5EE] text-[#1D9E75] border-[#1D9E75]/10': tone === 'green',
              'bg-sky-50 text-sky-600 border-sky-100': tone === 'blue',
              'bg-amber-50 text-amber-600 border-amber-100': tone === 'amber',
              'bg-red-50 text-red-600 border-red-100': tone === 'red',
              'bg-gray-50 text-gray-500 border-gray-150': tone === 'neutral',
            }
          )}
        >
          {icon}
        </div>
      )}
    </div>
  );
};
