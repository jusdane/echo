import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export function createYDoc(roomId = 'figma-for-music-patch-demo') {
  const doc = new Y.Doc();
  
  // Use local WebSocket server for development
  const wsUrl = import.meta.env.DEV 
    ? 'ws://localhost:1234' 
    : 'wss://demos.yjs.dev';
    
  console.log('🔌 Creating Y.js document with WebSocket URL:', wsUrl);
  console.log('🔍 Environment DEV:', import.meta.env.DEV);
  
  const provider = new WebsocketProvider(wsUrl, roomId, doc);
  const awareness = provider.awareness;
  
  // Log connection status
  provider.on('status', ({ status }: { status: string }) => {
    console.log('📡 WebSocket connection status:', status);
  });
  
  provider.on('sync', (isSynced: boolean) => {
    console.log('🔄 Y.js sync status:', isSynced);
  });
  
  return { doc, provider, awareness };
}