import React from 'react';

// ============================================================
// NumberInput — 数字输入框
// ============================================================

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string;
  required?: boolean;
  error?: string;
  value?: number | '';
  onChange?: (value: number | '') => void;
}

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  required,
  error,
  value,
  onChange,
  min,
  max,
  className = '',
  ...rest
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange?.('');
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      onChange?.(num);
    }
  };

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="form-label">
          {required && <span className="required-mark">*</span>}
          {label}
        </label>
      )}
      <input
        type="number"
        className={`form-input ${error ? 'input-error' : ''}`}
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        {...rest}
      />
      {error && <span className="error-text">{error}</span>}
    </div>
  );
};

export default NumberInput;
