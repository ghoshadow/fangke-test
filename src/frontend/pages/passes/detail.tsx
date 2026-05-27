import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api-client';
import { useToast } from '../../components/toast';
import FormModal from '../../components/modal/FormModal';
import TimePicker from '../../components/form/TimePicker';
import {
  ApprovalStatusLabels,
  PassStatusLabels,
  PassStatus,
} from '@shared/types';
import type {
  VisitorApplication,
  VisitorPass,
  Department,
} from '@shared/types';

// ============================================================
// 通行证详情页 — FK-20 通行证详情查看
// 展示访客全字段信息供门卫核验身份 + 确认到访操作
// ============================================================

interface PassDetailData {
  id: string;
  application_id: string;
  pass_status: string;
  actual_visit_time: string | null;
  created_at: string;
  application: VisitorApplication;
}

const PassDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [pass, setPass] = useState<PassDetailData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [visitTime, setVisitTime] = useState('');

  // 加载通行证详情 + 部门列表
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<PassDetailData>(`/passes/${id}`),
      api.get<Department[]>('/departments').catch(() => [] as Department[]),
    ])
      .then(([detail, depts]) => {
        setPass(detail);
        setDepartments(depts);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载失败');
        toast.error(err instanceof Error ? err.message : '加载通行证详情失败');
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  // 部门名称映射
  const getDepartmentName = (deptId: string): string => {
    const dept = departments.find((d) => d.id === deptId);
    return dept?.name || deptId;
  };

  // 获取当前时间 HH:mm
  const getCurrentTime = (): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  // 打开确认到访弹窗
  const handleOpenConfirmModal = useCallback(() => {
    if (confirming) return;
    setVisitTime(getCurrentTime());
    setModalVisible(true);
  }, [confirming]);

  // 确认到访
  const handleConfirmVisit = useCallback(async () => {
    if (!id || confirming) return;
    if (!visitTime) {
      toast.error('请选择实际到访时间');
      return;
    }
    setConfirming(true);
    try {
      const updated = await api.post<VisitorPass>(`/passes/${id}/confirm`, {
        actual_visit_time: visitTime,
      });
      setPass((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pass_status: updated.pass_status,
          actual_visit_time: updated.actual_visit_time,
        };
      });
      setModalVisible(false);
      toast.success('确认到访成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '确认到访失败');
    } finally {
      setConfirming(false);
    }
  }, [id, confirming, visitTime, toast]);

  // ---- 加载中 ----
  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">通行证详情</h1>
        <div className="loading-spinner" />
      </div>
    );
  }

  // ---- 错误 ----
  if (error || !pass) {
    return (
      <div className="page">
        <h1 className="page-title">通行证详情</h1>
        <div className="empty-state">
          <div className="empty-text">{error || '通行证不存在'}</div>
          <div className="empty-action">
            <button className="btn btn-default" onClick={() => navigate('/passes')}>
              返回列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  const app = pass.application;
  const isVisited = pass.pass_status === PassStatus.VISITED;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn btn-default btn-sm" onClick={() => navigate('/passes')}>
          &larr; 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>通行证详情</h1>
      </div>

      {/* 状态信息 */}
      <div className="apply-form" style={{ marginBottom: 24, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>审批状态：</span>
          <span className={`status-tag status-${app.approval_status}`}>
            {ApprovalStatusLabels[app.approval_status]}
          </span>
        </div>
        <div>
          <span className="form-label" style={{ display: 'inline', marginRight: 8 }}>通行状态：</span>
          <span className={`status-tag status-${pass.pass_status}`}>
            {PassStatusLabels[pass.pass_status as keyof typeof PassStatusLabels] || pass.pass_status}
          </span>
        </div>
      </div>

      {/* 访客信息 */}
      <div className="apply-form">
        <fieldset className="form-section">
          <legend className="form-section-title">访客信息</legend>
          <div className="form-field">
            <label className="form-label">访客姓名</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {app.visitor_name}
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">手机号</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {app.phone}
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">身份证号</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {app.id_card || '-'}
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">访客人数</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {app.visitor_count} 人
            </div>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">车辆信息</legend>
          <div className="form-field">
            <label className="form-label">车牌号</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {app.license_plate || '-'}
            </div>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">预约信息</legend>
          <div className="form-field">
            <label className="form-label">预约时间段</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {app.visit_start_time} ~ {app.visit_end_time}
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">内部对接人</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {app.contact_person}
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">对接人部门</label>
            <div className="form-input" style={{ background: '#f5f5f5', cursor: 'not-allowed' }}>
              {getDepartmentName(app.department_id)}
            </div>
          </div>
        </fieldset>
      </div>

      {/* 底部操作区 */}
      <div style={{ marginTop: 24, padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
        {isVisited ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span className="status-tag status-visited" style={{ fontSize: 14, padding: '6px 16px' }}>
              已确认到访
            </span>
            {pass.actual_visit_time ? (
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                实际到访时间：{pass.actual_visit_time}
              </span>
            ) : (
              <span style={{ color: '#e65100', fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                数据异常：已到访但缺少实际到访时间
              </span>
            )}
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleOpenConfirmModal}
            disabled={confirming}
          >
            {confirming ? '确认中...' : '确认到访'}
          </button>
        )}
      </div>

      {/* 确认到访弹窗 */}
      <FormModal
        visible={modalVisible}
        title="确认到访"
        onSubmit={handleConfirmVisit}
        onCancel={() => !confirming && setModalVisible(false)}
        submitText="提交"
        loading={confirming}
      >
        <TimePicker
          label="实际到访时间"
          required
          value={visitTime}
          onChange={setVisitTime}
          disabled={confirming}
        />
      </FormModal>
    </div>
  );
};

export default PassDetail;
