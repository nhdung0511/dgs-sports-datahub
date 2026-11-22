#!/usr/bin/env node
/**
 * Builds src/data/nba-players.json: style stats for NBA rotation players, used by the
 * player profile's "NBA comps". Run once a season:
 *
 *   node scripts/nba-snapshot.mjs 2025-26
 *
 * Source: stats.nba.com league player stats (Base + Advanced totals, regular season).
 * The rates are computed the same way as src/lib/sports/basketball/advanced.ts so school
 * and NBA numbers mean the same thing.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const season = process.argv[2] ?? "2025-26";
const MIN_MINUTES = 500; // rotation players only
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "nba-players.json");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchTable(measure) {
  const params = new URLSearchParams({
    LastNGames: "0", LeagueID: "00", MeasureType: measure, Month: "0", OpponentTeamID: "0",
    PORound: "0", PaceAdjust: "N", PerMode: "Totals", Period: "0", PlusMinus: "N", Rank: "N",
    Season: season, SeasonType: "Regular Season", TeamID: "0",
    College: "", Conference: "", Country: "", DateFrom: "", DateTo: "", Division: "", DraftPick: "",
    DraftYear: "", GameScope: "", GameSegment: "", Height: "", Location: "", Outcome: "",
    PlayerExperience: "", PlayerPosition: "", SeasonSegment: "", ShotClockRange: "", StarterBench: "",
    VsConference: "", VsDivision: "", Weight: "",
  });
  const res = await fetch(`https://stats.nba.com/stats/leaguedashplayerstats?${params}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`${measure}: HTTP ${res.status}`);
  const { resultSets } = await res.json();
  const { headers, rowSet } = resultSets[0];
  return rowSet.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const pct = (a, b) => (b > 0 ? (100 * a) / b : null);

const [base, adv] = await Promise.all([fetchTable("Base"), fetchTable("Advanced")]);
const advById = new Map(adv.map((r) => [r.PLAYER_ID, r]));

// Opponent two-point attempts per possession, league-wide, to estimate block % (the NBA
// table has no on-court opponent 2PA). Player possessions sum to 5× team possessions.
let twoPa = 0;
let poss = 0;
for (const b of base) {
  twoPa += b.FGA - b.FG3A;
  poss += advById.get(b.PLAYER_ID)?.POSS ?? 0;
}
const opp2paPerPoss = twoPa / (poss / 5);

const players = base
  .filter((b) => b.MIN >= MIN_MINUTES && advById.has(b.PLAYER_ID))
  .map((b) => {
    const a = advById.get(b.PLAYER_ID);
    const attempts = b.FGA + 0.44 * b.FTA;
    return {
      id: b.PLAYER_ID,
      name: b.PLAYER_NAME,
      team: b.TEAM_ABBREVIATION,
      minutes: Math.round(b.MIN),
      gp: b.GP,
      pts: round((b.PTS / b.MIN) * 36),
      // Style stats (0–100), same definitions as advanced.ts.
      usgPct: round(a.USG_PCT * 100),
      astPct: round(a.AST_PCT * 100),
      orebPct: round(a.OREB_PCT * 100),
      drebPct: round(a.DREB_PCT * 100),
      threePaRate: round(pct(b.FG3A, b.FGA)),
      ftRate: round(pct(b.FTA, b.FGA)),
      tovPct: round(pct(b.TOV, attempts + b.TOV)),
      stlPct: round(pct(b.STL, a.POSS)),
      blkPct: round(pct(b.BLK, a.POSS * opp2paPerPoss)),
      tsPct: round(a.TS_PCT * 100),
    };
  })
  .sort((x, y) => y.minutes - x.minutes);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ season, source: "stats.nba.com", minMinutes: MIN_MINUTES, generated: new Date().toISOString().slice(0, 10), players }, null, 0) + "\n",
);
console.log(`Wrote ${players.length} players (${season}, ≥${MIN_MINUTES} min) to ${out}`);
