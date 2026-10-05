import { useEffect, useRef, useState, memo } from 'react';
import * as echarts from 'echarts';
import type { RaceData, UFProgress } from '../types';
import { partyColor } from '../tse';

let geoRegistered = false;
/** ECharts matches data to regions by the GeoJSON feature `name` ("Acre"),
 *  not the sigla ("AC"). Build the translation once. */
const siglaToName = new Map<string, string>();

async function ensureGeo(): Promise<void> {
  if (geoRegistered) return;
  const res = await fetch('/br-states.geojson');
  const geo = await res.json();
  for (const f of geo.features) {
    if (f.properties?.sigla) siglaToName.set(f.properties.sigla.toUpperCase(), f.properties.name);
  }
  echarts.registerMap('brasil', geo);
  geoRegistered = true;
}

const pct1 = (v: number) => v.toFixed(1).replace('.', ',');
const pct0 = (v: number) => v.toFixed(0);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Passive totalization map — nothing requires interaction:
 *  color     = party of the state's leading candidate
 *  intensity = share of sections counted (faded = early, solid = near done)
 *  label     = sigla + leader's %
 *  border    = green when the state is final
 * Hover tooltip is a bonus, never a requirement.
 */
export const BrazilMap = memo(function BrazilMap({
  ufProgress,
  ufResults,
}: {
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    ensureGeo().then(() => {
      if (disposed || !elRef.current) return;
      chartRef.current = echarts.init(elRef.current, undefined, { renderer: 'svg' });
      setReady(true);
    });
    const onResize = () => chartRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;

    const data = [...ufProgress.values()].map((u) => {
      const res = ufResults.get(u.uf);
      const leader = res?.candidates[0];
      const runnerUp = res?.candidates[1];
      const frac = Math.min(1, u.percentSections / 100);
      const name = siglaToName.get(u.uf) ?? u.uf;

      const item: Record<string, unknown> = {
        name,
        itemStyle: leader
          ? {
              areaColor: partyColor(leader.party, leader.coalition),
              opacity: 0.35 + 0.65 * frac,
              borderColor: u.status === 'final' ? '#35c26a' : '#17140f',
              borderWidth: u.status === 'final' ? 1.2 : 0.8,
            }
          : { areaColor: '#2a251c', opacity: 1 },
        _label: leader ? `${u.uf} ${pct0(leader.percent)}%` : u.uf,
        _tip: leader
          ? `<b>${u.uf}</b> · ${pct1(u.percentSections)}% seções${u.status === 'final' ? ' · <span style="color:#35c26a">final</span>' : ''}<br/>${esc(leader.ballotName)} (${esc(leader.party)}) <b>${pct1(leader.percent)}%</b>${runnerUp ? `<br/>${esc(runnerUp.ballotName)} (${esc(runnerUp.party)}) ${pct1(runnerUp.percent)}%` : ''}`
          : `<b>${u.uf}</b> · aguardando dados`,
      };
      return item;
    });

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#201c15',
        borderColor: '#363024',
        textStyle: { color: '#efe8da', fontFamily: 'IBM Plex Mono', fontSize: 12 },
        formatter: (p: { data?: { _tip?: string } }) => p.data?._tip ?? '',
      },
      series: [
        {
          type: 'map',
          map: 'brasil',
          data,
          selectedMode: false,
          emphasis: { disabled: true },
          itemStyle: { borderColor: '#17140f', borderWidth: 0.8 },
          label: {
            show: true,
            fontSize: 8,
            fontFamily: 'IBM Plex Mono',
            color: '#efe8da',
            formatter: (p: { data?: { _label?: string } }) => p.data?._label ?? '',
          },
          labelLayout: { hideOverlap: true },
        },
      ],
    });
  }, [ufProgress, ufResults, ready]);

  return <div ref={elRef} style={{ width: '100%', height: '100%', minHeight: 440 }} />;
});
