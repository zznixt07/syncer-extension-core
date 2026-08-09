import {MAX_NUDGE_ATTEMPTS, NUDGE_DURATION_MS, decideCorrection, targetTimeFor} from './sync-math.js';
import type {PlaybackEnvelopeV2} from './types.js';

export interface ControllableMedia {currentTime: number; duration: number; paused: boolean; playbackRate: number; preservesPitch?: boolean; muted: boolean; play(): Promise<unknown>; pause(): void}
export class MediaController {
  video: ControllableMedia | null = null;
  private nudgeTimer: unknown = null;
  private attempts = 0;
  private nudgeBaseRate = 1;
  private pendingGestureRetry = false;
  constructor(private options: {now?: () => number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (timer: any) => void; onPlaybackBlocked?: (blocked: boolean) => void; onGestureNeeded?: ((retry: () => void) => void) | null; log?: (...args: unknown[]) => void} = {}) {}
  private get now() { return this.options.now ?? Date.now; }
  private get setTimer(): (fn: () => void, ms: number) => unknown { return this.options.setTimer ?? ((fn, ms) => setTimeout(fn, ms)); }
  private get clearTimer(): (timer: any) => void { return this.options.clearTimer ?? (timer => clearTimeout(timer)); }
  get isNudging() { return this.nudgeTimer !== null; }
  get nudgeAttempts() { return this.attempts; }
  setVideo(video: ControllableMedia | null) { if (this.video === video) return; this.cancelNudge(); this.video = video; this.attempts = 0; }
  isLive() { const duration = this.video?.duration; return !Number.isFinite(duration) || duration === 0; }
  cancelNudge() { if (!this.nudgeTimer) return; this.clearTimer(this.nudgeTimer); this.nudgeTimer = null; if (this.video) this.video.playbackRate = this.nudgeBaseRate; }
  private applyNudge(decision: {base: number; rate: number}) { const video = this.video!; if (this.nudgeTimer) { this.clearTimer(this.nudgeTimer); this.nudgeTimer = null; } this.nudgeBaseRate = decision.base; video.preservesPitch = true; video.playbackRate = decision.rate; if (Math.abs(video.playbackRate - decision.rate) > .001) { video.playbackRate = decision.base; this.attempts = MAX_NUDGE_ATTEMPTS; return false; } this.attempts += 1; this.nudgeTimer = this.setTimer(() => { this.nudgeTimer = null; video.playbackRate = this.nudgeBaseRate; }, NUDGE_DURATION_MS); return true; }
  private async play() { const video = this.video; if (!video) return false; try { await video.play(); this.pendingGestureRetry = false; this.options.onPlaybackBlocked?.(false); return true; } catch (error) { this.options.log?.('play() was blocked', error); this.options.onPlaybackBlocked?.(true); if (!this.pendingGestureRetry && this.options.onGestureNeeded) { this.pendingGestureRetry = true; this.options.onGestureNeeded(() => { this.pendingGestureRetry = false; if (this.video?.paused) void this.play(); }); } return false; } }
  correctPosition(data: PlaybackEnvelopeV2) { const video = this.video!; const targetTime = targetTimeFor(data, this.now()); const decision = decideCorrection({currentTime: video.currentTime, targetTime, roomRate: data.playback.rate, isLive: this.isLive(), isPaused: video.paused, nudgeAttempts: this.attempts}); if (decision.action === 'nudge') { if (!this.applyNudge(decision)) video.currentTime = targetTime; } else if (decision.action === 'seek') { this.cancelNudge(); if (decision.reason === 'drift') this.attempts = 0; video.currentTime = targetTime; } else { this.cancelNudge(); this.attempts = 0; } return decision; }
  async applyRemoteState(data: PlaybackEnvelopeV2) { const video = this.video; if (!video) return false; if (Number.isFinite(data.playback.positionMs)) this.correctPosition(data); if (data.playback.state === 'buffer' && !video.paused) { this.cancelNudge(); video.pause(); } else if (data.playback.state === 'play' && video.paused) await this.play(); else if (data.playback.state === 'pause' && !video.paused) { this.cancelNudge(); video.pause(); } if (Number.isFinite(data.playback.rate)) { if (this.nudgeTimer) this.nudgeBaseRate = data.playback.rate; else video.playbackRate = data.playback.rate; } if (data.playback.muted !== undefined) video.muted = data.playback.muted; return true; }
}
