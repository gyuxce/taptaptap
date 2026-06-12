import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-[#e5e3db] rounded-2xl bg-[#fcfbf9] py-16 gap-3 select-none">
      <div className="w-12 h-12 rounded-2xl bg-white border border-[#e5e3db] flex items-center justify-center text-gray-400 shadow-xs">
        {icon}
      </div>
      <div className="space-y-1">
        <h4 className="text-sm md:text-base font-bold text-[#1e293b]">{title}</h4>
        <p className="text-xs text-[#64748b] max-w-xs mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className="mt-2 font-bold cursor-pointer">
          {action.label}
        </Button>
      )}
    </div>
  );
};
