'use client';

import React from 'react';
import { Toaster as SonnerToaster } from 'sonner';

export { toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

export const Toaster: React.FC<ToasterProps> = ({
  position = 'bottom-right',
  richColors = true,
  toastOptions,
  ...props
}) => {
  return (
    <SonnerToaster
      position={position}
      richColors={richColors}
      closeButton
      gap={10}
      visibleToasts={3}
      toastOptions={{
        duration: 3500,
        style: {
          width: 'min(92vw, 380px)',
          background: 'rgba(255, 255, 255, 0.98)',
          color: '#14213d',
          border: '1px solid rgba(20, 33, 61, 0.08)',
          borderRadius: '20px',
          padding: '14px 16px',
          boxShadow: '0 18px 50px rgba(20, 33, 61, 0.16)',
          backdropFilter: 'blur(18px)',
          fontSize: '14px',
        },
        ...toastOptions,
      }}
      {...props}
    />
  );
};
