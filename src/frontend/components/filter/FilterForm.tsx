import React from 'react';

// ============================================================
// FilterForm — 多条件筛选表单（支持重置）
// ============================================================

interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date';
  placeholder?: string;
  options?: { label: string; value: string }[];
}

interface FilterFormProps {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  loading?: boolean;
}

const FilterForm: React.FC<FilterFormProps> = ({
  fields,
  values,
  onChange,
  onSearch,
  onReset,
  loading,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <form className="filter-form" onSubmit={handleSubmit}>
      <div className="filter-fields">
        {fields.map((field) => (
          <div key={field.key} className="filter-field">
            <label className="filter-label">{field.label}</label>
            {field.type === 'select' ? (
              <select
                className="form-select filter-select"
                value={values[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                <option value="">{field.placeholder || '全部'}</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                className="form-input filter-input"
                placeholder={field.placeholder || ''}
                value={values[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="filter-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '搜索中...' : '搜索'}
        </button>
        <button type="button" className="btn btn-default" onClick={onReset} disabled={loading}>
          重置
        </button>
      </div>
    </form>
  );
};

export default FilterForm;
