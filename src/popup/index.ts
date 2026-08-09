import type {RoomRole, RoomSummary} from '../types.js';

export type PopupAction =
  | {type: 'save_server'; serverUrl: string}
  | {type: 'create_room'; roomName: string}
  | {type: 'join_room'; roomName: string}
  | {type: 'leave_room'}
  | {type: 'list_rooms'};
export interface PopupState {serverUrl: string; roomName: string; role: RoomRole; status: string; rooms: RoomSummary[]; busy: boolean}
export const initialPopupState = (serverUrl = 'http://localhost:3000'): PopupState => ({serverUrl, roomName: '', role: null, status: 'Not connected', rooms: [], busy: false});
export const normalizePopupAction = (action: PopupAction): PopupAction => {
  if ('serverUrl' in action) return {...action, serverUrl: action.serverUrl.trim()};
  if ('roomName' in action) return {...action, roomName: action.roomName.trim()};
  return action;
};
export const roomStatus = (role: RoomRole, roomName: string, userCount?: number | null) => {
  if (!role) return 'Not connected';
  const label = role === 'host' ? 'Hosting' : 'Following';
  return userCount == null ? `${label} ${roomName}` : `${label} · ${userCount} connected`;
};
export const formatDuration = (durationMs?: number) => {
  if (!Number.isFinite(durationMs)) return '';
  const total = Math.max(0, Math.round(durationMs! / 1000));
  const hours = Math.floor(total / 3600); const minutes = Math.floor(total % 3600 / 60); const seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** Shared base styling; platform popups may layer store-specific presentation on top. */
export const POPUP_BASE_CSS = `:root{font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a43}*{box-sizing:border-box}body{margin:0;padding:14px;background:#f6f8fb}label{display:block;margin:8px 0}input{width:100%;padding:8px;border:1px solid #bcccdc;border-radius:7px}.actions{display:flex;gap:6px;margin:10px 0}button{padding:8px 10px;border:0;border-radius:7px;background:#1473e6;color:#fff}button:disabled{opacity:.55}#rooms{display:flex;flex-direction:column;gap:5px;margin-top:8px}#status{min-height:32px;color:#52606d}`;
