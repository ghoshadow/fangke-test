import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api-client';
import { useToast } from '../../components/toast';
import { FilterForm } from '../../components/filter';
import { Table, Pagination } from '../../components/table';
import type { Column } from '../../components/table';
import type { VisitorApplication, Department, PaginatedData } from '@shared/types';
import { ApprovalStatusLabels, PassStatusLabels } from '@shared/types';

type FilterValues = Record<string, string>;

const DEFAULT_VALUES: FilterValues = {
  visitor_name: '',
  phone: '',
  id_card: '',
  contact_person: '',
  department: '',
  company: '',
  visit_date_from: '',
  visit_date_to: '',
  license_plate: '',
  approval_status: '',
  pass_status: '',
};

const STATUS_OPTIONS = [
  { label: '待审批', value: 'pending' },
  { label: '已同意', value: 'approved' },
  { label: '已退回', value: 'returned' },
  { label: '已拒绝', value: 'rejected' },
];

const PASS_STATUS_OPTIONS = [
  { label: '未到访', value: 'not_visited' },
  { label: '已到访', value: 'visited' },
];

const TABLE_COLUMNS: Column<VisitorApplication>[] = [
  { key: 'visitor_name', title: '访客姓名', width: 100 },
  { key: 'phone', title: '手机号', width: 130 },
  { key: 'company', title: '访客单位', width: 160,
    render: (v) => (v as string) || '-',
  },
  { key: 'contact_person', title: '内部对接人', width: 100 },
  { key: 'approval_status', title: '审批状态', width: 90,
    render: (v) => {
      const s = v as string;
      return <span className={`status-tag status-${s}`}>{ApprovalStatusLabels[s as keyof typeof ApprovalStatusLabels] || s}</span>;
    },
  },
  { key: 'pass_status', title: '通行状态', width: 90,
    render: (v) => {
      const s = v as string | null;
      if (!s) return <span className="status-tag">-</span>;
      return <span className={`status-tag status-${s}`}>{PassStatusLabels[s as keyof typeof PassStatusLabels] || s}</span>;
    },
  },
  {
    key: 'visit_start_time', title: '拜访时间', width: 160,
    render: (_v, record) => {
      const start = record.visit_start_time || '';
      const end = record.visit_end_time || '';
      return `${start} ~ ${end}`;
    },
  },
];

const RecordList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [filterOpen, setFilterOpen] = useState(true);
  const [filterValues, setFilterValues] = useState<FilterValues>({ ...DEFAULT_VALUES });
  const [departments, setDepartments] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PaginatedData<VisitorApplication> | null>(null);
  const [page, setPage] = useState(1);

  // 加载部门列表
  useEffect(() => {
    api.get<Department[]>('/departments')
      .then((list) => setDepartments(list.map((d) => ({ label: d.name, value: d.id }))))
      .catch(() => { /* 部门加载失败不影响主功能 */ });
  }, []);

  // 初始加载
  useEffect(() => {
    fetchRecords(filterValues, 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecords = useCallback(async (values: FilterValues, pageNum: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        name: values.visitor_name || undefined,
        phone: values.phone || undefined,
        id_card: values.id_card || undefined,
        contact_person: values.contact_person || undefined,
        department: values.department || undefined,
        company: values.company || undefined,
        date_from: values.visit_date_from || undefined,
        date_to: values.visit_date_to || undefined,
        license_plate: values.license_plate || undefined,
        approval_status: values.approval_status || undefined,
        pass_status: values.pass_status || undefined,
        page: pageNum,
        page_size: 20,
      };
      const result = await api.get<PaginatedData<VisitorApplication>>('/records', params);
      setData(result);
      setPage(pageNum);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSearch = useCallback(() => {
    fetchRecords(filterValues, 1);
  }, [filterValues, fetchRecords]);

  const handleReset = useCallback(() => {
    setFilterValues({ ...DEFAULT_VALUES });
    fetchRecords(DEFAULT_VALUES, 1);
  }, [fetchRecords]);

  const handlePageChange = useCallback((newPage: number) => {
    fetchRecords(filterValues, newPage);
  }, [filterValues, fetchRecords]);

  const filterFields = [
    { key: 'visitor_name', label: '访客姓名', type: 'text' as const, placeholder: '模糊搜索' },
    { key: 'phone', label: '手机号', type: 'text' as const, placeholder: '精确匹配' },
    { key: 'id_card', label: '身份证号', type: 'text' as const, placeholder: '精确匹配' },
    { key: 'contact_person', label: '内部对接人', type: 'text' as const, placeholder: '模糊搜索' },
    { key: 'department', label: '对接人部门', type: 'select' as const, placeholder: '全部', options: departments },
    { key: 'company', label: '访客单位', type: 'text' as const, placeholder: '模糊搜索' },
    { key: 'visit_date', label: '拜访时间段', type: 'daterange' as const },
    { key: 'license_plate', label: '车牌号', type: 'text' as const, placeholder: '模糊搜索' },
    { key: 'approval_status', label: '审批状态', type: 'select' as const, placeholder: '全部', options: STATUS_OPTIONS },
    { key: 'pass_status', label: '通行状态', type: 'select' as const, placeholder: '全部', options: PASS_STATUS_OPTIONS },
  ];

  return (
    <div className="page">
      <h1 className="page-title">记录查询</h1>

      {/* 筛选区（可折叠） */}
      <div className="filter-section">
        <div
          className={`filter-section-header ${filterOpen ? 'expanded' : ''}`}
          onClick={() => setFilterOpen(!filterOpen)}
        >
          <span className="filter-section-title">筛选条件</span>
          <span className={`filter-toggle ${filterOpen ? 'expanded' : ''}`}>▼</span>
        </div>
        {filterOpen && (
          <div className="filter-section-body">
            <FilterForm
              fields={filterFields}
              values={filterValues}
              onChange={handleFilterChange}
              onSearch={handleSearch}
              onReset={handleReset}
              loading={loading}
            />
          </div>
        )}
      </div>

      {/* 结果列表 */}
      <Table
        columns={TABLE_COLUMNS as unknown as Column<Record<string, unknown>>[]}
        data={(data?.items || []) as unknown as Record<string, unknown>[]}
        rowKey="id"
        loading={loading}
        emptyText="暂无记录"
        onRowClick={(record) => navigate(`/records/${record.id}`)}
      />

      {/* 分页 */}
      {data && (
        <Pagination
          current={data.page}
          total={data.total}
          pageSize={data.page_size}
          onChange={handlePageChange}
        />
      )}
    </div>
  );
};

export default RecordList;