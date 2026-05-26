import React from 'react';
import { useParams } from 'react-router-dom';

const ApplyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="page">
      <h1 className="page-title">申请详情</h1>
      <p className="placeholder-text">申请详情页面 — ID: {id}（FK-12 实现）</p>
    </div>
  );
};

export default ApplyDetail;
