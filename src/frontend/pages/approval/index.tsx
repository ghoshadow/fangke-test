import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getSessionId } from '../../lib/api-client';
import Table, { Column } from '../../components/table/Table';
import Pagination from '../../components/table/Pagination';
import FilterForm from '../../components/filter/FilterForm';
import ConfirmModal from '../../components/modal/ConfirmModal';
import FormModal from '../../components/modal/FormModal';
import { useToast } from '../../components/toast';
import { ApprovalStatus, ApprovalStatusLabels } from '../../../shared/types';
import type { VisitorApplication, PaginatedData } from '../../../shared/types';

type TabKey = 'pending' | 'created' | 'processed';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '待我处理' },
  { key: 'created', label: '我创建的' },
  { key: 'processed', label: '我已处理' },
];

const EMPTY_TEXTS: Record<TabKey, string> = {
  pending: '暂无待审批申请',
  created: '暂无申请记录',
  processed: '暂无申请记录',
};

const PAGE_SIZE = 20;

const FILTER_FIELDS = [
  { key: 'name', label: '访客姓名', type: 'text' as const, placeholder: '模糊搜索' },
  { key: 'phone', label: '手机号', type: 'text' as const, placeholder: '精确匹配' },
  { key: 'date_from', label: '开始日期', type: 'date' as const },
  { key: 'date_to', label: '结束日期', type: 'date' as const },
  {
    key: 'status',
    label: '审批状态',
    type: 'select' as const,
    placeholder: '全部',
    options: [
      { label: '待审批', value: 'pending' },
      { label: '已同意', value: 'approved' },
      { label: '已退回', value: 'returned' },
      { label: '已拒绝', value: 'rejected' },
    ],
  },
];

const INITIAL_FILTERS = { name: '', phone: '', date_from: '', date_to: '', status: '' };

interface ConfirmState {
  visible: boolean;
  type: 'approve' | 'return' | 'reject';
  application: VisitorApplication | null;
  loading: boolean;
  reason: string;
}

const initConfirm = (): ConfirmState => ({
  visible: false,
  type: 'approve',
  application: null,
  loading: false,
  reason: '',
});

