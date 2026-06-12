import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#1B2340]/45"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ 
              y: '100%', 
              opacity: 0,
              scale: 1
            }}
            animate={{ 
              y: 0, 
              opacity: 1,
              scale: 1
            }}
            exit={{ 
              y: '100%', 
              opacity: 0,
              scale: 1
            }}
            variants={{
              desktop: { y: 0, opacity: 1, scale: 1 },
              mobile: { y: 0, opacity: 1 }
            }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full md:max-w-lg bg-[#F8FAFF] border-t md:border border-[#E2EEFF] rounded-t-3xl md:rounded-2xl shadow-2xl z-10 flex flex-col max-h-[92vh] md:max-h-[85vh] overflow-hidden md:animate-none"
            style={{
              transformOrigin: 'bottom center'
            }}
          >
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
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
