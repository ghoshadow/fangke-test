import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const PAGE_SIZE = 20;

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function buildColumns(
  deptMap: Map<string, string>,
  onViewDetail: (id: string) => void,
): Column<VisitorApplication>[] {
  return [
    { key: 'visitor_name', title: '访客姓名', width: 100 },
    { key: 'phone', title: '手机号', width: 130 },
    {
      key: 'contact_person' as keyof VisitorApplication,
      title: '对接人/部门',
      width: 140,
      render: (_v, record) => {
        const deptName = deptMap.get(record.department_id) || record.department_id;
        return `${record.contact_person} / ${deptName}`;
      },
    },
    {
      key: 'visit_start_time' as keyof VisitorApplication,
      title: '拜访时间',
      width: 200,
      render: (_v, record) => `${record.visit_start_time} ~ ${record.visit_end_time}`,
    },
    {
      key: 'visitor_count',
      title: '访客人数',
      width: 80,
      render: (v) => `${v as number} 人`,
    },
    {
      key: 'license_plate',
      title: '车牌号',
      width: 100,
      render: (v) => (v as string) || '-',
    },
    {
      key: 'visit_purpose',
      title: '到访事宜',
      width: 160,
      render: (v) => {
        const text = (v as string) || '';
        if (text.length <= 15) return text;
        return <span title={text}>{truncateText(text, 15)}</span>;
      },
    },
    {
      key: 'approval_status',
      title: '审批状态',
      width: 90,
      render: (v) => {
        const s = v as string;
        return (
          <span className={`status-tag status-${s}`}>
            {ApprovalStatusLabels[s as keyof typeof ApprovalStatusLabels] || s}
          </span>
        );
      },
    },
    {
      key: 'pass_status',
      title: '通行状态',
      width: 90,
      render: (v) => {
        const s = v as string | null;
        if (!s) return <span className="status-tag">-</span>;
        return (
          <span className={`status-tag status-${s}`}>
            {PassStatusLabels[s as keyof typeof PassStatusLabels] || s}
          </span>
        );
      },
    },
    {
      key: 'id' as keyof VisitorApplication,
      title: '操作',
      width: 100,
      render: (_v, record) => (
        <button
          className="btn btn-link btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetail(record.id);
          }}
        >
          查看详情
        </button>
      ),
    },
  ];
}

const RecordList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [filterOpen, setFilterOpen] = useState(true);
  const [filterValues, setFilterValues] = useState<FilterValues>({ ...DEFAULT_VALUES });
  const [departments, setDepartments] = useState<{ label: string; value: string }[]>([]);
  const [deptMap, setDeptMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PaginatedData<VisitorApplication> | null>(null);
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const searchRef = useRef(filterValues);

  useEffect(() => {
    api.get<Department[]>('/departments')
      .then((list) => {
        setDepartments(list.map((d) => ({ label: d.name, value: d.id })));
        const map = new Map<string, string>();
        list.forEach((d) => map.set(d.id, d.name));
        setDeptMap(map);
      })
      .catch(() => { /* 部门加载失败不影响主功能 */ });
  }, []);

  const fetchRecords = useCallback(async (values: FilterValues, pageNum: number) => {
    setLoading(true);
    searchRef.current = values;
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
        page_size: PAGE_SIZE,
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
    setHasSearched(true);
    fetchRecords(filterValues, 1);
  }, [filterValues, fetchRecords]);

  const handleReset = useCallback(() => {
    const resetValues = { ...DEFAULT_VALUES };
    setFilterValues(resetValues);
    setHasSearched(true);
    fetchRecords(resetValues, 1);
  }, [fetchRecords]);

  const handlePageChange = useCallback((newPage: number) => {
    fetchRecords(searchRef.current, newPage);
  }, [fetchRecords]);

  const handleViewDetail = useCallback((id: string) => {
    navigate(`/records/${id}`);
  }, [navigate]);

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

  const columns = buildColumns(deptMap, handleViewDetail);

  const emptyText = hasSearched ? '暂无查询结果' : '请设置筛选条件后查询';

  return (
    <div className="page">
      <h1 className="page-title">记录查询</h1>

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

      <Table
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        data={(data?.items || []) as unknown as Record<string, unknown>[]}
        rowKey="id"
        loading={loading}
        emptyText={emptyText}
      />

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
