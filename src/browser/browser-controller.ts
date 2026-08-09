
import {decideCorrectionMs as decideCorrection, NUDGE_DURATION_MS, targetPositionMs} from '../sync-math.js';
import type {PlaybackEnvelopeV2, PlaybackStateName} from '../types.js';
import type {BrowserAdapterApi, BrowserAdapterInspection, BrowserMediaElement} from './service-adapters.js';

type Timer = ReturnType<typeof setTimeout>;

export interface BrowserTransport {
  platform: 'android' | 'ios';
  post(type: string, data?: unknown): void;
  onCommand(listener: (command: BrowserCommand) => void): void;
  navigate(url: string): void;
  getInitialRole?(): Promise<'host' | 'guest' | null>;
}

export type BrowserCommand =
  | {type: 'set_context'; url: string; title?: string}
  | {type: 'set_role'; role: 'host' | 'guest' | null}
  | {type: 'request_snapshot'; stream?: boolean}
  | {type: 'apply_media'; data: PlaybackEnvelopeV2 & {targetPositionMs?: number}}
  | {type: 'apply_stream'; data: PlaybackEnvelopeV2 & {targetPositionMs?: number}};

export interface BrowserControllerEnvironment {
  currentUrl(): string;
  isTopFrame(): boolean;
  now(): number;
  every(milliseconds: number, listener: () => void): Timer;
}

const MEDIA_EVENTS = ['play', 'pause', 'seeked', 'waiting', 'playing', 'ratechange', 'ended'];

export const playbackState = (media: BrowserMediaElement): PlaybackStateName =>
  media.ended ? 'ended' : media.readyState < 3 && !media.paused ? 'buffer' : media.paused ? 'pause' : 'play';

export const createBrowserSnapshot = ({media, inspection, platform, capturedAtMs}: {
  media: BrowserMediaElement;
  inspection: BrowserAdapterInspection;
  platform: 'android' | 'ios';
  capturedAtMs: number;
}): PlaybackEnvelopeV2 => {
  const state = playbackState(media);
  const positionMs = media.currentTime * 1000;
  const rate = media.playbackRate || 1;
  const durationMs = Number.isFinite(media.duration) ? media.duration * 1000 : undefined;
  return {
    version: 2,
    capturedAtMs,
    source: {platform, adapter: inspection.adapter, service: inspection.service},
    media: {
      ...inspection.identity,
      durationMs,
      isLive: !Number.isFinite(media.duration) || media.duration === 0,
    },
    playback: {state, positionMs, rate, muted: media.muted},
    capabilities: {
      canPlay: true,
      canPause: true,
      canSeek: true,
      canSetRate: inspection.canSetRate,
      canLoadMedia: true,
    },
  };
};

