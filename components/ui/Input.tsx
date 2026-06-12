import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, hint, icon, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';

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
            type={isPassword && showPassword ? 'text' : type}
            className={cn(
              'w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2] focus:ring-2 focus:ring-[#E8F6FD] transition-all duration-200 placeholder:text-gray-400',
              icon ? 'pl-10' : '',
              isPassword ? 'pr-11' : '',
              error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : '',
              className
            )}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer flex items-center justify-center"
            >
              {showPassword ? (
                <EyeOff className="h-4.5 w-4.5" />
              ) : (
                <Eye className="h-4.5 w-4.5" />
              )}
            </button>
          )}
        </div>
        
        {error && <span className="text-xs text-red-500 font-semibold">{error}</span>}
        {!error && hint && <span className="text-xs text-[#64748b]">{hint}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
