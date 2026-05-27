import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input, NumberInput, Radio, Select, TimePicker, Textarea, FileUpload } from '../../components/form';
import api, { getSessionId } from '../../lib/api-client';
import { useToast } from '../../components/toast';
import { ApprovalStatusLabels, PassStatusLabels, ApprovalStatus } from '@shared/types';
import type { VisitorApplication, Department, Draft } from '@shared/types';

// ============================================================
// 申请详情页 — FK-12 提交后锁定只读 + FK-13 退回重提编辑
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

const vehicleOptions = [
  { label: '是', value: true },
  { label: '否', value: false },
];

function appToFormData(app: VisitorApplication): FormData {
  return {
    visitor_name: app.visitor_name,
    phone: app.phone,
    id_card: app.id_card || '',
    visitor_unit: app.company || '',
    visitor_count: app.visitor_count,
    has_vehicle: app.is_driving,
    vehicle_plate: app.license_plate || '',
    contact_person: app.contact_person,
    department: app.department_id,
    visit_start: app.visit_start_time,
    visit_end: app.visit_end_time,
    visit_purpose: app.visit_purpose,
    attachment: null,
  };
}

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
    attachment: null,
  };
}

const ApplyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [app, setApp] = useState<VisitorApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState<string | null>(null);

  // 编辑模式
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormData>({
    visitor_name: '', phone: '', id_card: '', visitor_unit: '',
    visitor_count: '', has_vehicle: false, vehicle_plate: '',
    contact_person: '', department: '', visit_start: '', visit_end: '',
    visit_purpose: '', attachment: null,
  });
  const [departments, setDepartments] = useState<{ label: string; value: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 加载申请详情
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.get<VisitorApplication>(`/applications/${id}`)
      .then((data) => {
        setApp(data);
        if (data.approval_status === ApprovalStatus.RETURNED) {
          setEditing(true);
          setForm(appToFormData(data));
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载失败');
        toast.error(err instanceof Error ? err.message : '加载申请详情失败');
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  // 加载退回原因 + 部门列表 + 恢复草稿
  useEffect(() => {
    if (!id || !app) return;

    if (app.approval_status === ApprovalStatus.RETURNED) {
      api.get<{ reason: string | null }>(`/applications/${id}/return-reason`)
        .then((data) => setReturnReason(data.reason))
        .catch(() => { /* ignore */ });
    }

    api.get<Department[]>('/departments')
      .then((data) => setDepartments(data.map((d) => ({ label: d.name, value: d.name }))))
      .catch(() => { /* ignore */ });

    if (app.approval_status === ApprovalStatus.RETURNED) {
      const sessionId = getSessionId();
      api.get<Draft | null>('/drafts', { session_id: sessionId, application_id: id })
        .then((draft) => {
          if (draft?.form_data) {
            try {
              const raw = typeof draft.form_data === 'string'
                ? JSON.parse(draft.form_data)
                : draft.form_data;
              setForm(restoreFormData(raw));
            } catch {
              // 草稿损坏，保持应用原始数据
            }
          }
        })
        .catch(() => { /* ignore */ });
    }
  }, [id, app]);

  // 通用字段更新
  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'has_vehicle' && value === false) {
        next.vehicle_plate = '';
      }
      return next;
    });
  }, []);

  const handlePhoneChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    updateField('phone', digits);
  }, [updateField]);

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
    if (form.has_vehicle) {
      requiredChecks.push(form.vehicle_plate.trim() !== '');
    }
    return requiredChecks.every(Boolean);
  }, [form]);

  // 暂存草稿
  const handleSaveDraft = useCallback(async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await api.post('/drafts', {
        session_id: getSessionId(),
        application_id: id,
        form_data: serializeFormData(form),
      });
      toast.success('暂存成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '暂存失败');
    } finally {
      setSubmitting(false);
    }
  }, [form, id, toast]);

  // 重新提交
  const handleResubmit = useCallback(async () => {
    if (!id || !isFormComplete) return;
    setSubmitting(true);
    try {
      const updated = await api.patch<VisitorApplication>(`/applications/${id}`, {
        visitor_name: form.visitor_name.trim(),
        phone: form.phone,
        id_card: form.id_card || null,
        company: form.visitor_unit || null,
        visitor_count: form.visitor_count,
        is_driving: form.has_vehicle,
        license_plate: form.has_vehicle ? form.vehicle_plate : null,
        contact_person: form.contact_person.trim(),
        department_id: form.department,
        visit_start_time: form.visit_start,
        visit_end_time: form.visit_end,
        visit_purpose: form.visit_purpose.trim(),
        attachment_url: app?.attachment_url || null,
      });
      toast.success('重新提交成功，已进入审批队列');
      setApp(updated);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }, [form, id, isFormComplete, app, toast]);

  // ---- 加载中 ----
  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">申请详情</h1>
        <div className="loading-spinner" />
      </div>
    );
  }

  // ---- 错误 ----
  if (error || !app) {
    return (
      <div className="page">
        <h1 className="page-title">申请详情</h1>
        <div className="empty-state">
          <div className="empty-text">{error || '申请不存在'}</div>
          <div className="empty-action">
            <button className="btn btn-default" onClick={() => navigate('/apply')}>
              返回申请
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- 编辑模式（退回重提） ----
  if (editing && app.approval_status === ApprovalStatus.RETURNED) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-default btn-sm" onClick={() => navigate('/approval')}>
            &larr; 返回
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>编辑申请</h1>
        </div>

        {/* 退回原因提示 */}
        {returnReason && (
          <div style={{
            background: '#fff7e6', border: '1px solid #ffd591',
            borderRadius: 6, padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>&#9888;</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#d46b08' }}>
                该申请已被退回
              </div>
              <div style={{ color: '#ad6800', fontSize: 13 }}>
                原因：{returnReason}
              </div>
            </div>
          </div>
        )}

        {!returnReason && (
          <div style={{
            background: '#fff7e6', border: '1px solid #ffd591',
            borderRadius: 6, padding: '12px 16px', marginBottom: 20,
          }}>
            <span style={{ fontSize: 16, marginRight: 8 }}>&#9888;</span>
            该申请已被退回，请修改后重新提交
          </div>
        )}

        {/* 可编辑表单 */}
        <div className="apply-form">
          <fieldset className="form-section">
            <legend className="form-section-title">访客基本信息</legend>
            <Input label="访客姓名" required value={form.visitor_name}
              onChange={(v) => updateField('visitor_name', v)} maxLength={20} placeholder="请输入访客姓名" />
            <Input label="手机号" required type="tel" value={form.phone}
              onChange={handlePhoneChange} maxLength={11} placeholder="请输入手机号" />
            <Input label="身份证号" value={form.id_card}
              onChange={(v) => updateField('id_card', v)} maxLength={18} placeholder="请输入身份证号" />
            <Input label="访客单位" value={form.visitor_unit}
              onChange={(v) => updateField('visitor_unit', v)} maxLength={50} placeholder="请输入访客单位" />
          </fieldset>

          <fieldset className="form-section">
            <legend className="form-section-title">人数与车辆</legend>
            <NumberInput label="访客人数" required value={form.visitor_count}
              onChange={(v) => updateField('visitor_count', v)} min={1} step={1} placeholder="请输入访客人数" />
            <Radio label="是否开车" required name="has_vehicle"
              options={vehicleOptions} value={form.has_vehicle}
              onChange={(v) => updateField('has_vehicle', v as boolean)} />
            {form.has_vehicle && (
              <Input label="车牌号" required value={form.vehicle_plate}
                onChange={(v) => updateField('vehicle_plate', v)} placeholder="请输入车牌号" />
            )}
          </fieldset>

          <fieldset className="form-section">
            <legend className="form-section-title">对接信息</legend>
            <Input label="内部对接人" required value={form.contact_person}
              onChange={(v) => updateField('contact_person', v)} maxLength={20} placeholder="请输入内部对接人姓名" />
            <Select label="对接人部门" required options={departments} value={form.department}
              onChange={(v) => updateField('department', v)} placeholder="请选择对接人部门" />
          </fieldset>

          <fieldset className="form-section">
            <legend className="form-section-title">拜访时间</legend>
            <TimePicker label="拜访起始时间" required value={form.visit_start}
              onChange={(v) => updateField('visit_start', v)} />
            <TimePicker label="拜访结束时间" required value={form.visit_end}
              onChange={(v) => updateField('visit_end', v)} />
          </fieldset>

          <fieldset className="form-section">
            <legend className="form-section-title">到访事宜</legend>
            <Textarea label="到访事宜" required value={form.visit_purpose}
              onChange={(v) => updateField('visit_purpose', v)} maxLength={200} showCount placeholder="请输入到访事宜" />
          </fieldset>

          <fieldset className="form-section">
            <legend className="form-section-title">附件</legend>
            <FileUpload label="附件" value={form.attachment}
              onChange={(v) => updateField('attachment', v)} />
          </fieldset>

          {/* 底部操作按钮 */}
          <div className="form-actions">
            <button type="button" className="btn btn-default"
              onClick={handleSaveDraft} disabled={submitting}>
              暂存
            </button>
            <button type="button" className="btn btn-primary"
              onClick={handleResubmit}
              disabled={!isFormComplete || submitting}>
              重新提交
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- 只读模式（非退回状态） ----
  const detailRows: { label: string; value: string }[] = [
    { label: '访客姓名', value: app.visitor_name },
    { label: '手机号', value: app.phone },
    { label: '身份证号', value: app.id_card || '-' },
    { label: '访客单位', value: app.company || '-' },
    { label: '访客人数', value: `${app.visitor_count} 人` },
    { label: '是否开车', value: app.is_driving ? '是' : '否' },
    ...(app.is_driving ? [{ label: '车牌号', value: app.license_plate || '-' }] : []),
    { label: '内部对接人', value: app.contact_person },
    { label: '对接人部门', value: app.department_id },
    { label: '拜访起始时间', value: app.visit_start_time },
    { label: '拜访结束时间', value: app.visit_end_time },
    { label: '到访事宜', value: app.visit_purpose },
    { label: '附件', value: app.attachment_url || '-' },
  ];

  const approvalStatusClass = `status-tag status-${app.approval_status}`;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn btn-default btn-sm" onClick={() => navigate('/apply')}>
          &larr; 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>申请详情</h1>
      </div>

      <div className="apply-form" style={{ marginBottom: 24, display: 'flex', gap: 24 }}>
        <div>
          <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>审批状态：</span>
          <span className={approvalStatusClass}>
            {ApprovalStatusLabels[app.approval_status]}
          </span>
        </div>
        {app.pass_status && (
          <div>
            <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>通行状态：</span>
            <span className={`status-tag status-${app.pass_status}`}>
              {PassStatusLabels[app.pass_status]}
            </span>
          </div>
        )}
      </div>

      <div className="apply-form">
        <fieldset className="form-section">
          <legend className="form-section-title">访客基本信息</legend>
          {detailRows.slice(0, 4).map((row) => (
            <div key={row.label} className="form-field">
              <label className="form-label">{row.label}</label>
              <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
                {row.value}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">人数与车辆</legend>
          {detailRows.slice(4, 7).map((row) => (
            <div key={row.label} className="form-field">
              <label className="form-label">{row.label}</label>
              <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
                {row.value}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">对接信息</legend>
          {detailRows.slice(7, 9).map((row) => (
            <div key={row.label} className="form-field">
              <label className="form-label">{row.label}</label>
              <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
                {row.value}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">拜访时间</legend>
          {detailRows.slice(9, 11).map((row) => (
            <div key={row.label} className="form-field">
              <label className="form-label">{row.label}</label>
              <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
                {row.value}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">到访事宜</legend>
          {detailRows.slice(11, 13).map((row) => (
            <div key={row.label} className="form-field">
              <label className="form-label">{row.label}</label>
              <div className="form-textarea" style={{
                background: '#f5f5f5', cursor: 'not-allowed', minHeight: 80,
                whiteSpace: 'pre-wrap', padding: '8px 12px',
              }}>
                {row.value}
              </div>
            </div>
          ))}
        </fieldset>
      </div>
    </div>
  );
};

export default ApplyDetail;