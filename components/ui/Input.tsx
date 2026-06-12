import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, hint, icon, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
            {label}
          </label>
        )}
        
        <div className="relative w-full flex items-center">
          {icon && (
            <div className="absolute left-3.5 text-gray-400 pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}
          
          <input
            ref={ref}
            type={type}
            className={cn(
              'w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#1D9E75] focus:ring-2 focus:ring-[#E1F5EE] transition-all duration-200 placeholder:text-gray-400',
              icon ? 'pl-10' : '',
              error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : '',
              className
            )}
            {...props}
          />
        </div>
        
        {error && <span className="text-xs text-red-500 font-semibold">{error}</span>}
        {!error && hint && <span className="text-xs text-[#64748b]">{hint}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
