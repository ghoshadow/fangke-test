import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api-client';
import { useToast } from '../../components/toast';
import {
  ApprovalStatusLabels,
  PassStatusLabels,
} from '@shared/types';
import type {
  VisitorApplication,
  ApprovalRecord,
  VisitorPass,
  Department,
} from '@shared/types';

// ============================================================
// 记录详情页 — FK-25 记录详情查看
// 展示申请全字段 + 审批结果(含时间/原因) + 通行状态 + 审批时间线
// ============================================================

interface RecordDetailData {
  application: VisitorApplication;
  approval_records: ApprovalRecord[];
  pass: VisitorPass | null;
}

const OPERATION_LABELS: Record<string, string> = {
  approve: '同意',
  return: '退回',
  reject: '拒绝',
};

const OPERATION_COLORS: Record<string, string> = {
  approve: 'var(--color-success)',
  return: 'var(--color-warning)',
  reject: 'var(--color-danger)',
};

const RecordDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<RecordDetailData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    // 并行加载详情 + 部门列表
    Promise.all([
      api.get<RecordDetailData>(`/records/${id}`),
      api.get<Department[]>('/departments').catch(() => [] as Department[]),
    ])
      .then(([detail, depts]) => {
        setData(detail);
        setDepartments(depts);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载失败');
        toast.error(err instanceof Error ? err.message : '加载记录详情失败');
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  // 部门名称映射
  const getDepartmentName = (deptId: string): string => {
    const dept = departments.find((d) => d.id === deptId);
    return dept?.name || deptId;
  };

  // 格式化时间
  const formatTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">记录详情</h1>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <h1 className="page-title">记录详情</h1>
        <div className="empty-state">
          <div className="empty-text">{error || '记录不存在'}</div>
          <div className="empty-action">
            <button className="btn btn-default" onClick={() => navigate('/records')}>
              返回查询
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { application: app, approval_records: records, pass } = data;

  // 最新审批记录（用于摘要区展示审批结果附加信息）
  const latestRecord = records.length > 0
    ? records.reduce((a, b) => (a.operated_at > b.operated_at ? a : b))
    : null;

  const detailRows: { label: string; value: string }[] = [
    { label: '访客姓名', value: app.visitor_name },
    { label: '手机号', value: app.phone },
    { label: '身份证号', value: app.id_card || '-' },
    { label: '访客单位', value: app.company || '-' },
    { label: '访客人数', value: `${app.visitor_count} 人` },
    { label: '是否开车', value: app.is_driving ? '是' : '否' },
    ...(app.is_driving ? [{ label: '车牌号', value: app.license_plate || '-' }] : []),
    { label: '内部对接人', value: app.contact_person },
    { label: '对接人部门', value: getDepartmentName(app.department_id) },
    { label: '拜访起始时间', value: app.visit_start_time },
    { label: '拜访结束时间', value: app.visit_end_time },
    { label: '到访事宜', value: app.visit_purpose },
    { label: '附件', value: app.attachment_url || '-' },
  ];

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn btn-default btn-sm" onClick={() => navigate('/records')}>
          &larr; 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>记录详情</h1>
      </div>

      {/* 状态信息 */}
      <div className="apply-form" style={{ marginBottom: 24, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>审批状态：</span>
          <span className={`status-tag status-${app.approval_status}`}>
            {ApprovalStatusLabels[app.approval_status]}
          </span>
        </div>
        {app.approval_status === 'approved' && latestRecord && (
          <div>
            <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>审批时间：</span>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {formatTime(latestRecord.operated_at)}
            </span>
          </div>
        )}
        {(app.approval_status === 'returned' || app.approval_status === 'rejected') && latestRecord && (
          <div>
            <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>
              {app.approval_status === 'returned' ? '退回原因：' : '拒绝原因：'}
            </span>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {latestRecord.reason || '未填写原因'}
              {' · '}
              {formatTime(latestRecord.operated_at)}
            </span>
          </div>
        )}
        {app.pass_status && (
          <div>
            <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>通行状态：</span>
            <span className={`status-tag status-${app.pass_status}`}>
              {PassStatusLabels[app.pass_status]}
            </span>
          </div>
        )}
        <div>
          <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>创建时间：</span>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {formatTime(app.created_at)}
          </span>
        </div>
      </div>

      {/* 申请信息 */}
      <div className="apply-form" style={{ marginBottom: 24 }}>
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
          {detailRows.slice(4, app.is_driving ? 7 : 6).map((row) => (
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
          {detailRows
            .filter((r) => ['内部对接人', '对接人部门'].includes(r.label))
            .map((row) => (
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
          {detailRows
            .filter((r) => ['拜访起始时间', '拜访结束时间'].includes(r.label))
            .map((row) => (
              <div key={row.label} className="form-field">
                <label className="form-label">{row.label}</label>
                <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
                  {row.value}
                </div>
              </div>
            ))}
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">到访事宜与附件</legend>
          {detailRows
            .filter((r) => ['到访事宜', '附件'].includes(r.label))
            .map((row) => (
              <div key={row.label} className="form-field">
                <label className="form-label">{row.label}</label>
                <div
                  className={row.label === '到访事宜' ? 'form-textarea' : 'form-input'}
                  style={{
                    background: '#f5f5f5',
                    cursor: 'not-allowed',
                    ...(row.label === '到访事宜'
                      ? { minHeight: 80, whiteSpace: 'pre-wrap', padding: '8px 12px' }
                      : {}),
                  }}
                >
                  {row.value}
                </div>
              </div>
            ))}
        </fieldset>
      </div>

      {/* 审批时间线 */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
          审批流转记录
        </h2>

        {records.length === 0 ? (
          <div className="empty-state">
            <div className="empty-text">暂无审批记录</div>
          </div>
        ) : (
          <div className="timeline">
            {records.map((record, index) => {
              const isLast = index === records.length - 1;
              const opType = record.operation_type;
              const dotColor = OPERATION_COLORS[opType] || 'var(--color-border)';

              return (
                <div key={record.id} className={`timeline-item ${isLast ? 'timeline-item-last' : ''}`}>
                  {/* 时间线节点 */}
                  <div className="timeline-node">
                    <div
                      className="timeline-dot"
                      style={{ backgroundColor: dotColor }}
                    />
                    {!isLast && <div className="timeline-line" />}
                  </div>

                  {/* 时间线内容 */}
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span
                        className={`status-tag status-${opType === 'approve' ? 'approved' : opType === 'return' ? 'returned' : 'rejected'}`}
                      >
                        {OPERATION_LABELS[opType] || opType}
                      </span>
                      <span className="timeline-time">{formatTime(record.operated_at)}</span>
                    </div>

                    {/* 退回/拒绝原因 */}
                    {(opType === 'return' || opType === 'reject') && record.reason && (
                      <div className="timeline-reason">
                        <span className="timeline-reason-label">
                          {opType === 'return' ? '退回原因：' : '拒绝原因：'}
                        </span>
                        <span className="timeline-reason-text">{record.reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 通行证信息 */}
      {pass && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
            通行证信息
          </h2>
          <div className="apply-form">
            <div className="form-field">
              <label className="form-label">通行状态</label>
              <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
                <span className={`status-tag status-${pass.pass_status}`}>
                  {PassStatusLabels[pass.pass_status]}
                </span>
              </div>
            </div>
            {pass.actual_visit_time && (
              <div className="form-field">
                <label className="form-label">实际到访时间</label>
                <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
                  {formatTime(pass.actual_visit_time)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordDetail;