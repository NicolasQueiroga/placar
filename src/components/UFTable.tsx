import { memo, useMemo } from 'react';
import type { UFProgress } from '../types';

/** Ranked list of states by counting progress — who's slow, who's done. */
export const UFTable = memo(function UFTable({
  ufProgress,
}: {
  ufProgress: Map<string, UFProgress>;
}) {
  const rows = useMemo(
    () => [...ufProgress.values()].sort((a, b) => a.percentSections - b.percentSections),
    [ufProgress],
  );

  return (
    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr className="eyebrow" style={{ textAlign: 'left' }}>
            <th style={{ padding: '6px 0', fontWeight: 500 }}>UF</th>
            <th style={{ fontWeight: 500 }}>apurado</th>
            <th style={{ fontWeight: 500, textAlign: 'right' }}>eleitores apurados</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr
              key={u.uf}
              style={{
                borderTop: '1px solid var(--line-soft)',
                color: 'var(--text-dim)',
              }}
            >
              <td style={{ padding: '5px 0' }}>
                <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>
                  {u.uf}
                </span>
                {u.status === 'final' && (
                  <span style={{ color: 'var(--green-urna)', marginLeft: 6, fontSize: 10 }}>●</span>
                )}
              </td>
              <td>
                <span
                  className="num"
                  style={{
                    color:
                      u.percentSections > 90
                        ? 'var(--green-urna)'
                        : u.percentSections < 30
                          ? 'var(--runoff)'
                          : 'inherit',
                  }}
                >
                  {u.percentSections.toFixed(1).replace('.', ',')}%
                </span>
              </td>
              <td className="num" style={{ textAlign: 'right' }}>
                {u.electorsCounted.toLocaleString('pt-BR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
