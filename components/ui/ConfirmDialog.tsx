import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  loading = false,
}) => {
  const handleCancel = onCancel || onClose;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 text-left">
        <p className="text-sm text-[#64748b] leading-relaxed">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e5e3db] mt-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCancel} 
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button 
            variant="danger" 
            size="sm" 
            onClick={onConfirm} 
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
