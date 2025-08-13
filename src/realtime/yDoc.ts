// 🚫 COMPLETELY DISABLED: Y.js functionality
// import * as Y from 'yjs';
// import { WebsocketProvider } from 'y-websocket';

export function createYDoc(roomId = 'figma-for-music-patch-demo') {
  console.log('🚫 Y.js completely disabled - using mock objects');
  
  // Return mock objects that do nothing
  return {
    doc: { 
      awareness: {},
      getMap: () => ({ 
        set: () => {}, 
        get: () => undefined, 
        has: () => false, 
        delete: () => {},
        forEach: () => {}
      }),
      getArray: () => ({ 
        push: () => {}, 
        delete: () => {}, 
        toArray: () => [], 
        forEach: () => {}
      })
    },
    provider: { on: () => {}, disconnect: () => {}, awareness: { setLocalStateField: () => {}, on: () => {} } },
    awareness: { setLocalStateField: () => {}, on: () => {} }
  };
}