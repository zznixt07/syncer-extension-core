import {io, type Socket} from 'socket.io-client';
import {probeClock} from './clock.js';
import {normalizePlaybackEnvelope, PlaybackSequenceGate} from './protocol.js';
import type {PlaybackEnvelopeV2, RoomRole, RoomSummary} from './types.js';

type Listener = (payload: PlaybackEnvelopeV2) => void;
const ack = <T>(socket: Socket, event: string, payload?: unknown) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 7000);
  const done = (result: T) => { clearTimeout(timer); resolve(result); };
  payload === undefined ? socket.emit(event, done) : socket.emit(event, payload, done);
});

export class RoomClient {
  private socket: Socket | null = null;
  private offsetMs = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sequence = new PlaybackSequenceGate();
  private mediaListener: Listener | null = null;
  private streamListener: Listener | null = null;
  private pendingMedia: PlaybackEnvelopeV2 | null = null;
  private pendingStream: PlaybackEnvelopeV2 | null = null;
  private ownerToken: string | undefined;
  roomName: string | null = null;
  role: RoomRole = null;
  constructor(private serverUrl: string) {}
  async connect() {
    if (this.socket?.connected) return;
    this.socket = io(this.serverUrl, {transports: ['websocket'], reconnection: true, reconnectionAttempts: Infinity, timeout: 5000});
    await new Promise<void>((resolve, reject) => { this.socket!.once('connect', resolve); this.socket!.once('connect_error', reject); });
    this.attachListeners(); await this.synchronizeClock();
    this.refreshTimer = setInterval(() => this.synchronizeClock().catch(() => {}), 60000);
  }
  private attachListeners() {
    this.socket?.on('media_event', (event: any) => this.consume(event.data, 'media'));
    this.socket?.on('stream_change', (event: any) => this.consume(event.data, 'stream'));
    this.socket?.on('connect', () => {
      if (!this.roomName) return; const roomName = this.roomName; this.sequence.reset();
      ack<any>(this.socket!, 'join_room', {roomName, data: {ownerToken: this.ownerToken}})
        .then(result => { if (result.success) this.role = result.data.isOwner ? 'host' : 'guest'; }).catch(() => {});
    });
  }
  private consume(data: Record<string, unknown>, kind: 'media' | 'stream') {
    const envelope = normalizePlaybackEnvelope(data);
    if (!envelope || !this.sequence.accept(envelope)) return;
    const listener = kind === 'media' ? this.mediaListener : this.streamListener;
    if (listener) listener(envelope); else if (kind === 'media') this.pendingMedia = envelope; else this.pendingStream = envelope;
  }
  private async synchronizeClock() {
    if (!this.socket) return;
    const result = await probeClock(() => ack<{serverTime: number}>(this.socket!, 'time_sync', {}).then(value => value.serverTime), 5);
    this.offsetMs = result.offsetMs;
  }
  now() { return Date.now() + this.offsetMs; }
  onMedia(listener: Listener) { this.mediaListener = listener; const pending = this.pendingMedia; this.pendingMedia = null; if (pending?.sequence === this.sequence.lastSequence) listener(pending); return () => { if (this.mediaListener === listener) this.mediaListener = null; }; }
  onStream(listener: Listener) { this.streamListener = listener; const pending = this.pendingStream; this.pendingStream = null; if (pending?.sequence === this.sequence.lastSequence) listener(pending); return () => { if (this.streamListener === listener) this.streamListener = null; }; }
  async createRoom(roomName: string) { await this.connect(); this.sequence.reset(); const result: any = await ack(this.socket!, 'create_room', {roomName, data: {}}); if (result.success) { this.roomName = roomName; this.role = 'host'; this.ownerToken = result.data.ownerToken; } return result; }
  async joinRoom(roomName: string, ownerToken?: string) { await this.connect(); this.sequence.reset(); const result: any = await ack(this.socket!, 'join_room', {roomName, data: {ownerToken}}); if (result.success) { this.roomName = roomName; this.role = result.data.isOwner ? 'host' : 'guest'; this.ownerToken = ownerToken; } return result; }
  async leaveRoom() { if (!this.socket || !this.roomName) return; await ack(this.socket, 'leave_room', {roomName: this.roomName}); this.roomName = null; this.role = null; this.ownerToken = undefined; this.disconnect(); }
  emitMedia(envelope: PlaybackEnvelopeV2) { if (this.role === 'host' && this.roomName) this.socket?.emit('media_event', {roomName: this.roomName, data: {...envelope, capturedAtMs: envelope.capturedAtMs + this.offsetMs}}); }
  emitStream(envelope: PlaybackEnvelopeV2) { if (this.role === 'host' && this.roomName) this.socket?.emit('stream_change', {roomName: this.roomName, data: {...envelope, capturedAtMs: envelope.capturedAtMs + this.offsetMs}}); }
  disconnect() { if (this.refreshTimer) clearInterval(this.refreshTimer); this.refreshTimer = null; this.socket?.removeAllListeners(); this.socket?.disconnect(); this.socket = null; }
  static async listRooms(serverUrl: string): Promise<RoomSummary[]> { const socket = io(serverUrl, {transports: ['websocket'], reconnection: false, timeout: 5000}); try { await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); const result: any = await ack(socket, 'list_rooms'); return result.success ? result.data.roomUserCounts : []; } finally { socket.disconnect(); } }
}
