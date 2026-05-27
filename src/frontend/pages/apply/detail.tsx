import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api-client';
import { useToast } from '../../components/toast';
import { ApprovalStatusLabels, PassStatusLabels } from '@shared/types';
import type { VisitorApplication } from '@shared/types';

// ============================================================
// 申请详情页 — FK-12 提交后锁定只读
// ============================================================

const ApplyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [app, setApp] = useState<VisitorApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.get<VisitorApplication>(`/applications/${id}`)
      .then((data) => setApp(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载失败');
        toast.error(err instanceof Error ? err.message : '加载申请详情失败');
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">申请详情</h1>
        <div className="loading-spinner" />
      </div>
    );
  }

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

      {/* 状态信息 */}
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

      {/* 字段详情 — 只读锁定 */}
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