const ApprovalManagement: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const sessionId = getSessionId();

  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<VisitorApplication[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({ ...INITIAL_FILTERS });
  const [confirm, setConfirm] = useState<ConfirmState>(initConfirm());
  const [operatingId, setOperatingId] = useState<string | null>(null);

  // 加载数据
  const fetchData = useCallback(
    async (tab: TabKey, pageNum: number, filterValues: Record<string, string>) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          session_id: sessionId,
          page: pageNum,
          page_size: PAGE_SIZE,
        };
        if (filterValues.name) params.name = filterValues.name;
        if (filterValues.phone) params.phone = filterValues.phone;
        if (filterValues.date_from) params.date_from = filterValues.date_from;
        if (filterValues.date_to) params.date_to = filterValues.date_to;
        if (filterValues.status) params.status = filterValues.status;

        const data = await api.get<PaginatedData<VisitorApplication>>(
          `/approvals/${tab}`,
          params,
        );
        setItems(data.items);
        setTotal(data.total);
      } catch (err) {
        toast.error((err as Error).message || '加载失败');
      } finally {
        setLoading(false);
      }
    },
    [sessionId, toast],
  );

  // Tab 或 page 变化时重新加载
  useEffect(() => {
    fetchData(activeTab, page, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page]);

  // 切换 Tab
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setFilters({ ...INITIAL_FILTERS });
    setPage(1);
  };

  // 搜索
  const handleSearch = () => {
    if (page === 1) {
      fetchData(activeTab, 1, filters);
    } else {
      setPage(1);
    }
  };

  // 重置筛选
  const handleReset = () => {
    const empty = { ...INITIAL_FILTERS };
    setFilters(empty);
    if (page === 1) {
      fetchData(activeTab, 1, empty);
    } else {
      setPage(1);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // 同意
  const handleApprove = async () => {
    const app = confirm.application;
    if (!app) return;
    setConfirm((prev) => ({ ...prev, loading: true }));
    try {
      await api.post(`/approvals/${app.id}/approve`, { operator_session_id: sessionId });
      toast.success('审批通过');
      setConfirm(initConfirm());
      setOperatingId(null);
      fetchData(activeTab, page, filters);
    } catch (err) {
      toast.error((err as Error).message || '操作失败');
      setConfirm((prev) => ({ ...prev, loading: false }));
    }
  };

  // 退回/拒绝
  const handleReturnOrReject = async () => {
    const app = confirm.application;
    if (!app) return;
    if (!confirm.reason.trim()) {
      toast.error(confirm.type === 'return' ? '退回必须填写原因' : '拒绝必须填写原因');
      return;
    }
    setConfirm((prev) => ({ ...prev, loading: true }));
    try {
      const action = confirm.type === 'return' ? 'return' : 'reject';
      await api.post(`/approvals/${app.id}/${action}`, {
        operator_session_id: sessionId,
        reason: confirm.reason.trim(),
      });
      toast.success(confirm.type === 'return' ? '退回成功' : '已拒绝该申请');
      setConfirm(initConfirm());
      setOperatingId(null);
      fetchData(activeTab, page, filters);
    } catch (err) {
      toast.error((err as Error).message || '操作失败');
      setConfirm((prev) => ({ ...prev, loading: false }));
    }
  };

  // 打开确认弹窗
  const openConfirm = (type: ConfirmState['type'], application: VisitorApplication) => {
    setOperatingId(application.id);
    setConfirm({ visible: true, type, application, loading: false, reason: '' });
  };

  // 表格列定义
  const columns: Column<VisitorApplication>[] = [
    { key: 'visitor_name', title: '访客姓名' },
    { key: 'phone', title: '手机号' },
    { key: 'contact_person', title: '对接人' },
    {
      key: 'visit_start_time',
      title: '拜访时间',
      render: (_, record) => `${record.visit_start_time} ~ ${record.visit_end_time}`,
    },
    {
      key: 'visit_purpose',
      title: '到访事宜',
      render: (val) => {
        const text = val as string;
        return text.length > 15 ? `${text.slice(0, 15)}...` : text;
      },
    },
    {
      key: 'approval_status',
      title: '审批状态',
      render: (val) => {
        const s = val as string;
        return <span className={`status-tag status-${s}`}>{ApprovalStatusLabels[s as keyof typeof ApprovalStatusLabels] || s}</span>;
      },
    },
    {
      key: 'id',
      title: '操作',
      render: (_, record) => {
        // 待我处理 tab → 同意/退回/拒绝
        if (activeTab === 'pending') {
          const isOperating = operatingId === record.id;
          return (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={isOperating}
                onClick={(e) => { e.stopPropagation(); openConfirm('approve', record); }}
              >
                {isOperating ? '处理中...' : '同意'}
              </button>
              <button
                className="btn btn-sm"
                style={{ borderColor: 'var(--color-warning)', color: '#d46b08' }}
                disabled={isOperating}
                onClick={(e) => { e.stopPropagation(); openConfirm('return', record); }}
              >
                退回
              </button>
              <button
                className="btn btn-danger btn-sm"
                disabled={isOperating}
                onClick={(e) => { e.stopPropagation(); openConfirm('reject', record); }}
              >
                拒绝
              </button>
            </div>
          );
        }

        // 我创建的 + 已退回 → 编辑
        if (activeTab === 'created' && record.approval_status === ApprovalStatus.RETURNED) {
          return (
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/apply/${record.id}`); }}>
              编辑
            </button>
          );
        }

        // 我创建的(其他状态) + 我已处理 → 查看
        return (
          <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/apply/${record.id}`); }}>
            查看
          </button>
        );
      },
    },
  ];

  return (
    <div className="page">
      <h1 className="page-title">审批管理</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 筛选表单 */}
      <FilterForm
        fields={FILTER_FIELDS}
        values={filters}
        onChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
        loading={loading}
      />

      {/* 数据表格 */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Table<any>
        columns={columns}
        data={items}
        rowKey="id"
        loading={loading}
        emptyText={EMPTY_TEXTS[activeTab]}
      />

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      )}

      {/* 同意确认弹窗 */}
      <ConfirmModal
        visible={confirm.visible && confirm.type === 'approve'}
        title="确认同意"
        content={`确认同意「${confirm.application?.visitor_name ?? ''}」的访客申请？同意后将自动生成通行证。`}
        confirmText="同意"
        onConfirm={handleApprove}
        onCancel={() => { setConfirm(initConfirm()); setOperatingId(null); }}
        loading={confirm.loading}
      />

      {/* 退回/拒绝原因弹窗 */}
      <FormModal
        visible={confirm.visible && (confirm.type === 'return' || confirm.type === 'reject')}
        title={confirm.type === 'return' ? '退回申请' : '拒绝申请'}
        submitText={confirm.type === 'return' ? '确认退回' : '确认拒绝'}
        onSubmit={handleReturnOrReject}
        onCancel={() => { setConfirm(initConfirm()); setOperatingId(null); }}
        loading={confirm.loading}
        submitDisabled={!confirm.reason.trim()}
      >
        <div className="form-field">
          <label className="form-label">
            <span className="required-mark">*</span>
            {confirm.type === 'return' ? '退回原因' : '拒绝原因'}
          </label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder={`请输入${confirm.type === 'return' ? '退回' : '拒绝'}原因`}
            value={confirm.reason}
            onChange={(e) => setConfirm((prev) => ({ ...prev, reason: e.target.value }))}
            maxLength={200}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {confirm.reason.length}/200
          </span>
        </div>
        {confirm.application && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
            {confirm.application.visitor_name} - {confirm.application.phone}
          </p>
        )}
      </FormModal>
    </div>
  );
};

export default ApprovalManagement;