# Advanced stats & Analysis tab — agreed plan

Inspired by DataMB (datamb.football), adapted to a single school roster. Agreed 2026-11-21.

## Who and visibility
- Audience: coaches, players, club analysts.
- Box scores and season totals stay public. All new analysis is team-only (signed in). May open up later.
- New view-only **Player** role: admins add players by email; players see the whole team's analysis
  but cannot score, edit or delete anything.

## Data
- Scorer also records **opponent team** missed shots (2/3/FT), offensive/defensive rebounds and turnovers
  (team-level, no opponent players, no shot locations).
- Games recorded before this are excluded from possession-based stats (pace, ratings, rebound %),
  with a "based on N of M games" note. Everything else uses all games.
- Stats: everything the data supports — shooting efficiency (eFG%, TS%, 3PA rate, FT rate, pts/shot),
  usage & playmaking (USG%, AST%, AST/TO, TOV%), rebounding & defense (OREB%/DREB%/REB%, STL%, BLK%,
  PF/32), on/off & impact (on/off net rating, on-court +/- per 32, duos/lineups by net rating).

## Comparison
- Radars compare against teammates (roster percentiles), fixed benchmarks, and the player's own past.
- Benchmarks: sensible school-basketball defaults, editable by admins.
- Archetypes: starter set (Shooter, Playmaker, Slasher, Rebounder/Big, Defender), admin-editable, each with
  key stats and goal targets. A player's archetype is coach-assigned or auto-detected (user can switch).
- Units: per 32 min (default), per game, per 100 possessions, totals.
- Adjustable minimum-minutes slider; players below it are greyed out and excluded from percentiles.
- Overall rating: archetype-weighted 0–99 and Game Score, switchable.

## Pages
- New team-only **Analysis** tab with sub-tabs: Radars & compare, Scatter plot, Leaderboard/Index,
  Team trends & ratings. Existing public Dashboard unchanged.
- Filters/extras: season & date range, opponent/game filter, save chart as PNG, CSV export.
- Charts stay hand-drawn SVG (no chart library); everything must work on phones.

## Build stages
1. Opponent team recording in the scorer + Player role.
2. Advanced stat calculations (with tests).
3. Analysis tab: Leaderboard/Index, then Radars, Scatter plot, Team trends.
4. Benchmarks & archetypes admin settings, auto-detection.
