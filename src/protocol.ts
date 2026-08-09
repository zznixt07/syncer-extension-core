import type {PlaybackEnvelopeV2} from './types.js';

type UnknownPayload = Record<string, any>;
const states = new Set(['play', 'pause', 'buffer', 'ended']);
const platforms = new Set(['desktop', 'android', 'ios']);
const adapters = new Set(['html', 'media-session', 'youtube', 'spotify']);
const capabilityKeys = ['canPlay', 'canPause', 'canSeek', 'canSetRate', 'canLoadMedia'];

export const isPlaybackEnvelopeV2 = (data: UnknownPayload | null | undefined): data is PlaybackEnvelopeV2 => Boolean(
  data?.version === 2 && Number.isFinite(data.capturedAtMs) && platforms.has(data.source?.platform) &&
  adapters.has(data.source?.adapter) && typeof data.media?.isLive === 'boolean' && states.has(data.playback?.state) &&
  Number.isFinite(data.playback?.positionMs) && Number.isFinite(data.playback?.rate) && data.capabilities &&
  capabilityKeys.every(key => typeof data.capabilities[key] === 'boolean'),
);
export const normalizePlaybackEnvelope = (data: UnknownPayload): PlaybackEnvelopeV2 | null => isPlaybackEnvelopeV2(data) ? data : null;
export const normalizePlaybackPayload = normalizePlaybackEnvelope;

export class PlaybackSequenceGate {
  private value = 0;
  get lastSequence() { return this.value; }
  accept(data: {sequence?: number} = {}) {
    if (!Number.isFinite(data.sequence) || data.sequence! <= this.value) return false;
    this.value = data.sequence!;
    return true;
  }
  reset() { this.value = 0; }
}

export const mediaMatches = (local: PlaybackEnvelopeV2 | null, remote: PlaybackEnvelopeV2) => {
  if (!local) return false;
  if (local.media.canonicalId && remote.media.canonicalId) return local.media.canonicalId === remote.media.canonicalId;
  if (local.media.url && remote.media.url) return local.media.url === remote.media.url;
  return local.media.title === remote.media.title && local.media.artist === remote.media.artist &&
    Math.abs((local.media.durationMs ?? 0) - (remote.media.durationMs ?? 0)) < 2000;
};
