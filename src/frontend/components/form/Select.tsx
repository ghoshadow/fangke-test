import React from 'react';

// ============================================================
// Select — 下拉选择框
// ============================================================

interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  required?: boolean;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  onChange?: (value: string) => void;
}

const Select: React.FC<SelectProps> = ({
  label,
  required,
  error,
  options,
  placeholder = '请选择',
  onChange,
  value,
  className = '',
  ...rest
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="form-label">
          {required && <span className="required-mark">*</span>}
          {label}
        </label>
      )}
      <select
        className={`form-select ${error ? 'input-error' : ''}`}
        value={value ?? ''}
        onChange={handleChange}
        {...rest}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
};

export default Select;
