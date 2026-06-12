import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'Regular' | 'VIP' | 'Family' | 'Group' | 'success' | 'active' | 'pending' | 'error' | 'inactive' | 'neutral';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className,
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all duration-150 select-none',
        {
          // Ticket type categorizations
          'bg-gray-100 text-gray-700 border-gray-200': variant === 'Regular',
          'bg-amber-50 text-amber-800 border-amber-200': variant === 'VIP',
          'bg-sky-50 text-sky-700 border-sky-200': variant === 'Family',
          'bg-purple-50 text-purple-800 border-purple-200': variant === 'Group',
          
          // Operational statuses
          'bg-green-50 text-green-700 border-green-200': variant === 'success' || variant === 'active',
          'bg-amber-50 text-amber-700 border-amber-200 animate-pulse': variant === 'pending',
          'bg-red-50 text-red-700 border-red-200': variant === 'error' || variant === 'inactive',
          
          // Neutral default
          'bg-gray-50 text-gray-600 border-gray-200': variant === 'neutral',
        },
        className
      )}
    >
      {children}
    </span>
  );
};
