import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  ...props
}) => {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]',
        fullWidth ? 'w-full' : 'w-auto',
        {
          // Variants
          'bg-[#1D9E75] text-white hover:bg-[#168260] focus:ring-[#1D9E75] shadow-xs': variant === 'primary',
          'bg-[#E1F5EE] text-[#1D9E75] hover:bg-[#cbeedf] focus:ring-[#1D9E75]': variant === 'secondary',
          'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-xs': variant === 'danger',
          'text-[#64748b] hover:text-[#1e293b] hover:bg-[#f1efe9] focus:ring-gray-200': variant === 'ghost',
          
          // Sizes
          'px-3 py-1.5 text-xs md:text-sm': size === 'sm',
          'px-4.5 py-2.5 text-sm md:text-base': size === 'md',
          'px-6 py-3.5 text-base md:text-lg': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Mohon tunggu...
        </>
      ) : (
        children
      )}
    </button>
  );
};
