import React from 'react';

// ============================================================
// Pagination — 分页器
// ============================================================

interface PaginationProps {
  current: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ current, total, pageSize, onChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  const getPageNumbers = (): (number | '...')[] => {
    const pages: (number | '...')[] = [];
    const delta = 2;

    const left = Math.max(2, current - delta);
    const right = Math.min(totalPages - 1, current + delta);

    pages.push(1);
    if (left > 2) pages.push('...');

    for (let i = left; i <= right; i++) {
      pages.push(i);
    }

    if (right < totalPages - 1) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  return (
    <div className="pagination">
      <button
        className="pagination-btn"
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
      >
        ‹ 上一页
      </button>
      <div className="pagination-pages">
        {getPageNumbers().map((page, idx) =>
          page === '...' ? (
            <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
              ...
            </span>
          ) : (
            <button
              key={page}
              className={`pagination-btn ${page === current ? 'active' : ''}`}
              onClick={() => onChange(page)}
            >
              {page}
            </button>
          ),
        )}
      </div>
      <button
        className="pagination-btn"
        disabled={current >= totalPages}
        onClick={() => onChange(current + 1)}
      >
        下一页 ›
      </button>
      <span className="pagination-info">
        共 {total} 条
      </span>
    </div>
  );
};

export default Pagination;
