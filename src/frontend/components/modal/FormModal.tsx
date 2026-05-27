import React, { useEffect, useRef } from 'react';

// ============================================================
// FormModal — 模态框（含表单）
// ============================================================

interface FormModalProps {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitText?: string;
  cancelText?: string;
  loading?: boolean;
  submitDisabled?: boolean;
  width?: string;
}

const FormModal: React.FC<FormModalProps> = ({
  visible,
  title,
  children,
  onSubmit,
  onCancel,
  submitText = '提交',
  cancelText = '取消',
  loading,
  submitDisabled,
  width,
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
      <div
        className="modal form-modal"
        ref={modalRef}
        style={width ? { width } : undefined}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onCancel} type="button">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-default" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={loading || submitDisabled}>
            {loading ? '处理中...' : submitText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FormModal;
