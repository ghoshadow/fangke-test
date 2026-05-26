import React from 'react';

// ============================================================
// TimePicker — 时间选择器（HH:mm）
// ============================================================

interface TimePickerProps {
  label?: string;
  required?: boolean;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

const TimePicker: React.FC<TimePickerProps> = ({
  label,
  required,
  error,
  value,
  onChange,
  className = '',
  disabled,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      <input
        type="time"
        className={`form-input time-input ${error ? 'input-error' : ''}`}
        value={value ?? ''}
        onChange={handleChange}
        disabled={disabled}
      />
      {error && <span className="error-text">{error}</span>}
    </div>
  );
};

export default TimePicker;
