import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Input, NumberInput, Radio, Select, TimePicker, Textarea, FileUpload } from '../../components/form';
import { useToast } from '../../components/toast';
import api, { getSessionId } from '../../lib/api-client';
import type { Department, Draft } from '@shared/types';

// ============================================================
// 访客申请表单 — FK-9
// ============================================================

interface FormData {
  visitor_name: string;
  phone: string;
  id_card: string;
  visitor_unit: string;
  visitor_count: number | '';
  has_vehicle: boolean;
  vehicle_plate: string;
  contact_person: string;
  department: string;
  visit_start: string;
  visit_end: string;
  visit_purpose: string;
  attachment: File | null;
}

const initialFormData: FormData = {
  visitor_name: '',
  phone: '',
  id_card: '',
  visitor_unit: '',
  visitor_count: '',
  has_vehicle: false,
  vehicle_plate: '',
  contact_person: '',
  department: '',
  visit_start: '',
  visit_end: '',
  visit_purpose: '',
  attachment: null,
};

const vehicleOptions = [
  { label: '是', value: true },
  { label: '否', value: false },
];

/** 从表单数据中提取可序列化的草稿字段（排除 File 对象） */
function serializeFormData(form: FormData): Record<string, unknown> {
  return {
    visitor_name: form.visitor_name,
    phone: form.phone,
    id_card: form.id_card,
    visitor_unit: form.visitor_unit,
    visitor_count: form.visitor_count === '' ? undefined : form.visitor_count,
    has_vehicle: form.has_vehicle,
    vehicle_plate: form.vehicle_plate,
    contact_person: form.contact_person,
    department: form.department,
    visit_start: form.visit_start,
    visit_end: form.visit_end,
    visit_purpose: form.visit_purpose,
  };
}

/** 从草稿 JSON 还原为 FormData（File 无法序列化，忽略） */
function restoreFormData(raw: Record<string, unknown>): FormData {
  return {
    visitor_name: (raw.visitor_name as string) || '',
    phone: (raw.phone as string) || '',
    id_card: (raw.id_card as string) || '',
    visitor_unit: (raw.visitor_unit as string) || '',
    visitor_count: (raw.visitor_count as number | undefined) ?? '',
    has_vehicle: (raw.has_vehicle as boolean) ?? false,
    vehicle_plate: (raw.vehicle_plate as string) || '',
    contact_person: (raw.contact_person as string) || '',
    department: (raw.department as string) || '',
    visit_start: (raw.visit_start as string) || '',
    visit_end: (raw.visit_end as string) || '',
    visit_purpose: (raw.visit_purpose as string) || '',
    attachment: null, // File 对象无法序列化到草稿，重置为 null
  };
}

