import React from 'react';
import { useParams } from 'react-router-dom';

const RecordDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="page">
      <h1 className="page-title">记录详情</h1>
      <p className="placeholder-text">完整记录详情页面（FK-25 实现）— ID: {id}</p>
    </div>
  );
};

export default RecordDetail;
