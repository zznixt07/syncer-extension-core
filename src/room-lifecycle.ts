import {PlaybackSequenceGate, normalizePlaybackEnvelope} from './protocol.js';
import {targetPositionMs} from './sync-math.js';
import type {PlaybackEnvelopeV2, RoomRole} from './types.js';

export type ApplyCommand = {type: 'apply_media' | 'apply_stream'; roomName?: string; data: PlaybackEnvelopeV2 & {targetPositionMs: number}};
export interface PersistedRoom {roomName: string; role: Exclude<RoomRole, null>}

/** Stateful, platform-neutral ordering/replay logic shared by persistent and suspendable extension backgrounds. */
export class RoomLifecycle {
  readonly sequence = new PlaybackSequenceGate();
  roomName: string | null = null;
  role: RoomRole = null;
  latestCommand: ApplyCommand | null = null;

  enter(roomName: string, role: Exclude<RoomRole, null>) {
    this.roomName = roomName; this.role = role; this.sequence.reset(); this.latestCommand = null;
  }
  restore(room: PersistedRoom) { this.enter(room.roomName, room.role); }
  leave() { this.roomName = null; this.role = null; this.sequence.reset(); this.latestCommand = null; }
  rejoinPayload(ownerToken?: string) {
    return this.roomName ? {roomName: this.roomName, data: {ownerToken}} : null;
  }
  receive(kind: 'media' | 'stream', event: {roomName?: string; data?: Record<string, unknown>}, nowMs: number, offsetMs = 0) {
    const envelope = normalizePlaybackEnvelope(event.data ?? {});
    if (!envelope || !this.sequence.accept(envelope)) return null;
    const target = targetPositionMs(envelope.playback.positionMs, envelope.playback.state, envelope.capturedAtMs, nowMs + offsetMs, envelope.playback.rate);
    this.latestCommand = {type: kind === 'media' ? 'apply_media' : 'apply_stream', roomName: event.roomName, data: {...envelope, targetPositionMs: target}};
    return this.latestCommand;
  }
  replay() { return this.latestCommand; }
}
