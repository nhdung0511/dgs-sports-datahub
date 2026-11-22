import { describe, expect, it } from "vitest";
import snapshot from "@/data/nba-players.json";
import { blendPool, confidenceOf, nbaComps, poolStats, STYLE_KEYS, zToPct, type NbaPlayer, type NbaSnapshot, type StyleVector } from "./nba-comps";

const vec = (o: Partial<StyleVector>): StyleVector => Object.fromEntries(STYLE_KEYS.map((k) => [k, o[k] ?? null])) as StyleVector;
const nbaP = (id: number, name: string, o: Partial<StyleVector>): NbaPlayer => ({ id, name, team: "X", minutes: 1000, gp: 50, pts: 20, tsPct: 58, ...vec(o) });

const league = [
  nbaP(1, "Shooter", { usgPct: 22, astPct: 12, threePaRate: 65, drebPct: 10, blkPct: 1 }),
  nbaP(2, "Big", { usgPct: 18, astPct: 8, threePaRate: 2, drebPct: 28, blkPct: 6 }),
  nbaP(3, "Guard", { usgPct: 30, astPct: 40, threePaRate: 35, drebPct: 12, blkPct: 1 }),
  nbaP(4, "Wing", { usgPct: 20, astPct: 15, threePaRate: 40, drebPct: 15, blkPct: 2 }),
];

describe("pool maths", () => {
  it("computes mean and spread, skipping nulls", () => {
    const s = poolStats([vec({ usgPct: 10 }), vec({ usgPct: 30 }), vec({})]);
    expect(s.usgPct).toEqual({ mean: 20, sd: 10 });
    expect(s.astPct).toBeNull();
  });

  it("pulls a small roster's spread toward the league's but keeps its mean", () => {
    const b = blendPool(poolStats([vec({ usgPct: 18 }), vec({ usgPct: 22 })]), 2, { ...poolStats([]), usgPct: { mean: 20, sd: 6 } }, 2);
    expect(b.usgPct!.mean).toBe(20);
    expect(b.usgPct!.sd).toBeCloseTo(Math.sqrt((2 * 4 + 2 * 36) / 4));
  });

  it("turns z-scores into percentiles", () => {
    expect(zToPct(0)).toBe(50);
    expect(zToPct(1)).toBe(84);
    expect(zToPct(-1)).toBe(16);
    expect(zToPct(null)).toBeNull();
  });
});

describe("nbaComps", () => {
  // A school team: the big has a low 3PA rate and lots of rebounds/blocks *for this team*.
  const team = [
    vec({ usgPct: 20, astPct: 10, threePaRate: 50, drebPct: 8, blkPct: 1 }),
    vec({ usgPct: 15, astPct: 5, threePaRate: 0, drebPct: 25, blkPct: 8 }),
    vec({ usgPct: 32, astPct: 35, threePaRate: 30, drebPct: 10, blkPct: 1 }),
    vec({ usgPct: 18, astPct: 12, threePaRate: 30, drebPct: 12, blkPct: 2 }),
  ];

  it("matches roles, not raw levels", () => {
    expect(nbaComps(team[1], team, league)[0].nba.name).toBe("Big");
    expect(nbaComps(team[2], team, league)[0].nba.name).toBe("Guard");
    expect(nbaComps(team[0], team, league)[0].nba.name).toBe("Shooter");
  });

  it("returns k comps, best first, with similarity and per-stat rows", () => {
    const comps = nbaComps(team[1], team, league, 3);
    expect(comps).toHaveLength(3);
    expect(comps[0].similarity).toBeGreaterThan(comps[2].similarity);
    expect(comps[0].similarity).toBeLessThanOrEqual(100);
    const blk = comps[0].rows.find((r) => r.key === "blkPct")!;
    expect(blk).toMatchObject({ ours: 8, theirs: 6 });
    expect(blk.oursPct).toBeGreaterThan(50);
  });

  it("ignores stats the player has no value for", () => {
    const noReb = vec({ usgPct: 15, astPct: 5, threePaRate: 0 });
    const comps = nbaComps(noReb, team, league);
    expect(comps[0].rows.find((r) => r.key === "drebPct")!.gap).toBeNull();
  });

  it("returns nothing without any style stats", () => {
    expect(nbaComps(vec({}), team, league)).toEqual([]);
  });

  it("works against the real snapshot", () => {
    const snap = snapshot as NbaSnapshot;
    expect(snap.players.length).toBeGreaterThan(200);
    const comps = nbaComps(team[1], team, snap.players);
    expect(comps).toHaveLength(3);
    // A low-usage, no-threes, rebounding shot-blocker should get a big man.
    expect(comps[0].nba.threePaRate!).toBeLessThan(15);
  });
});

describe("confidenceOf", () => {
  it("grows with minutes", () => {
    expect([confidenceOf(10), confidenceOf(100), confidenceOf(500)]).toEqual(["Low", "Medium", "High"]);
  });
});
