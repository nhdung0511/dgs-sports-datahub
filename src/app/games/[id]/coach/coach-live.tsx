"use client";

import { useMemo } from "react";
import { CoachView } from "@/components/coach-view";
import type { BasketballGame } from "@/lib/db/games";
import type { AnalysisGame } from "@/lib/sports/basketball/advanced";
import { mergeThresholds } from "@/lib/sports/basketball/coach-alerts";
import type { BasketballEvent } from "@/lib/sports/basketball/events";
import type { GameEvent, Player } from "@/lib/sports/types";
import { useLiveEvents } from "@/lib/use-live-events";

interface Props {
  game: BasketballGame;
  teamName: string;
  players: Player[];
  initialEvents: GameEvent[];
  baselineGames: AnalysisGame[];
  overrides: Record<string, number>;
}

export function CoachLive({ game, teamName, players, initialEvents, baselineGames, overrides }: Props) {
  const { events, status, connected, lastUpdate } = useLiveEvents<BasketballEvent>(game.id, initialEvents, game.status);
  const thresholds = useMemo(() => mergeThresholds(game.config, overrides), [game.config, overrides]);
  return (
    <CoachView
      config={game.config}
      events={events}
      players={players}
      baselineGames={baselineGames}
      thresholds={thresholds}
      teamName={teamName}
      opponentName={game.opponentName}
      review={status === "final"}
      live={{ connected, lastUpdate }}
    />
  );
}
