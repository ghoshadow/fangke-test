import React, { useEffect, useRef } from 'react';

// ============================================================
// ConfirmModal — 确认弹窗
// ============================================================

interface ConfirmModalProps {
  visible: boolean;
  title?: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  confirmType?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title = '确认操作',
  content,
  confirmText = '确认',
  cancelText = '取消',
  confirmType = 'primary',
  onConfirm,
  onCancel,
  loading,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  if (!visible) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal confirm-modal" ref={modalRef}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p>{content}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-default" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button
            className={`btn btn-${confirmType}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
