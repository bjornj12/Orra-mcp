import type { Pressure } from "../types.js";

const TICK_THRESHOLD = 60;
const MINUTES_THRESHOLD = 240;
const RECOMMEND_AT = 0.6;

export function computePressure(args: {
  session_started_at: string;
  tick_count: number;
  now: string;
}): Pressure {
  const started = Date.parse(args.session_started_at);
  const now = Date.parse(args.now);
  const minutes = Math.max(0, (now - started) / 60000);

  const tickScore = args.tick_count / TICK_THRESHOLD;
  const timeScore = minutes / MINUTES_THRESHOLD;
  const score = Math.max(tickScore, timeScore);

  const recommend_compact = score >= RECOMMEND_AT;
  let reason: string | undefined;
  if (recommend_compact) {
    reason = tickScore >= timeScore ? `tick_count>=${TICK_THRESHOLD * RECOMMEND_AT}` : `minutes>=${MINUTES_THRESHOLD * RECOMMEND_AT}`;
  }
  return { score: Math.round(score * 100) / 100, recommend_compact, reason };
}
