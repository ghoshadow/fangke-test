import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api-client';
import Table, { Column } from '../../components/table/Table';
import Pagination from '../../components/table/Pagination';
import FilterForm from '../../components/filter/FilterForm';
import { useToast } from '../../components/toast';
import { PassStatusLabels } from '../../../shared/types';
import type { PaginatedData } from '../../../shared/types';

interface PassListItem {
  id: string;
  application_id: string;
  pass_status: string;
  actual_visit_time: string | null;
  created_at: string;
  visitor_name: string;
  phone: string;
  visit_start_time: string;
  visit_end_time: string;
}

const PAGE_SIZE = 20;

const FILTER_FIELDS = [
  { key: 'name', label: '访客姓名', type: 'text' as const, placeholder: '模糊搜索' },
  { key: 'phone', label: '手机号', type: 'text' as const, placeholder: '前缀匹配' },
  { key: 'id_card', label: '身份证号', type: 'text' as const, placeholder: '精确匹配' },
];

const INITIAL_FILTERS = { name: '', phone: '', id_card: '' };

const PassList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PassListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({ ...INITIAL_FILTERS });

  const fetchData = useCallback(
    async (pageNum: number, filterValues: Record<string, string>) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: pageNum,
          page_size: PAGE_SIZE,
        };
        if (filterValues.name) params.name = filterValues.name;
        if (filterValues.phone) params.phone = filterValues.phone;
        if (filterValues.id_card) params.id_card = filterValues.id_card;

        const data = await api.get<PaginatedData<PassListItem>>('/passes', params);
        setItems(data.items);
        setTotal(data.total);
      } catch (err) {
        toast.error((err as Error).message || '加载失败');
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    fetchData(page, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // 搜索
  const handleSearch = () => {
    if (page === 1) {
      fetchData(1, filters);
    } else {
      setPage(1);
    }
  };

  // 重置筛选
  const handleReset = () => {
    const empty = { ...INITIAL_FILTERS };
    setFilters(empty);
    if (page === 1) {
      fetchData(1, empty);
    } else {
      setPage(1);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const columns: Column<PassListItem>[] = [
    { key: 'visitor_name', title: '访客姓名' },
    { key: 'phone', title: '手机号' },
    {
      key: 'visit_start_time',
      title: '预约时间段',
      render: (_, record) => `${record.visit_start_time} ~ ${record.visit_end_time}`,
    },
    {
      key: 'pass_status',
      title: '通行状态',
      render: (val) => {
        const s = val as string;
        const label = PassStatusLabels[s as keyof typeof PassStatusLabels] || s;
        return <span className={`status-tag status-${s}`}>{label}</span>;
      },
    },
    {
      key: 'id',
      title: '操作',
      render: (_, record) => (
        <button
          className="btn btn-primary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/passes/${record.id}`);
          }}
        >
          查看详情
        </button>
      ),
    },
  ];

  const hasFilters = filters.name || filters.phone || filters.id_card;
  const emptyText = hasFilters ? '未找到匹配的通行证记录' : '暂无通行证记录';

  return (
    <div className="page">
      <h1 className="page-title">通行核验</h1>

      {/* 筛选表单 */}
      <FilterForm
        fields={FILTER_FIELDS}
        values={filters}
        onChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
        loading={loading}
      />

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Table<any>
        columns={columns}
        data={items}
        rowKey="id"
        loading={loading}
        emptyText={emptyText}
        onRowClick={(record) => navigate(`/passes/${record.id}`)}
      />

      {total > PAGE_SIZE && (
        <Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      )}
    </div>
  );
};

export default PassList;
