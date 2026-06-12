import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  fullScreen = false,
  size = 'md',
  className,
}) => {
  const spinnerElement = (
    <div
      className={cn(
        'animate-spin rounded-full border-3 border-[#1D9E75] border-t-transparent',
        {
          'h-5 w-5': size === 'sm',
          'h-8 w-8': size === 'md',
          'h-12 w-12': size === 'lg',
        },
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f7f7f5]/95 gap-3 select-none">
        {spinnerElement}
        <span className="text-xs font-semibold text-[#64748b] tracking-wider uppercase">
          Menghubungkan ke Sistem...
        </span>
      </div>
    );
  }

  return spinnerElement;
};
