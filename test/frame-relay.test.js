import test from 'node:test';
import assert from 'node:assert/strict';
import {installFrameCommandRelay} from '../dist/browser/frame-relay.js';

const scope = (top=true) => { const sent=[]; const listeners=[]; const parent={postMessage:(message)=>sent.push({target:'parent',message})}; const child={postMessage:(message)=>sent.push({target:'child',message})}; const value={parent,frames:[child],addEventListener:(_t,fn)=>listeners.push(fn)}; value.top=top?value:{}; return {value,parent,child,sent,emit:(data,source)=>listeners[0]({data,source})}; };
test('sticky role/context/state reaches a delayed child when it announces readiness',()=>{const s=scope(); const dispatch=[]; const relay=installFrameCommandRelay(s.value,x=>dispatch.push(x)); relay({type:'set_context',url:'https://top.example'}); relay({type:'apply_media',data:{}}); s.sent.length=0; s.emit({type:'syncer-frame-ready'},s.child); assert.deepEqual(s.sent.map(x=>x.message.command.type),['set_context','apply_media']);});
test('nested frames only accept commands from their parent',()=>{const s=scope(false); const dispatch=[]; installFrameCommandRelay(s.value,x=>dispatch.push(x)); s.emit({type:'syncer-frame-command',command:{type:'set_role',role:'guest'}},{}); assert.equal(dispatch.length,0); s.emit({type:'syncer-frame-command',command:{type:'set_role',role:'guest'}},s.parent); assert.equal(dispatch.length,1);});
