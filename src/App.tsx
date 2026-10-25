import { useEffect, useMemo, useRef, useState } from 'react';
import { useElection } from './useElection';
import type { RaceData, UFProgress } from './types';
import { Leaderboard } from './components/Leaderboard';
import { CanvasMap } from './components/CanvasMap';
import { UFBoard } from './components/UFBoard';
import { RunoffGauge, RemainingMeter, MarginCard } from './components/RunoffGauge';
import { UFTable } from './components/UFTable';
import { TrendChart } from './components/TrendChart';
import { RunoffScenarios, RunoffHistory } from './components/RunoffScenarios';
import { WhatsLeft } from './components/WhatsLeft';
import { Manchete } from './components/Manchete';
import { StateResults } from './components/StateResults';
import { CountUp } from './components/CountUp';
import { Duel } from './components/Duel';
import { StateDuelCycle } from './components/StateDuelCycle';
import { TVMode } from './components/TVMode';
import { Replay } from './components/Replay';
import { RACES } from './tse';
import { appendTrend, loadTrend } from './trend';
import { fetchServerTrend, mergeTrends, T2_NIGHT_START, T2_NIGHT_END } from './serverTrend';
import { archiveNational } from './archive';
import type { TrendPoint } from './trend';
import { useAlerts } from './alerts';