export const createBrowserController = ({transport, adapters, environment = browserEnvironment()}: {
  transport: BrowserTransport;
  adapters: BrowserAdapterApi;
  environment?: BrowserControllerEnvironment;
}) => {
  let media: BrowserMediaElement | null = null;
  let role: 'host' | 'guest' | null = null;
  let lastIdentity = '';
  let lastStatus = '';
  let nudgeTimer: Timer | null = null;
  let periodicTimer: Timer | null = null;
  let rateControlRejected = false;

  const runtimeInspection = () => {
    const inspection = adapters.inspect();
    return rateControlRejected ? {...inspection, canSetRate: false} : inspection;
  };

  const reportStatus = (inspection: BrowserAdapterInspection) => {
    const key = `${inspection.adapter}|${inspection.status}|${inspection.message ?? ''}`;
    if (key === lastStatus) return;
    lastStatus = key;
    transport.post('serviceStatus', {
      adapter: inspection.adapter,
      status: inspection.status,
      message: inspection.message,
      experimental: inspection.experimental,
    });
  };
  const snapshot = () => {
    const inspection = runtimeInspection();
    reportStatus(inspection);
    media = adapters.findMedia();
    if (!media || inspection.status !== 'ready') return null;
    return createBrowserSnapshot({media, inspection, platform: transport.platform, capturedAtMs: environment.now()});
  };
  const sendSnapshot = (stream = false) => {
    const data = snapshot();
    if (data && role === 'host') transport.post(stream ? 'stream' : 'snapshot', data);
  };
  const attach = () => {
    const next = adapters.findMedia();
    if (!next || next === media) return;
    media = next;
    rateControlRejected = false;
    MEDIA_EVENTS.forEach(event => next.addEventListener(event, () => sendSnapshot(false)));
    transport.post('ready', {url: environment.currentUrl()});
  };
  const setRole = (nextRole: 'host' | 'guest' | null) => {
    role = nextRole;
    if (periodicTimer) clearInterval(periodicTimer);
    periodicTimer = role === 'host' ? environment.every(5000, () => sendSnapshot(false)) : null;
  };
  const apply = async (remote: PlaybackEnvelopeV2 & {targetPositionMs?: number}) => {
    attach();
    const inspection = runtimeInspection();
    reportStatus(inspection);
    if (!media || inspection.status !== 'ready') return;
    if (!adapters.sameIdentity(remote.media?.canonicalId, inspection.identity.canonicalId)) {
      transport.post('identityMismatch', {local: inspection.identity, remote: remote.media});
      return;
    }
    const target = Number.isFinite(remote.targetPositionMs)
      ? Number(remote.targetPositionMs)
      : targetPositionMs(remote.playback.positionMs, remote.playback.state, remote.capturedAtMs, environment.now(), remote.playback.rate);
    const decide = (canSetRate: boolean) => decideCorrection({
      currentPositionMs: media!.currentTime * 1000,
      targetMs: target,
      state: remote.playback.state,
      roomRate: remote.playback.rate,
      canSetRate,
      isLive: Boolean(remote.media?.isLive),
    });
    const seek = (positionMs: number) => {
      try {
        if (media) media.currentTime = positionMs / 1000;
      } catch (error) {
        transport.post('serviceStatus', {adapter: inspection.adapter, status: 'ready', message: `Seeking is unavailable: ${String(error)}`});
      }
    };
    const correction = decide(inspection.canSetRate);
    if (remote.playback.muted !== undefined) media.muted = remote.playback.muted;
    if (correction.action !== 'nudge' && nudgeTimer) {
      clearTimeout(nudgeTimer);
      nudgeTimer = null;
    }
    if (correction.action === 'seek') seek(correction.positionMs);
    if (correction.action === 'nudge') {
      if (nudgeTimer) clearTimeout(nudgeTimer);
      try {
        media.preservesPitch = true;
        media.playbackRate = correction.rate;
        nudgeTimer = setTimeout(() => {
          try { if (media) media.playbackRate = correction.baseRate; } catch { rateControlRejected = true; }
        }, NUDGE_DURATION_MS);
      } catch (error) {
        rateControlRejected = true;
        transport.post('serviceStatus', {
          adapter: inspection.adapter,
          status: 'ready',
          message: `Playback-rate control is unavailable; using seek-only synchronization. ${String(error)}`,
        });
        const fallback = decide(false);
        if (fallback.action === 'seek') seek(fallback.positionMs);
      }
    } else if (inspection.canSetRate && !remote.media?.isLive) {
      try {
        media.playbackRate = remote.playback.rate > 0 ? remote.playback.rate : 1;
      } catch (error) {
        rateControlRejected = true;
        transport.post('serviceStatus', {
          adapter: inspection.adapter,
          status: 'ready',
          message: `Playback-rate control is unavailable; using seek-only synchronization. ${String(error)}`,
        });
      }
    }
    if (remote.playback.state === 'play' && media.paused) {
      try { await media.play(); } catch (error) { transport.post('blocked', {message: String(error)}); }
    } else if (remote.playback.state !== 'play' && !media.paused) media.pause();
  };
  const applyStream = (remote: PlaybackEnvelopeV2 & {targetPositionMs?: number}) => {
    const inspection = adapters.inspect();
    if (!adapters.sameIdentity(remote.media?.canonicalId, inspection.identity.canonicalId) &&
        remote.media?.url && environment.isTopFrame()) {
      transport.navigate(remote.media.url);
      return;
    }
    apply(remote);
  };

  transport.onCommand(command => {
    if (command.type === 'set_role') setRole(command.role);
    if (command.type === 'request_snapshot') sendSnapshot(command.stream ?? true);
    if (command.type === 'apply_media') apply(command.data);
    if (command.type === 'apply_stream') applyStream(command.data);
  });
  transport.getInitialRole?.().then(setRole);
  attach();
  adapters.watch(inspection => {
    attach();
    reportStatus(inspection);
    const identity = inspection.identity.canonicalId || inspection.identity.url;
    if (lastIdentity && identity !== lastIdentity && inspection.status === 'ready') sendSnapshot(true);
    lastIdentity = identity ?? '';
  });
  return {apply, applyStream, sendSnapshot, setRole, snapshot};
};

const browserEnvironment = (): BrowserControllerEnvironment => {
  const page = globalThis as any;
  return {
    currentUrl: () => page.location.href,
    isTopFrame: () => page.top === page,
    now: () => Date.now(),
    every: (milliseconds, listener) => setInterval(listener, milliseconds),
  };
};

