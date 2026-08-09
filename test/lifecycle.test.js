import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomLifecycle} from '../dist/room-lifecycle.js';

const envelope = sequence => ({version:2, sequence, capturedAtMs:1000, source:{platform:'desktop',adapter:'html'}, media:{canonicalId:'fixture',isLive:false}, playback:{state:'play',positionMs:5000,rate:1}, capabilities:{canPlay:true,canPause:true,canSeek:true,canSetRate:true,canLoadMedia:true}});
test('reconnect state restores a room and creates an owner-token rejoin payload', () => { const state=new RoomLifecycle(); state.restore({roomName:'room',role:'host'}); assert.deepEqual(state.rejoinPayload('token'),{roomName:'room',data:{ownerToken:'token'}}); });
test('ordered room events cache only the latest command for suspended-frame replay', () => { const state=new RoomLifecycle(); state.enter('room','guest'); const first=state.receive('media',{roomName:'room',data:envelope(4)},2000); assert.equal(first.data.targetPositionMs,6000); assert.equal(state.receive('media',{roomName:'room',data:envelope(3)},3000),null); assert.equal(state.replay(),first); });
test('leaving clears sequence and replay state', () => { const state=new RoomLifecycle(); state.enter('room','guest'); state.receive('stream',{data:envelope(9)},2000); state.leave(); assert.equal(state.replay(),null); state.enter('new','guest'); assert.ok(state.receive('media',{data:envelope(1)},2000)); });
