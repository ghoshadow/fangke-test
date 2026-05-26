import React from 'react';

// ============================================================
// Table — 数据表格
// ============================================================

export interface Column<T> {
  key: string;
  title: string;
  width?: string | number;
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: keyof T | ((record: T) => string);
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (record: T) => void;
}

function Table<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  loading,
  emptyText = '暂无数据',
  onRowClick,
}: TableProps<T>) {
  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === 'function') return rowKey(record);
    return String(record[rowKey] ?? index);
  };

  if (loading) {
    return (
      <div className="table-empty">
        <div className="loading-spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="table-empty">
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((record, index) => (
            <tr
              key={getRowKey(record, index)}
              className={onRowClick ? 'table-row clickable' : 'table-row'}
              onClick={() => onRowClick?.(record)}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render
                    ? col.render(record[col.key], record, index)
                    : (record[col.key] as React.ReactNode) ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
