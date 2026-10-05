import { useEffect, useMemo, useRef, useState } from 'react';
import { useElection } from './useElection';
import type { RaceData, UFProgress } from './types';
import { Leaderboard } from './components/Leaderboard';
import { BrazilMap } from './components/BrazilMap';
import { UFBoard } from './components/UFBoard';
import { RunoffGauge, RemainingMeter } from './components/RunoffGauge';
import { UFTable } from './components/UFTable';
import { TrendChart } from './components/TrendChart';
import { RunoffScenarios, RunoffHistory } from './components/RunoffScenarios';
import { StateResults } from './components/StateResults';
import { CountUp } from './components/CountUp';
import { partyColor, RACES } from './tse';
import { appendTrend, loadTrend } from './trend';
import type { TrendPoint } from './trend';
import { useAlerts } from './alerts';

export default function App() {
  const { national, ufProgress, ufResults, forecast, lastUpdated, error, loading, race, setRace, turno, setTurno, refresh } =
    useElection();
  const [now, setNow] = useState(Date.now());
  // trend + alerts memory are per race AND per turno
  const seriesKey = `${race.key}:${turno}`;
  const [trend, setTrend] = useState<TrendPoint[]>(() => loadTrend(seriesKey));
  const { alerts, soundOn, toggleSound, dismiss } = useAlerts(national, ufResults, seriesKey);
  const trendRace = useRef(seriesKey);

  // heartbeat for "updated Xs ago"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // record trend points when national data changes (per-race reset)
  useEffect(() => {
    if (!national) return;
    if (trendRace.current !== seriesKey) {
      trendRace.current = seriesKey;
      setTrend(loadTrend(seriesKey));
      return; // don't record the first load of a new series into the wrong bucket
    }
    setTrend((prev) => appendTrend(prev, national, seriesKey));
  }, [national, seriesKey]);

  const ago = lastUpdated ? Math.max(0, Math.round((now - lastUpdated) / 1000)) : null;
  const leader = national?.candidates[0];
  const runnerUp = national?.candidates[1];

  const turnoutPct = useMemo(() => {
    if (!national || !national.electorsCounted) return 0;
    return (national.turnout / national.electorsCounted) * 100;
  }, [national]);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px clamp(16px, 3vw, 40px) 48px' }}>
      {/* Masthead */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 12,
          borderBottom: '1px solid var(--line)',
          paddingBottom: 14,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(22px, 3.4vw, 34px)',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Placar
          </h1>
          <div className="eyebrow" style={{ marginTop: 6 }}>
            {race.label} · {race.key === 'presidente' ? (turno === 1 ? '1º turno' : '2º turno — 25 de outubro') : '1º turno'} · dados oficiais TSE
          </div>
          {race.key === 'presidente' && leader && runnerUp && (
            <div
              className="num"
              style={{
                marginTop: 10,
                fontSize: 12,
                color: 'var(--text-dim)',
                lineHeight: 1.5,
              }}
            >
              {national.status === 'final'
                ? 'Resultado oficial: '
                : `Com ${((national.sectionsCounted / national.sectionsTotal) * 100).toFixed(1).replace('.', ',')}% das seções apuradas: `}
              <span style={{ color: partyColor(leader.party, leader.coalition), fontWeight: 600 }}>
                {leader.ballotName} {leader.percent.toFixed(2).replace('.', ',')}%
              </span>{' '}
              ×{' '}
              <span style={{ color: partyColor(runnerUp.party, runnerUp.coalition), fontWeight: 600 }}>
                {runnerUp.ballotName} {runnerUp.percent.toFixed(2).replace('.', ',')}%
              </span>{' '}
              — {national.status === 'final' ? '2º turno em 25 de outubro' : 'margem de ' +
                (leader.percent - runnerUp.percent).toFixed(2).replace('.', ',') + ' p.p.'}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={toggleSound}
            aria-pressed={soundOn}
            style={{
              background: 'transparent',
              border: `1px solid ${soundOn ? 'var(--amber)' : 'var(--line)'}`,
              color: soundOn ? 'var(--amber)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '6px 14px',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            {soundOn ? 'som: ligado' : 'som: mudo'}
          </button>
          <button
            onClick={refresh}
            style={{
              background: 'transparent',
              border: `1px solid ${loading ? 'var(--green-urna)' : 'var(--line)'}`,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '6px 14px',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            {loading ? 'atualizando…' : 'atualizar'}
          </button>
          <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
            {ago === null ? 'conectando…' : `há ${ago}s`} · a cada 30s
          </div>
        </div>
      </header>

      {/* Race tabs */}
      <nav
        role="tablist"
        aria-label="Cargos"
        style={{ display: 'flex', gap: 2, marginTop: 18, flexWrap: 'wrap' }}
      >
        {RACES.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={r.key === race.key}
            onClick={() => setRace(r.key)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${r.key === race.key ? 'var(--text)' : 'transparent'}`,
              color: r.key === race.key ? 'var(--text)' : 'var(--text-faint)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '7px 14px 9px',
              cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        ))}
        {race.key === 'presidente' && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignSelf: 'center' }}>
            {([1, 2] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTurno(t)}
                aria-pressed={turno === t}
                style={{
                  background: turno === t ? 'var(--bg-raised)' : 'transparent',
                  border: `1px solid ${turno === t ? 'var(--line)' : 'var(--line-soft)'}`,
                  color: turno === t ? 'var(--text)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  borderRadius: 3,
                }}
              >
                {t === 1 ? '1º turno' : '2º turno'}
              </button>
            ))}
          </span>
        )}
      </nav>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              role="status"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                border: '1px solid var(--amber)',
                background: 'var(--bg-raised)',
                color: 'var(--text)',
                padding: '8px 14px',
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <span>
                <span style={{ color: 'var(--amber)', marginRight: 8 }}>▲</span>
                {a.text}
                <span className="num" style={{ color: 'var(--text-faint)', marginLeft: 10, fontSize: 11 }}>
                  {new Date(a.at).toLocaleTimeString('pt-BR')}
                </span>
              </span>
              <button
                onClick={() => dismiss(a.id)}
                aria-label="Dispensar"
                style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && !national && (
        <div
          style={{
            marginTop: 24,
            padding: '14px 18px',
            border: '1px solid var(--runoff)',
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          Não foi possível carregar os dados do TSE. Verifique a conexão — o app tenta de novo a cada
          30 segundos.
        </div>
      )}

      {!national ? (
        <div style={{ marginTop: 80, textAlign: 'center', color: 'var(--text-dim)' }}>
          <div className="num" style={{ fontSize: 13 }}>
            carregando apuração…
          </div>
        </div>
      ) : (
        <main
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 380px) 1fr minmax(280px, 340px)',
            gap: 32,
            marginTop: 24,
            alignItems: 'start',
          }}
          className="dashboard"
        >
          {/* LEFT: live count + forecast */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {race.scope === 'br' && (
              <div>
                <div className="eyebrow">Liderança nacional</div>
                <div style={{ marginTop: 4 }}>
                  {leader && (
                    <span
                      style={{
                        fontSize: 42,
                        fontWeight: 800,
                        lineHeight: 1,
                        color: partyColor(leader.party, leader.coalition),
                      }}
                    >
                      {leader.ballotName}
                    </span>
                  )}
                </div>
                {leader && runnerUp && (
                  <div className="num" style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
                    +{(leader.percent - runnerUp.percent).toFixed(2).replace('.', ',')} p.p. sobre{' '}
                    {runnerUp.ballotName} ({runnerUp.party})
                  </div>
                )}
              </div>
            )}

            {race.scope === 'br' && forecast && <RunoffGauge forecast={forecast} national={national} />}
            {race.key === 'governador' && <GovernorSummary ufProgress={ufProgress} ufResults={ufResults} />}

            <RemainingMeter national={national} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
              <Stat label="Comparecimento" value={turnoutPct} suffix="%" />
              <Stat
                label="Abstenção"
                value={national.electorsCounted ? (national.abstention / national.electorsCounted) * 100 : 0}
                suffix="%"
              />
              <Stat label="Brancos" value={national.blank} />
              <Stat label="Nulos" value={national.nullVotes} />
            </div>
          </section>

          {/* CENTER: map + state board + trend — all passive */}
          <section>
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: 8,
                background: 'var(--bg-raised)',
              }}
            >
              <BrazilMap ufProgress={ufProgress} ufResults={ufResults} />
            </div>
            <div
              className="num"
              style={{
                fontSize: 10.5,
                color: 'var(--text-faint)',
                marginTop: 8,
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
              }}
            >
              <span>cor = partido líder no estado</span>
              <span>intensidade = % apurado</span>
              <span>borda verde = apurado</span>
              <span>gerado {national.generatedAt.slice(11, 19)} BRT</span>
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Placar por estado — {race.label}
              </div>
              <UFBoard ufProgress={ufProgress} ufResults={ufResults} />
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Evolução — {race.label} (história desta sessão)
              </div>
              <TrendChart points={trend} candidates={national.candidates} />
            </div>
          </section>

          {/* RIGHT: leaderboard + UF table */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                {race.scope === 'br'
                  ? 'Votação nominal — Brasil'
                  : race.key === 'governador'
                    ? 'Governador — resultado por estado'
                    : race.key === 'senador'
                      ? 'Senador — 2 mais votados por estado'
                      : 'Dep. Federal — 2 mais votados por estado'}
              </div>
              {race.scope === 'br' ? (
                <Leaderboard national={national} />
              ) : (
                <StateResults
                  ufProgress={ufProgress}
                  ufResults={ufResults}
                  kind={race.key === 'governador' ? 'runoff' : 'plurality'}
                />
              )}
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                UFs — apuração mais lenta primeiro
              </div>
              <UFTable ufProgress={ufProgress} />
            </div>
          </section>
        </main>
      )}

      {/* 2nd-round scenarios — only meaningful for the presidential race */}
      {national && race.key === 'presidente' && (
        <>
          <RunoffScenarios national={national} />
          <RunoffHistory />
        </>
      )}

      <footer
        className="num"
        style={{
          marginTop: 40,
          paddingTop: 16,
          borderTop: '1px solid var(--line)',
          fontSize: 10.5,
          color: 'var(--text-faint)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span>fonte: resultados.tse.jus.br · arquivo EA20 unificado + EA14 acompanhamento</span>
        <span>modelo de 2º turno: estimativa estatística, não é resultado oficial</span>
      </footer>
    </div>
  );
}

function Stat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
        <CountUp
          value={value}
          format={(v) =>
            suffix === '%' ? `${v.toFixed(1).replace('.', ',')}${suffix}` : v.toLocaleString('pt-BR')
          }
        />
      </div>
    </div>
  );
}

/** For governor races: how many states are decided vs going to a runoff. */
function GovernorSummary({
  ufProgress,
  ufResults,
}: {
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
}) {
  const states = [...ufProgress.values()].map((u) => {
    const leader = ufResults.get(u.uf)?.candidates[0];
    const nearDone = u.percentSections >= 99.9 || u.status === 'final';
    return { decided: !!(leader && nearDone && leader.percent > 50) };
  });
  const decided = states.filter((s) => s.decided).length;
  const total = states.length || 27;
  return (
    <div>
      <div className="eyebrow">Governadores</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, color: 'var(--green-urna)' }}>
          {decided}
        </span>
        <span className="num" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          de {total} estados decididos no 1º turno
        </span>
      </div>
      <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.5 }}>
        estados sem maioria absoluta vão a 2º turno em 25 de outubro
      </div>
    </div>
  );
}
