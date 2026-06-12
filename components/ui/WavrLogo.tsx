import React from 'react';

export interface WavrLogoProps {
  variant?: 'full' | 'icon' | 'white';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const WavrLogo: React.FC<WavrLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
}) => {
  // Size mapping
  const sizeMap = {
    sm: { icon: 24, text: 'text-[14px]' },
    md: { icon: 32, text: 'text-[18px]' },
    lg: { icon: 48, text: 'text-[24px]' },
  };

  const currentSize = sizeMap[size];

  // Render only icon SVG
  const renderIcon = (isWhite: boolean) => {
    const iconSize = currentSize.icon;
    return (
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {isWhite ? (
          <>
            <defs>
              <mask id="wavrWhiteMask">
                <rect x="0" y="0" width="100" height="100" fill="#FFFFFF" />
                <path d="M 40.8,66.8 A 13,13 0 0,1 59.2,66.8" fill="none" stroke="#000000" stroke-width="5.5" stroke-linecap="round" />
                <path d="M 32.3,58.3 A 25,25 0 0,1 67.7,58.3" fill="none" stroke="#000000" stroke-width="4.5" stroke-linecap="round" />
                <path d="M 23.8,49.8 A 37,37 0 0,1 76.2,49.8" fill="none" stroke="#000000" stroke-width="3.5" stroke-linecap="round" />
              </mask>
            </defs>
            <polygon
              points="50,5 91,27.5 91,72.5 50,95 9,72.5 9,27.5"
              fill="#FFFFFF"
              stroke="#FFFFFF"
              stroke-width="8"
              stroke-linejoin="round"
              mask="url(#wavrWhiteMask)"
            />
          </>
        ) : (
          <>
            <defs>
              <linearGradient id="wavrIconGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#29ABE2" />
                <stop offset="100%" stop-color="#0095D0" />
              </linearGradient>
            </defs>
            <polygon
              points="50,5 91,27.5 91,72.5 50,95 9,72.5 9,27.5"
              fill="url(#wavrIconGrad)"
              stroke="url(#wavrIconGrad)"
              stroke-width="8"
              stroke-linejoin="round"
            />
            <path d="M 40.8,66.8 A 13,13 0 0,1 59.2,66.8" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round" />
            <path d="M 32.3,58.3 A 25,25 0 0,1 67.7,58.3" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" />
            <path d="M 23.8,49.8 A 37,37 0 0,1 76.2,49.8" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" />
          </>
        )}
      </svg>
    );
  };

  if (variant === 'icon') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {renderIcon(false)}
      </div>
    );
  }

  const isWhiteVariant = variant === 'white';
  const textColorClass = isWhiteVariant ? 'text-white' : 'text-[#1B2340]';

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {renderIcon(isWhiteVariant)}
      <span className={`font-black tracking-[0.15em] font-sans uppercase leading-none select-none ${textColorClass} ${currentSize.text}`}>
        WAVR
      </span>
    </div>
  );
};
