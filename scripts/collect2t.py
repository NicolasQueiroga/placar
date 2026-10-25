#!/usr/bin/env python3
"""Headless minute collector for the 2º turno (2026-10-25).

Runs from Nick's Mac via crontab — a residential IP that TSE's WAF
allows, unlike the Cloudflare worker. Fetches the national 2º-turno
file once a minute and POSTs each new TSE generation to the feed
worker's /ingest (which validates, dedupes by generation timestamp,
and stores it in D1 `history`). With this running, the minute archive
fills even when nobody has the site open; browsers posting from the
live site converge on the same rows (same generatedAt key).

Self-disabling: exits immediately on any date other than 2026-10-25.
Remove with: crontab -l | grep -v collect2t | crontab -
"""

import json
import sys
import urllib.request
from datetime import datetime

TSE_URL = "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json"
INGEST_URL = "https://placar-feed.nicolasqueiroga.workers.dev/ingest"
INGEST_KEY = "27bedc372abaadbd8b82206caec2396e"  # cosmetic — real guards are worker-side
ELECTION_DAY = "2026-10-25"


def main() -> int:
    today = datetime.now().strftime("%Y-%m-%d")
    if today != ELECTION_DAY:
        print(f"{today}: not election day, exiting")
        return 0

    req = urllib.request.Request(TSE_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as res:
        d = json.load(res)

    counted = int(d["s"]["st"])
    if counted <= 0:
        print(f"{datetime.now():%H:%M:%S} 0 seções — nada a arquivar ainda")
        return 0

    dg, hg = d["dg"], d["hg"]  # TSE's own generation stamp = canonical dedupe key
    ts_ms = int(datetime.fromisoformat(f"{dg[6:]}-{dg[3:5]}-{dg[0:2]}T{hg}-03:00").timestamp() * 1000)

    cands = []
    for agr in d["carg"][0]["agr"]:
        for par in agr["par"]:
            for c in par["cand"]:
                cands.append(
                    {
                        "name": c["nmu"],
                        "id": c["sqcand"],
                        "party": par["sg"],
                        "votes": int(c["vap"]),
                        "pct": float(c["pvapn"]),
                    }
                )
    cands.sort(key=lambda c: -c["votes"])

    total = int(d["s"]["ts"])
    payload = json.dumps(
        {
            "race": "presidente2",
            "points": [
                {
                    "ts": ts_ms,
                    "sections_pct": round(counted / total * 100, 6) if total else 0,
                    "candidates": cands[:12],
                }
            ],
        }
    ).encode()

    post = urllib.request.Request(
        INGEST_URL,
        data=payload,
        headers={"content-type": "application/json", "x-ingest-key": INGEST_KEY},
        method="POST",
    )
    with urllib.request.urlopen(post, timeout=20) as res:
        out = json.load(res)
    print(f"{datetime.now():%H:%M:%S} {dg} {hg} seções={counted}/{total} -> {out}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # never die loudly from cron; next minute retries
        print(f"{datetime.now():%H:%M:%S} erro: {e}")
        sys.exit(0)
