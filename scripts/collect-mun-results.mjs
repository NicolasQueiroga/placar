#!/usr/bin/env node
/**
 * Collect final 1st-round presidential results per municipality from TSE.
 * Static data (race is final) — run once, commit the output.
 *
 * Output: public/mun-results.json — { [tseMunId]: { a, b, pa, pb, va, vb } }
 *   a/b  = ballot names, pa/pb = percents, va/vb = votes
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const ELE = '6257';
const CARGO = '0001';
const BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
const CONCURRENCY = 1;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const cfgRes = await fetch(`${BASE}/${ELE}/config/mun-e${ELE.padStart(6, '0')}-cm.json`, { headers: { 'User-Agent': UA } });
if (!cfgRes.ok) throw new Error(`config fetch failed: ${cfgRes.status}`);
const cfg = await cfgRes.json();

const tasks = [];
for (const abr of cfg.abr) {
  const uf = abr.cd.toUpperCase();
  if (uf === 'ZZ') continue; // exterior handled separately at country level
  for (const m of abr.mu) {
    tasks.push({ uf, cd: m.cd, id: m.cdi, name: m.nm });
  }
}
console.log(`collecting ${tasks.length} municipalities…`);

// resume from partial output
const OUT = 'public/mun-results.json';
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const remaining = tasks.filter((t) => !out[t.id]);
console.log(`  resuming: ${tasks.length - remaining.length} already collected, ${remaining.length} to go`);
tasks.length = 0;
tasks.push(...remaining);
let done = 0;
let failed = 0;
const queue = [...tasks];

async function worker() {
  while (queue.length > 0) {
    const t = queue.shift();
    const url = `${BASE}/${ELE}/dados/${t.uf.toLowerCase()}/${t.uf.toLowerCase()}${t.cd}-c${CARGO}-e${ELE.padStart(6, '0')}-u.json`;
    try {
      let res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      const cands = d.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand));
      const sorted = cands
        .filter((c) => c.vap != null && c.st !== 'Aguardando')
        .sort((x, y) => Number(y.vap) - Number(x.vap))
        .slice(0, 2);
      if (sorted.length >= 2) {
        out[t.id] = {
          a: sorted[0].nmu,
          pa: parseFloat(sorted[0].pvap.replace(',', '.')),
          va: Number(sorted[0].vap),
          b: sorted[1].nmu,
          pb: parseFloat(sorted[1].pvap.replace(',', '.')),
          vb: Number(sorted[1].vap),
        };
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ ${t.uf} ${t.name}: ${e.message}`);
    }
    done++;
    await new Promise((r) => setTimeout(r, 220));
    if (done % 200 === 0) {
      console.log(`  ${done}/${tasks.length}`);
      writeFileSync(OUT, JSON.stringify(out)); // checkpoint
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${Object.keys(out).length} ok, ${failed} failed`);
writeFileSync('public/mun-results.json', JSON.stringify(out));
console.log('wrote public/mun-results.json');