const VisitorApply: React.FC = () => {
  const [form, setForm] = useState<FormData>(initialFormData);
  const [departments, setDepartments] = useState<{ label: string; value: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  // 加载部门列表 + 恢复草稿
  useEffect(() => {
    api.get<Department[]>('/departments')
      .then((data) => {
        setDepartments(data.map((d) => ({ label: d.name, value: d.name })));
      })
      .catch(() => {
        // 部门加载失败时保持空列表
      });

    // 恢复草稿
    const sessionId = getSessionId();
    api.get<Draft | null>('/drafts', { session_id: sessionId })
      .then((draft) => {
        if (draft?.form_data) {
          try {
            const raw = typeof draft.form_data === 'string'
              ? JSON.parse(draft.form_data)
              : draft.form_data;
            setForm(restoreFormData(raw));
          } catch {
            // 草稿数据损坏，忽略
          }
        }
      })
      .catch(() => {
        // 草稿加载失败时保持空表单
      });
  }, []);

  // 通用字段更新
  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // 联动: 是否开车 → 车牌号
      if (key === 'has_vehicle' && value === false) {
        next.vehicle_plate = '';
      }
      return next;
    });
  }, []);

  // 手机号只允许数字
  const handlePhoneChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    updateField('phone', digits);
  }, [updateField]);

  // 必填字段是否全部填写（用于提交按钮启用/禁用）
  const isFormComplete = useMemo(() => {
    const requiredChecks: boolean[] = [
      form.visitor_name.trim() !== '',
      form.phone.length === 11,
      form.visitor_count !== '' && form.visitor_count >= 1,
      form.contact_person.trim() !== '',
      form.department !== '',
      form.visit_start !== '',
      form.visit_end !== '',
      form.visit_purpose.trim() !== '',
    ];
    // 如果开车，车牌号必填
    if (form.has_vehicle) {
      requiredChecks.push(form.vehicle_plate.trim() !== '');
    }
    return requiredChecks.every(Boolean);
  }, [form]);

  // 暂存（草稿）
  const handleSaveDraft = useCallback(async () => {
    setSubmitting(true);
    try {
      await api.post('/drafts', {
        session_id: getSessionId(),
        form_data: serializeFormData(form),
      });
      toast.success('暂存成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '暂存失败');
    } finally {
      setSubmitting(false);
    }
  }, [form, toast]);

  // 提交
  const handleSubmit = useCallback(async () => {
    if (!isFormComplete) return;
    setSubmitting(true);
    try {
      await api.post('/applications', {
        session_id: getSessionId(),
        visitor_name: form.visitor_name,
        phone: form.phone,
        id_card: form.id_card || undefined,
        visitor_unit: form.visitor_unit || undefined,
        visitor_count: form.visitor_count,
        has_vehicle: form.has_vehicle,
        vehicle_plate: form.has_vehicle ? form.vehicle_plate : undefined,
        contact_person: form.contact_person,
        department: form.department,
        visit_start: form.visit_start,
        visit_end: form.visit_end,
        visit_purpose: form.visit_purpose,
      });
      toast.success('提交成功');
      setForm(initialFormData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }, [form, isFormComplete, toast]);

  return (
    <div className="page">
      <h1 className="page-title">访客申请</h1>

      <div className="apply-form">
        {/* 访客基本信息 */}
        <fieldset className="form-section">
          <legend className="form-section-title">访客基本信息</legend>
          <Input
            label="访客姓名"
            required
            value={form.visitor_name}
            onChange={(v) => updateField('visitor_name', v)}
            maxLength={20}
            placeholder="请输入访客姓名"
          />
          <Input
            label="手机号"
            required
            type="tel"
            value={form.phone}
            onChange={handlePhoneChange}
            maxLength={11}
            placeholder="请输入手机号"
          />
          <Input
            label="身份证号"
            value={form.id_card}
            onChange={(v) => updateField('id_card', v)}
            maxLength={18}
            placeholder="请输入身份证号"
          />
          <Input
            label="访客单位"
            value={form.visitor_unit}
            onChange={(v) => updateField('visitor_unit', v)}
            maxLength={50}
            placeholder="请输入访客单位"
          />
        </fieldset>

        {/* 人数与车辆 */}
        <fieldset className="form-section">
          <legend className="form-section-title">人数与车辆</legend>
          <NumberInput
            label="访客人数"
            required
            value={form.visitor_count}
            onChange={(v) => updateField('visitor_count', v)}
            min={1}
            step={1}
            placeholder="请输入访客人数"
          />
          <Radio
            label="是否开车"
            required
            name="has_vehicle"
            options={vehicleOptions}
            value={form.has_vehicle}
            onChange={(v) => updateField('has_vehicle', v as boolean)}
          />
          {form.has_vehicle && (
            <Input
              label="车牌号"
              required
              value={form.vehicle_plate}
              onChange={(v) => updateField('vehicle_plate', v)}
              placeholder="请输入车牌号"
            />
          )}
        </fieldset>

        {/* 对接信息 */}
        <fieldset className="form-section">
          <legend className="form-section-title">对接信息</legend>
          <Input
            label="内部对接人"
            required
            value={form.contact_person}
            onChange={(v) => updateField('contact_person', v)}
            maxLength={20}
            placeholder="请输入内部对接人姓名"
          />
          <Select
            label="对接人部门"
            required
            options={departments}
            value={form.department}
            onChange={(v) => updateField('department', v)}
            placeholder="请选择对接人部门"
          />
        </fieldset>

        {/* 时间 */}
        <fieldset className="form-section">
          <legend className="form-section-title">拜访时间</legend>
          <TimePicker
            label="拜访起始时间"
            required
            value={form.visit_start}
            onChange={(v) => updateField('visit_start', v)}
          />
          <TimePicker
            label="拜访结束时间"
            required
            value={form.visit_end}
            onChange={(v) => updateField('visit_end', v)}
          />
        </fieldset>

        {/* 到访事宜 */}
        <fieldset className="form-section">
          <legend className="form-section-title">到访事宜</legend>
          <Textarea
            label="到访事宜"
            required
            value={form.visit_purpose}
            onChange={(v) => updateField('visit_purpose', v)}
            maxLength={200}
            showCount
            placeholder="请输入到访事宜"
          />
        </fieldset>

        {/* 附件 */}
        <fieldset className="form-section">
          <legend className="form-section-title">附件</legend>
          <FileUpload
            label="附件"
            value={form.attachment}
            onChange={(v) => updateField('attachment', v)}
          />
        </fieldset>

        {/* 底部操作按钮 */}
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-default"
            onClick={handleSaveDraft}
            disabled={submitting}
          >
            暂存
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!isFormComplete || submitting}
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
};

export default VisitorApply;