export default function App() {
  const { national, ufProgress, ufResults, forecast, lastUpdated, error, loading, race, setRace, turno, setTurno, refresh } =
    useElection();

  // TV mode — #/tv route, fullscreen, esc exits
  const [tv, setTv] = useState(() => window.location.hash.includes('tv'));
  useEffect(() => {
    const onHash = () => setTv(window.location.hash.includes('tv'));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.location.hash.includes('tv')) {
        window.location.hash = '';
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // trend + alerts memory are per race AND per turno
  const seriesKey = `${race.key}:${turno}`;
  const [trend, setTrend] = useState<TrendPoint[]>(() => loadTrend(seriesKey));
  const [serverTrend, setServerTrend] = useState<TrendPoint[]>([]);
  const { alerts, soundOn, toggleSound, dismiss } = useAlerts(national, ufResults, seriesKey, race.scope === 'br');
  const trendRace = useRef(seriesKey);

  // server archive: real minute-by-minute history from D1 (cross-device, survives
  // refresh). Refetched every 60s so tonight's ingested points appear live.
  useEffect(() => {
    let alive = true;
    if (seriesKey !== 'presidente:1' && seriesKey !== 'presidente:2') {
      setServerTrend([]);
      return;
    }
    const race = seriesKey === 'presidente:2' ? 'presidente2' : 'presidente';
    const load = () =>
      fetchServerTrend(race).then((pts) => {
        if (alive) setServerTrend(pts);
      });
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [seriesKey]);

  const mergedTrend = useMemo(() => {
    if (seriesKey === 'presidente:1') {
      // finished race: show only the Oct 4 counting night — drop today's
      // flat-100% points (local + any cron rows) that stretch the x-axis
      const inNight = (p: TrendPoint) =>
        p.t >= 1791133200000 && p.t <= 1791181800000; // Oct 4 14:00 → Oct 5 03:30 BRT
      return mergeTrends(
        serverTrend.filter(inNight),
        trend.filter(inNight),
      );
    }
    if (seriesKey === 'presidente:2') {
      // live counting night: pin to the official apuração window (urnas
      // close 17h, TSE publishes from 17h) so hours of pre-count zero-state
      // points don't stretch the x-axis with a flat 0% line
      const inNight = (p: TrendPoint) => p.t >= T2_NIGHT_START && p.t <= T2_NIGHT_END;
      return mergeTrends(
        serverTrend.filter(inNight),
        trend.filter(inNight),
      );
    }
    return mergeTrends(serverTrend, trend);
  }, [serverTrend, trend, seriesKey]);

  // record trend points when national data changes (per-race reset)
  useEffect(() => {
    if (!national) return;
    if (trendRace.current !== seriesKey) {
      trendRace.current = seriesKey;
      setTrend(loadTrend(seriesKey));
      return; // don't record the first load of a new series into the wrong bucket
    }
    setTrend((prev) => appendTrend(prev, national, seriesKey));
    // browsers can reach TSE even though the worker can't — archive every
    // new generation so the night is never lost (worker validates + dedupes)
    if (race.key === 'presidente') archiveNational(turno === 2 ? 'presidente2' : 'presidente', national);
  }, [national, seriesKey, race.key, turno]);

  const leader = national?.candidates[0];
  const runnerUp = national?.candidates[1];

  // touch devices get touch-gesture hints instead of keyboard/mouse ones
  const coarsePointer = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );

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
      {tv && national && (
        <TVMode national={national} ufProgress={ufProgress} ufResults={ufResults} trendPoints={mergedTrend} />
      )}
      {/* Sticky glass bar — race switcher + live status, always visible.
          On phones the nav drops to its own scrollable row (see .topbar in css) */}
      <div
        className="glass topbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
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
        </div>
        <nav role="tablist" aria-label="Cargos" style={{ display: 'flex', gap: 2, minWidth: 0 }}>
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
                whiteSpace: 'nowrap',
              }}
            >
              {r.label}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 'auto' }}>
          {race.runoff && (
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
                {race.label} · {race.runoff ? (turno === 1 ? '1º turno' : '2º turno — 25 de outubro') : '1º turno'} · dados oficiais TSE
              </span>
              <span className="num">
                {((national.sectionsCounted / national.sectionsTotal) * 100).toFixed(1).replace('.', ',')}% apurado
              </span>
            </div>

            {race.key === 'presidente' && (
              <div style={{ marginTop: 16 }}>
                <Manchete national={national} forecast={forecast} turno={turno} ufProgress={ufProgress} />
              </div>
            )}

            {race.scope === 'br' ? (
              leader && runnerUp && <Duel a={leader} b={runnerUp} runoff={!!runoffConfirmed} />
            ) : (
              /* multi-dispute race: cycle the header through each state's duel
                 instead of freezing on the aggregate (SP's pair by weight) */
              <StateDuelCycle ufResults={ufResults} ufProgress={ufProgress} resetKey={seriesKey} />
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
              <CanvasMap ufProgress={ufProgress} ufResults={ufResults} mode={race.key} turno={turno} />
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
              <span>cor = partido vencedor {race.key === 'presidente' && turno !== 2 ? 'no município' : 'no estado'}</span>
              {race.key === 'governador' && turno === 2 && <span>apagado = estado sem 2º turno</span>}
              <span>tom = vantagem (claro = disputado, forte = vitória ampla)</span>
              <span>
                {coarsePointer
                  ? 'toque num município para aproximar · arraste para mover · pinça = zoom'
                  : 'ctrl/⌘ + scroll = zoom · clique num município para aproximar · arraste para mover'}
              </span>
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
                {turno === 2 ? (
                  <MarginCard national={national} />
                ) : (
                  <RunoffGauge forecast={forecast} national={national} />
                )}
              </div>
            )}
            {race.key === 'governador' && <GovernorSummary ufProgress={ufProgress} ufResults={ufResults} turno={turno} />}
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
                  turno={turno}
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
            <div className="eyebrow" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span>Evolução — {race.label} (arquivo do servidor + esta sessão)</span>
              {race.key === 'presidente' && turno === 2 && (
                <span style={{ textTransform: 'none', letterSpacing: '.04em' }}>
                  urnas 8h–17h · apuração a partir das 17h · resultado previsto entre 20h30 e 21h (TSE) · totalização completa na madrugada
                </span>
              )}
            </div>
            <TrendChart points={mergedTrend} candidates={national.candidates} />
          </section>

          {/* SCENARIOS — presidential only. 1º turno looks forward (runoff
              scenarios); on the 2º turno the question is live: where is the
              remaining vote and who does it favor */}
          {race.key === 'presidente' && (
            <section className="enter" style={{ marginTop: 26 }}>
              {turno === 2 ? (
                <WhatsLeft national={national} ufProgress={ufProgress} ufResults={ufResults} />
              ) : (
                <RunoffScenarios national={national} />
              )}
              <RunoffHistory />
              <div style={{ marginTop: 20 }}>
                <Replay race={turno === 2 ? 'presidente2' : 'presidente'} />
              </div>
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

/** For governor races: how many states are decided vs going to a runoff.
 *  Turno 2 reads the 6260 acompanhamento — only the 6 runoff states exist
 *  there, so "total" is 6, and decided means the runoff winner is in. */
function GovernorSummary({
  ufProgress,
  ufResults,
  turno,
}: {
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
  turno: 1 | 2;
}) {
  const states = [...ufProgress.values()].map((u) => {
    const leader = ufResults.get(u.uf)?.candidates[0];
    const nearDone = u.percentSections >= 99.9 || u.status === 'final';
    return { decided: !!(leader && nearDone && leader.percent > 50) };
  });
  const decided = states.filter((s) => s.decided).length;
  const total = states.length || (turno === 2 ? 6 : 27);
  return (
    <div style={{ minWidth: 200 }}>
      <div className="eyebrow">Governadores</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
        <span className="fig" style={{ fontSize: 42, lineHeight: 1, color: 'var(--green-urna)' }}>
          {decided}
        </span>
        <span className="num" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          de {total} estados {turno === 2 ? 'em 2º turno decididos' : 'decididos no 1º turno'}
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
