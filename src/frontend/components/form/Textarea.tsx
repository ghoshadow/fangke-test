import React from 'react';

// ============================================================
// Textarea — 多行文本框（含长度计数）
// ============================================================

interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: string;
  required?: boolean;
  error?: string;
  maxLength?: number;
  showCount?: boolean;
  onChange?: (value: string) => void;
}

const Textarea: React.FC<TextareaProps> = ({
  label,
  required,
  error,
  maxLength,
  showCount,
  onChange,
  value,
  className = '',
  rows = 4,
  ...rest
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e.target.value);
  };

  const currentLength = typeof value === 'string' ? value.length : 0;

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="form-label">
          {required && <span className="required-mark">*</span>}
          {label}
        </label>
      )}
      <div className="textarea-wrapper">
        <textarea
          className={`form-textarea ${error ? 'input-error' : ''}`}
          value={value ?? ''}
          onChange={handleChange}
          maxLength={maxLength}
          rows={rows}
          {...rest}
        />
        {showCount && maxLength && (
          <span className="char-count">
            {currentLength}/{maxLength}
          </span>
        )}
      </div>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
};

export default Textarea;
