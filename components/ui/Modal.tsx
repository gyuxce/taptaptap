import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  deferContent?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  deferContent = false,
}) => {
  const [contentReady, setContentReady] = useState(!deferContent);

  useEffect(() => {
    if (!isOpen) {
      setContentReady(!deferContent);
      return;
    }
    if (!deferContent) {
      setContentReady(true);
      return;
    }
    const timer = window.setTimeout(() => setContentReady(true), 170);
    return () => window.clearTimeout(timer);
  }, [deferContent, isOpen]);

  if (!isOpen) return null;

  return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          {/* Backdrop */}
          <button
            aria-label="Tutup dialog"
            onClick={onClose}
            className="fixed inset-0 bg-[#1B2340]/45 animate-overlay-in"
          />

          {/* Modal Container */}
          <div className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-[#E2EEFF] bg-[#F8FAFF] shadow-xl animate-sheet-in transform-gpu will-change-transform md:max-h-[85vh] md:max-w-lg md:rounded-2xl md:border md:animate-dialog-in">
            {/* Mobile Drag Indicator Bar */}
            <div className="flex md:hidden justify-center py-3">
              <div className="w-12 h-1.5 bg-[#E2EEFF] rounded-full cursor-grab active:cursor-grabbing" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2EEFF] bg-white">
              {title ? (
                <h3 className="text-sm md:text-base font-bold text-[#1B2340]">{title}</h3>
              ) : (
                <div />
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B2340] hover:bg-[#E8F6FD] transition-colors cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {contentReady ? children : (
                <div className="space-y-4 animate-pulse" aria-label="Menyiapkan formulir">
                  <div className="h-10 rounded-xl bg-slate-100" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-10 rounded-xl bg-slate-100" />
                    <div className="h-10 rounded-xl bg-slate-100" />
                  </div>
                  <div className="h-10 rounded-xl bg-slate-100" />
                  <div className="h-10 rounded-xl bg-slate-100" />
                  <div className="h-12 rounded-xl bg-slate-100" />
                </div>
              )}
            </div>
          </div>
        </div>
  );
};
