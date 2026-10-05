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
import { Manchete } from './components/Manchete';
import { StateResults } from './components/StateResults';
import { CountUp } from './components/CountUp';
import { Duel } from './components/Duel';
import { RACES } from './tse';
import { appendTrend, loadTrend } from './trend';
import { fetchServerTrend, mergeTrends } from './serverTrend';
import type { TrendPoint } from './trend';
import { useAlerts } from './alerts';

export default function App() {
  const { national, ufProgress, ufResults, forecast, lastUpdated, error, loading, race, setRace, turno, setTurno, refresh } =
    useElection();
  // trend + alerts memory are per race AND per turno
  const seriesKey = `${race.key}:${turno}`;
  const [trend, setTrend] = useState<TrendPoint[]>(() => loadTrend(seriesKey));
  const [serverTrend, setServerTrend] = useState<TrendPoint[]>([]);
  const { alerts, soundOn, toggleSound, dismiss } = useAlerts(national, ufResults, seriesKey);
  const trendRace = useRef(seriesKey);

  // server archive: real minute-by-minute history from D1 (cross-device, survives refresh)
  useEffect(() => {
    let alive = true;
    if (seriesKey === 'presidente:1') {
      fetchServerTrend().then((pts) => {
        if (alive) setServerTrend(pts);
      });
    } else {
      setServerTrend([]);
    }
    return () => {
      alive = false;
    };
  }, [seriesKey]);

  const mergedTrend = useMemo(
    () => mergeTrends(serverTrend, trend),
    [serverTrend, trend],
  );

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

  const leader = national?.candidates[0];
  const runnerUp = national?.candidates[1];

  const turnoutPct = useMemo(() => {
    if (!national || !national.electorsCounted) return 0;
    return (national.turnout / national.electorsCounted) * 100;
  }, [national]);

  const runoffConfirmed =
    race.key === 'presidente' &&
    turno === 1 &&
    national?.status === 'final' &&
    leader &&
    leader.percent < 50;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 clamp(16px, 3vw, 40px) 48px' }}>
      {/* Sticky glass bar — race switcher + live status, always visible */}
      <div
        className="glass"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 0',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="live-dot" aria-hidden />
          <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', fontSize: 15 }}>
            Placar
          </span>
          <nav role="tablist" aria-label="Cargos" style={{ display: 'flex', gap: 2 }}>
            {RACES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={r.key === race.key}
                onClick={() => setRace(r.key)}
                className="tab"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${r.key === race.key ? 'var(--text)' : 'transparent'}`,
                  color: r.key === race.key ? 'var(--text)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  padding: '6px 12px 8px',
                  cursor: 'pointer',
                }}
              >
                {r.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {race.key === 'presidente' && (
            <span style={{ display: 'flex', gap: 2 }}>
              {([1, 2] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTurno(t)}
                  aria-pressed={turno === t}
                  style={{
                    background: turno === t ? 'var(--bg-hover)' : 'transparent',
                    border: `1px solid ${turno === t ? 'var(--line)' : 'var(--line-soft)'}`,
                    color: turno === t ? 'var(--text)' : 'var(--text-faint)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    borderRadius: 3,
                  }}
                >
                  {t === 1 ? '1º' : '2º'}
                </button>
              ))}
            </span>
          )}
          <button
            onClick={toggleSound}
            aria-pressed={soundOn}
            className="ctl"
            style={{ ['--c' as string]: soundOn ? 'var(--amber)' : 'var(--text-faint)' }}
          >
            {soundOn ? 'som on' : 'som off'}
          </button>
          <UpdatedAgo at={lastUpdated} loading={loading} onRefresh={refresh} />
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              role="status"
              className="enter"
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
          15 segundos.
        </div>
      )}

      {!national ? (
        <div style={{ marginTop: 120, textAlign: 'center', color: 'var(--text-dim)' }}>
          <div className="num" style={{ fontSize: 13 }}>
            carregando apuração…
          </div>
        </div>
      ) : (
        <>
          {/* HERO — the front page: kick, manchete, duel */}
          <section className="enter" style={{ paddingBottom: 26, borderBottom: '1px solid var(--line)' }}>
            <div className="eyebrow" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>
                {race.label} · {race.key === 'presidente' ? (turno === 1 ? '1º turno' : '2º turno — 25 de outubro') : '1º turno'} · dados oficiais TSE
              </span>
              <span className="num">
                {((national.sectionsCounted / national.sectionsTotal) * 100).toFixed(1).replace('.', ',')}% apurado
              </span>
            </div>

            {race.key === 'presidente' && (
              <div style={{ marginTop: 16 }}>
                <Manchete national={national} forecast={forecast} />
              </div>
            )}

            {leader && runnerUp && (
              <Duel a={leader} b={runnerUp} runoff={!!runoffConfirmed} />
            )}
          </section>

          {/* MAP — full width, the visual anchor */}
          <section className="enter" style={{ marginTop: 26 }}>
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
          </section>

          {/* STRIP — counting meter + key stats in one hairline row */}
          <section
            className="enter"
            style={{
              marginTop: 26,
              paddingTop: 18,
              borderTop: '1px solid var(--line)',
              display: 'flex',
              gap: 'clamp(20px, 4vw, 56px)',
              flexWrap: 'wrap',
              alignItems: 'baseline',
            }}
          >
            {race.scope === 'br' && forecast && (
              <div style={{ minWidth: 200, flex: '0 1 auto' }}>
                <RunoffGauge forecast={forecast} national={national} />
              </div>
            )}
            {race.key === 'governador' && <GovernorSummary ufProgress={ufProgress} ufResults={ufResults} />}
            <RemainingMeter national={national} />
            <Stat label="Comparecimento" value={turnoutPct} suffix="%" />
            <Stat
              label="Abstenção"
              value={national.electorsCounted ? (national.abstention / national.electorsCounted) * 100 : 0}
              suffix="%"
            />
            <Stat label="Brancos" value={national.blank} />
            <Stat label="Nulos" value={national.nullVotes} />
          </section>

          {/* BOARD — state scoreboard, full width */}
          <section className="enter" style={{ marginTop: 26 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Placar por estado — {race.label}
            </div>
            <UFBoard ufProgress={ufProgress} ufResults={ufResults} />
          </section>

          {/* TWO COLUMNS — results detail + slowest UFs */}
          <section
            className="enter"
            style={{
              marginTop: 26,
              paddingTop: 20,
              borderTop: '1px solid var(--line)',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
              gap: 'clamp(20px, 4vw, 48px)',
            }}
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
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

          {/* TREND — full width */}
          <section className="enter" style={{ marginTop: 26 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Evolução — {race.label} (arquivo do servidor + esta sessão)
            </div>
            <TrendChart points={mergedTrend} candidates={national.candidates} />
          </section>

          {/* SCENARIOS — presidential only */}
          {race.key === 'presidente' && (
            <section className="enter" style={{ marginTop: 26 }}>
              <RunoffScenarios national={national} />
              <RunoffHistory />
            </section>
          )}
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
        <span>fonte: resultados.tse.jus.br · feed próprio com snapshots a cada 2 min</span>
        <span>modelo de 2º turno: estimativa estatística, não é resultado oficial</span>
      </footer>
    </div>
  );
}

function Stat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div className="eyebrow">{label}</div>
      <div className="fig" style={{ fontSize: 26, marginTop: 2 }}>
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
    <div style={{ minWidth: 200 }}>
      <div className="eyebrow">Governadores</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
        <span className="fig" style={{ fontSize: 42, lineHeight: 1, color: 'var(--green-urna)' }}>
          {decided}
        </span>
        <span className="num" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          de {total} estados decididos no 1º turno
        </span>
      </div>
    </div>
  );
}

/** Self-ticking "updated Xs ago" — isolates the 1s re-render from the dashboard. */
function UpdatedAgo({ at, loading, onRefresh }: { at: number | null; loading: boolean; onRefresh: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ago = at ? Math.max(0, Math.round((now - at) / 1000)) : null;
  return (
    <button
      onClick={onRefresh}
      className="ctl"
      style={{ ['--c' as string]: loading ? 'var(--green-urna)' : 'var(--text-faint)' }}
    >
      {ago === null ? 'conectando…' : `há ${ago}s`}
    </button>
  );
}
