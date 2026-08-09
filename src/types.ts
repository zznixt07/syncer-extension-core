export type PlaybackStateName = 'play' | 'pause' | 'buffer' | 'ended';
export type AdapterKind = 'html' | 'media-session' | 'youtube' | 'spotify';
export type PlatformKind = 'desktop' | 'android' | 'ios';
export type RoomRole = 'host' | 'guest' | null;

export interface MediaIdentity {
  canonicalId?: string;
  url?: string;
  title?: string;
  artist?: string;
  durationMs?: number;
  isLive: boolean;
}
export interface PlaybackState {state: PlaybackStateName; positionMs: number; rate: number; muted?: boolean}
export interface PlaybackCapabilities {canPlay: boolean; canPause: boolean; canSeek: boolean; canSetRate: boolean; canLoadMedia: boolean}
export interface PlaybackEnvelopeV2 {
  version: 2;
  sequence?: number;
  capturedAtMs: number;
  source: {platform: PlatformKind; adapter: AdapterKind; service?: string; applicationId?: string};
  media: MediaIdentity;
  playback: PlaybackState;
  capabilities: PlaybackCapabilities;
}
export interface RoomSummary {roomName: string; userCount: number | null; isOwner?: boolean}
export interface CommandResult {success: boolean; message?: string}
export interface PlaybackAdapter {
  getIdentity(): Promise<MediaIdentity | null>;
  getState(): Promise<PlaybackState>;
  getCapabilities(): Promise<PlaybackCapabilities>;
  play(): Promise<CommandResult>;
  pause(): Promise<CommandResult>;
  seekTo(positionMs: number): Promise<CommandResult>;
  setRate?(rate: number): Promise<CommandResult>;
  subscribe(listener: (state: PlaybackState) => void): () => void;
}
