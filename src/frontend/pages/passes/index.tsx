import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api-client';
import Table, { Column } from '../../components/table/Table';
import Pagination from '../../components/table/Pagination';
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

const PassList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PassListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const data = await api.get<PaginatedData<PassListItem>>('/passes', {
          page: pageNum,
          page_size: PAGE_SIZE,
        });
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
    fetchData(page);
  }, [page, fetchData]);

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

  return (
    <div className="page">
      <h1 className="page-title">通行核验</h1>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Table<any>
        columns={columns}
        data={items}
        rowKey="id"
        loading={loading}
        emptyText="暂无通行证记录"
        onRowClick={(record) => navigate(`/passes/${record.id}`)}
      />

      {total > PAGE_SIZE && (
        <Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      )}
    </div>
  );
};

export default PassList;
