# Coach view: agreed plan

This plan was agreed on 2026-11-22. It is built before the player profile and NBA comps feature.

## Who and access
- A new **`coach`** role in `team_members.role`. Only coaches and admins can see the coach view.
- A coach can also act as an editor: create games, edit the roster and score games. A coach cannot manage members, news or archetypes; those stay admin-only.
- **Caveat:** `game_events` can be read by anyone, because the public `/g/[id]` page depends on that. The coach-only gate therefore protects the derived insights, the UI and the threshold settings, not the raw events. This is acceptable because box scores are already public.

## Ways to see it
1. **`/games/[id]/coach`**: a page on its own device (tablet or phone). It is a members-only server page with a role check and uses a live client component.
2. **Scorer panel**: a "Coach" tab added next to "log" and "box" in `scorer.tsx`. It only appears when the signed-in scorer is a coach or an admin. It reads the scorer's local events, so it also works offline.
3. **Assistant relay**: an assistant uses the same `/games/[id]/coach` page. A "Dense" layout toggle shows more detail for the moments when the coach isn't glancing at it.

All three ways show one shared component, `<CoachView events players config baseline thresholds />`.

## Insights (v1)
All insights are computed with pure functions over the event log in the new `src/lib/sports/basketball/coach.ts`, and they get tests.

| Panel | Built on | Notes |
|---|---|---|
| Lineup +/- and on/off | `box.lineups`, `box.onCourtTeam`, `ratings()` | Shows the current five, plus each lineup's net rating and minutes so far. |
| Fouls and fatigue | `PlayerLine.pf`, `foulsByPeriod`, `secondsPlayed`, `sub` events | Tracks foul trouble against the period, the length of each player's current stint, and team fouls and bonus status. |
| Runs and momentum | `shot` events with `period` and `clock_ms` | Shows current and largest runs, droughts (time since our last score) and points per possession for each period. |
| Hot/cold and efficiency | live `PlayerLine` compared with the baseline | Shows FG%, 3P%, TS% and turnovers next to each player's normal level. |
| Compared with previous games | `playerAdvanced()` and the team lines | Covers player and team rates (TS%, eFG%, TOV%, OREB%, pace, ratings) for this game against the baseline. |

**Data limits:** shot locations are not recorded, and opponent stats are team-level only. The view has no zone or opponent-player insights. Possession-based numbers need `config.opponentStats`; when a game doesn't have it, the panel shows a note.

## Baseline
- The default baseline is the season average from `loadSeason()` final games, using the `aggregatePlayers` and `playerAdvanced` functions. A toggle switches it to the last 5 games.
- Live numbers are compared as **rates or per-minute values**, never raw totals, because the game isn't finished.
- Hot/cold flags are hidden until a player has a minimum sample (for example, at least 5 shot attempts) to avoid noise.

## Alerts
The view combines the stats panels with an alert feed. The alerts come from simple, visible rules, and there is no AI.

- Each rule is a pure function `(state, thresholds) => Alert[]`. Every `Alert` has an id, a severity, text and a related player.
- The v1 rules:
  - a player in foul trouble (fouls at or above the limit for the period)
  - a player one foul from fouling out
  - the opponent close to the bonus, or us in the bonus
  - an opponent run of N-0 or more
  - our scoring drought longer than X seconds
  - a player on the court for more than Y minutes in one stint
  - a player shooting more than Z points below their baseline
  - a lineup that is -N or worse
- Alerts are removed when their condition clears. The feed keeps a history, which the review mode uses.

## Thresholds
- The defaults scale with the game format: the foul-out limit is 5 for FIBA and high school and 6 for NBA, and the stint length scales with `periodLengthSec`.
- A new migration, **`0008_coach_role.sql`**, will make these changes:
  - Add `coach` to the role check.
  - Include coaches in `is_team_editor`.
  - Add a helper `is_team_coach(t)` that returns true for admins and coaches.
  - Allow `coach` in `add_team_member_by_email`.
  - Add a `coach_thresholds (team_id pk, values jsonb, updated_at)` table that coaches and admins can read and write.
- Coaches and admins edit thresholds in a new section of `/analysis/settings` or on `/team`.

## Live updates and staleness
- The coach page uses the same Supabase Realtime subscription as `live-game.tsx`. That subscription should be moved into a shared hook, `useLiveEvents(gameId)`.
- When disconnected, the hook falls back to polling every 10 seconds.
- A badge shows "Last update Xs ago", based on the newest event's `updated_at` or the last successful fetch. It turns amber after 30 seconds and red after 90 seconds.

## Review mode (after the game)
- On final games, the same page shows a **timeline scrubber** (by period and clock).
- Moving the scrubber recomputes everything from the events up to that point, then shows the alert history.
- No extra storage is needed because everything is derived from the events.

## Build steps
1. **Role and migration**: `0008_coach_role.sql`, `Role` type and `canEdit` in `src/lib/db/teams.ts`, the role picker on the Team page, and an `isCoach()` helper.
2. **Pure logic and tests**: `coach.ts` (the game state at time T, runs, stints, live and baseline comparisons) and `coach-alerts.ts` (rules and default thresholds), with vitest tests.
3. **Shared hook**: move the Realtime code out of `live-game.tsx` into `useLiveEvents`, adding polling and staleness.
4. **`CoachView` component**: the panels and the alert feed, using SVG charts from `charts.tsx`. It must work on phones first, with the dense toggle.
5. **`/games/[id]/coach` page**: role check, loading the baseline and thresholds, and a link from the game card and the scorer.
6. **Scorer "Coach" tab**: only for coaches and admins, using local events.
7. **Thresholds settings UI**.
8. **Review mode scrubber** for final games.

## Verify
- Run `npm test` for the new logic.
- Test manually with the local dev server: score a test game in one tab and watch the coach page in another, then go offline and confirm the staleness badge changes.
- Check access with the player role (blocked) and the coach role (allowed).
