import React from 'react';

// ============================================================
// Radio — 单选框组
// ============================================================

interface RadioOption {
  label: string;
  value: string | boolean;
}

interface RadioProps {
  label?: string;
  required?: boolean;
  error?: string;
  options: RadioOption[];
  value?: string | boolean;
  onChange?: (value: string | boolean) => void;
  name: string;
  className?: string;
}

const Radio: React.FC<RadioProps> = ({
  label,
  required,
  error,
  options,
  value,
  onChange,
  name,
  className = '',
}) => {
  const handleChange = (optionValue: string | boolean) => {
    onChange?.(optionValue);
  };

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="form-label">
          {required && <span className="required-mark">*</span>}
          {label}
        </label>
      )}
      <div className="radio-group">
        {options.map((option) => (
          <label key={String(option.value)} className="radio-item">
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={value === option.value}
              onChange={() => handleChange(option.value)}
            />
            <span className="radio-label">{option.label}</span>
          </label>
        ))}
      </div>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
};

export default Radio;
