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
      toastOptions={{
        duration: 3500,
        style: {
          background: '#ffffff',
          color: '#1e293b',
          border: '1px solid #e5e3db',
          borderRadius: '16px',
        },
        ...toastOptions,
      }}
      {...props}
    />
  );
};
