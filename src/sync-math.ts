import type {PlaybackEnvelopeV2, PlaybackStateName} from './types.js';
export const HTML_IGNORE_MS = 50;
export const HTML_HARD_SEEK_MS = 350;
export const TRANSPORT_IGNORE_MS = 200;
// WebKit-backed players can visibly stall when their playback rate or current
// time is touched for tiny clock differences. Keep Safari playback passive
// while the guest is reasonably close, then use one meaningful correction.
export const IOS_SAFARI_PLAYING_IGNORE_MS = 750;
export const NUDGE_FACTOR = 0.02;
export const NUDGE_DURATION_MS = 3000;
export const MAX_NUDGE_ATTEMPTS = 2;
export const DRIFT_IGNORE_S = HTML_IGNORE_MS / 1000;
export const DRIFT_HARD_SEEK_S = HTML_HARD_SEEK_MS / 1000;
export const targetPositionMs = (positionMs: number, state: PlaybackStateName, capturedAtMs: number, nowMs: number, rate = 1) =>
  state === 'play' ? positionMs + Math.max(0, nowMs - capturedAtMs) * rate : positionMs;
export const targetTimeFor = (data: Pick<PlaybackEnvelopeV2, 'playback' | 'capturedAtMs'>, nowMs: number) =>
  targetPositionMs(data.playback.positionMs, data.playback.state, data.capturedAtMs, nowMs, data.playback.rate) / 1000;
export type Correction = {action: 'ignore'; driftMs: number} | {action: 'seek'; positionMs: number; driftMs: number} |
  {action: 'nudge'; rate: number; baseRate: number; driftMs: number};
export const decideCorrectionMs = ({currentPositionMs, targetMs, state, roomRate, canSetRate, isLive, playingIgnoreMs}: {
  currentPositionMs: number; targetMs: number; state: PlaybackStateName; roomRate: number; canSetRate: boolean; isLive: boolean;
  playingIgnoreMs?: number;
}): Correction => {
  const driftMs = currentPositionMs - targetMs; const magnitude = Math.abs(driftMs);
  if (state !== 'play') return magnitude <= HTML_IGNORE_MS ? {action: 'ignore', driftMs} : {action: 'seek', positionMs: targetMs, driftMs};
  if (playingIgnoreMs !== undefined) {
    const threshold = Math.max(0, playingIgnoreMs);
    return magnitude <= threshold ? {action: 'ignore', driftMs} : {action: 'seek', positionMs: targetMs, driftMs};
  }
  if (!canSetRate || isLive) return magnitude <= TRANSPORT_IGNORE_MS ? {action: 'ignore', driftMs} : {action: 'seek', positionMs: targetMs, driftMs};
  if (magnitude <= HTML_IGNORE_MS) return {action: 'ignore', driftMs};
  if (magnitude >= HTML_HARD_SEEK_MS) return {action: 'seek', positionMs: targetMs, driftMs};
  const baseRate = roomRate > 0 ? roomRate : 1;
  return {action: 'nudge', baseRate, rate: baseRate * (driftMs > 0 ? 1 - NUDGE_FACTOR : 1 + NUDGE_FACTOR), driftMs};
};
export const decideCorrection = ({currentTime, targetTime, roomRate, isLive, isPaused, nudgeAttempts = 0}: {
  currentTime: number; targetTime: number; roomRate: number; isLive: boolean; isPaused: boolean; nudgeAttempts?: number;
}) => {
  const drift = currentTime - targetTime; const magnitude = Math.abs(drift);
  if (magnitude >= DRIFT_HARD_SEEK_S) return {action: 'seek' as const, reason: 'drift' as const, drift};
  if (magnitude <= DRIFT_IGNORE_S) return {action: 'ignore' as const, drift};
  if (isLive || isPaused || nudgeAttempts >= MAX_NUDGE_ATTEMPTS) return {action: 'seek' as const, reason: 'no-nudge' as const, drift};
  const base = Number(roomRate) > 0 ? Number(roomRate) : 1;
  return {action: 'nudge' as const, rate: base * (drift > 0 ? 1 - NUDGE_FACTOR : 1 + NUDGE_FACTOR), base, drift};
};
