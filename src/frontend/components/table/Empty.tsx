import React from 'react';

// ============================================================
// Empty — 空状态占位
// ============================================================

interface EmptyProps {
  text?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const Empty: React.FC<EmptyProps> = ({
  text = '暂无数据',
  icon,
  action,
}) => {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || '📭'}</div>
      <p className="empty-text">{text}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
};

export default Empty;
