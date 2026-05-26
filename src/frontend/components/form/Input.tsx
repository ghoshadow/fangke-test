import React from 'react';

// ============================================================
// Input — 文本输入框（含长度计数 + 必填星号 + 错误提示）
// ============================================================

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  required?: boolean;
  error?: string;
  maxLength?: number;
  showCount?: boolean;
  onChange?: (value: string) => void;
}

const Input: React.FC<InputProps> = ({
  label,
  required,
  error,
  maxLength,
  showCount,
  onChange,
  value,
  className = '',
  ...rest
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      <div className="input-wrapper">
        <input
          type="text"
          className={`form-input ${error ? 'input-error' : ''}`}
          value={value ?? ''}
          onChange={handleChange}
          maxLength={maxLength}
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

export default Input;
