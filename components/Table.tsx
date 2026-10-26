'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState, ScrollBox } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /** value used for sorting; defaults to row[key] */
  sort?: (row: T) => number | string | null | undefined;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  title?: string;
  className?: string;
}

type Dir = 'asc' | 'desc';

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
  emptyTitle = 'No rows',
  emptyBody,
  dense,
  rowClassName,
  caption,
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: Dir };
  emptyTitle?: string;
  emptyBody?: ReactNode;
  dense?: boolean;
  rowClassName?: (row: T) => string;
  caption?: string;
  maxHeight?: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | undefined>(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sort ?? ((r: T) => (r as Record<string, unknown>)[col.key] as number | string | null | undefined);
    const out = [...rows];
    out.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, sort, columns]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : undefined) : { key, dir: 'desc' }));

  if (!rows.length) return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;

  return (
    <ScrollBox style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className={`table ${dense ? 'dense' : ''} ${onRowClick ? 'clickable' : ''}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = c.sortable !== false;
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={`${c.align ? `ta-${c.align}` : ''} ${c.className ?? ''}`}
                  title={c.title}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {sortable ? (
                    <button type="button" className="th-btn" onClick={() => toggle(c.key)}>
                      {c.header}
                      <span className="sort-ind" aria-hidden>
                        {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={rowKey(r, i)}
              className={rowClassName?.(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(r);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${c.align ? `ta-${c.align}` : ''} ${c.className ?? ''}`}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollBox>
  );
}
