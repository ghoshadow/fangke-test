import React, { useRef, useState } from 'react';

// ============================================================
// FileUpload — 文件上传（最多1个附件）
// ============================================================

interface FileUploadProps {
  label?: string;
  required?: boolean;
  error?: string;
  accept?: string;
  maxSizeMB?: number;
  value?: File | null;
  onChange?: (file: File | null) => void;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  label,
  required,
  error,
  accept,
  maxSizeMB = 10,
  value,
  onChange,
  className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File | null) => {
    if (!file) {
      onChange?.(null);
      return;
    }

    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      onChange?.(null);
      return;
    }

    onChange?.(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0] || null;
    handleFile(file);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="form-label">
          {required && <span className="required-mark">*</span>}
          {label}
        </label>
      )}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${value ? 'has-file' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          className="file-input-hidden"
          accept={accept}
          onChange={handleInputChange}
        />
        {value ? (
          <div className="file-info">
            <span className="file-name">{value.name}</span>
            <span className="file-size">({(value.size / 1024).toFixed(1)} KB)</span>
            <button className="file-remove" onClick={handleRemove} type="button">
              ×
            </button>
          </div>
        ) : (
          <div className="upload-placeholder">
            <span className="upload-icon">📎</span>
            <span>点击或拖拽上传文件</span>
          </div>
        )}
      </div>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
};

export default FileUpload;
