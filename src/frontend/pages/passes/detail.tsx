import React from 'react';
import { useParams } from 'react-router-dom';

const PassDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="page">
      <h1 className="page-title">通行证详情</h1>
      <p className="placeholder-text">通行证详情 + 确认到访（FK-20/21 实现）— ID: {id}</p>
    </div>
  );
};

export default PassDetail;
