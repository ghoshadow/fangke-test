import { useState, useCallback } from 'react';
import type { ValidationErrors } from '@shared/types';

// ============================================================
// useValidation — 表单校验 Hook
// ============================================================

type ValidatorFn = (value: unknown, formData: Record<string, unknown>) => string | null;
type ValidatorRules = Record<string, ValidatorFn[]>;

interface UseValidationResult {
  errors: ValidationErrors;
  validate: (formData: Record<string, unknown>) => boolean;
  validateField: (field: string, value: unknown, formData: Record<string, unknown>) => void;
  clearErrors: () => void;
  clearFieldError: (field: string) => void;
  setFieldError: (field: string, message: string) => void;
}

export function useValidation(rules: ValidatorRules): UseValidationResult {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validate = useCallback(
    (formData: Record<string, unknown>): boolean => {
      const newErrors: ValidationErrors = {};

      Object.entries(rules).forEach(([field, validators]) => {
        for (const validator of validators) {
          const error = validator(formData[field], formData);
          if (error) {
            newErrors[field] = error;
            break; // 每个字段只保留第一个错误
          }
        }
      });

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [rules],
  );

  const validateField = useCallback(
    (field: string, value: unknown, formData: Record<string, unknown>): void => {
      const fieldRules = rules[field] || [];
      let fieldError: string | null = null;

      for (const validator of fieldRules) {
        const error = validator(value, formData);
        if (error) {
          fieldError = error;
          break;
        }
      }

      setErrors((prev) => {
        const next = { ...prev };
        if (fieldError) {
          next[field] = fieldError;
        } else {
          delete next[field];
        }
        return next;
      });
    },
    [rules],
  );

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setFieldError = useCallback((field: string, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  return {
    errors,
    validate,
    validateField,
    clearErrors,
    clearFieldError,
    setFieldError,
  };
}

// ============================================================
// 通用校验器工厂
// ============================================================

export function required(fieldLabel: string): ValidatorFn {
  return (value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return `请填写${fieldLabel}`;
    }
    return null;
  };
}

export function maxLength(max: number, fieldLabel: string): ValidatorFn {
  return (value) => {
    if (value && String(value).length > max) {
      return `${fieldLabel}不能超过${max}个字符`;
    }
    return null;
  };
}

export function pattern(regex: RegExp, message: string): ValidatorFn {
  return (value) => {
    if (value && !regex.test(String(value))) {
      return message;
    }
    return null;
  };
}

export function minLength(min: number, fieldLabel: string): ValidatorFn {
  return (value) => {
    if (value && String(value).length < min) {
      return `${fieldLabel}不能少于${min}个字符`;
    }
    return null;
  };
}
