<template><div style='padding:16px;display:flex;flex-direction:column;gap:12px;'><h2>Patch View (Multiplayer)</h2><div style='display:flex;gap:8px;'><button @click='addOsc'>Add Osc</button><button @click='addFilter'>Add Filter</button><button @click='addGain'>Add Gain</button><button @click='clearAll' style='background-color: #ff6b6b; color: white;'>Clear All</button><button @click='recordToTrack' :disabled='recording'>{{ recording ? 'Recording...' : 'Record to Track' }}</button></div><div style='position:relative;border:1px solid #ddd;height:360px;border-radius:8px;'><canvas ref='canvas' width='900' height='340' style='width:100%;height:100%;'></canvas><PresenceCursors/></div><small>Drag modules. Click two modules to connect. Backspace to delete module; Delete to remove its connections. Ctrl+Shift+C to clear all. Select a module and use Arrow keys to adjust parameters, 'w' to cycle waves, 't' to cycle filter types.</small></div></template><script setup lang='ts'>import { onMounted, onUnmounted, ref } from 'vue'; import { usePatch } from '../patch/engine'; import PresenceCursors from '../realtime/PresenceCursors.vue'; import { useProjectStore } from '../stores/project'; const { doc, state, addModule, connectModules, removeModule, setModulePos, toggleSelect, selectedId, getAudioOut, disconnectSelected, clearAll, updateModuleParams } = usePatch(); const canvas = ref<HTMLCanvasElement|null>(null); let ctx: CanvasRenderingContext2D|null = null; function draw() {
  if (!canvas.value || !ctx) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  
  // Draw cables
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  for (const c of state.cables) {
    const a = state.modules[c[0]];
    const b = state.modules[c[1]];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x + 60, a.y + 20);
    ctx.lineTo(b.x, b.y + 20);
    ctx.stroke();
  }
  
  // Draw modules
  for (const [id, m] of Object.entries(state.modules)) {
    // Determine fill color based on state
    if (selectedId.value === id) {
      ctx.fillStyle = '#eef7ff'; // Selected - light blue
    } else if (hoveredModule === id) {
      ctx.fillStyle = '#fff3cd'; // Hovered - light yellow
    } else {
      ctx.fillStyle = '#f6f6f6'; // Normal - light gray
    }
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Draw main module rectangle
    ctx.fillRect(m.x, m.y, 120, 40);
    ctx.strokeRect(m.x, m.y, 120, 40);
    
    // Draw grab area indicator when hovering
    if (hoveredModule === id) {
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(m.x - 8, m.y - 8, 136, 56);
      ctx.setLineDash([]); // Reset line dash
    }
    
    // Draw module text
    ctx.fillStyle = '#111';
    ctx.fillText(`${m.type}`, m.x + 8, m.y + 24);
    
    // Draw parameter values
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    if (m.type === 'osc') {
      const freq = m.params?.freq || 220;
      const wave = m.params?.wave || 'saw';
      ctx.fillText(`${wave} ${freq}Hz`, m.x + 8, m.y + 36);
    } else if (m.type === 'filter') {
      const cutoff = m.params?.cutoff || 1200;
      const q = m.params?.q || 0.8;
      ctx.fillText(`${cutoff}Hz Q:${q}`, m.x + 8, m.y + 36);
    } else if (m.type === 'gain') {
      const gain = m.params?.gain || 0.7;
      ctx.fillText(`${Math.round(gain * 100)}%`, m.x + 8, m.y + 36);
    }
  }
  
  requestAnimationFrame(draw);
} let dragging:string|null=null; let offsetX=0, offsetY=0; let lastClick: string | null = null;
let hoveredModule: string | null = null; function hit(x: number, y: number) { 
  const GRAB_PADDING = 8; // Extra pixels around each module for easier grabbing
  
  for (const [id, m] of Object.entries(state.modules)) {
    // Check if click is within the expanded grab area
    if (x >= m.x - GRAB_PADDING && 
        x <= m.x + 120 + GRAB_PADDING && 
        y >= m.y - GRAB_PADDING && 
        y <= m.y + 40 + GRAB_PADDING) {
      return id;
    }
  }
  return null;
} function onDown(e:MouseEvent){ const r=canvas.value!.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top; const id=hit(x,y); if(id){ dragging=id; offsetX=x-state.modules[id].x; offsetY=y-state.modules[id].y; toggleSelect(id); if(lastClick && lastClick!==id){ connectModules(lastClick,id); lastClick=null; } else { lastClick=id; } } else { toggleSelect(null); } } function onMove(e: MouseEvent) { 
  const r = canvas.value!.getBoundingClientRect(); 
  const x = e.clientX - r.left, y = e.clientY - r.top; 
  
  // Update cursor position for presence
  (doc.awareness as any).setLocalStateField('cursor', { x, y }); 
  
  // Handle dragging
  if (dragging) {
    setModulePos(dragging, x - offsetX, y - offsetY); 
  }
  
  // Update hover state for visual feedback
  const newHovered = hit(x, y);
  if (newHovered !== hoveredModule) {
    hoveredModule = newHovered;
    // Force redraw to show hover effects
    draw();
  }
} function onUp(){ dragging=null; } function onKey(e: KeyboardEvent) { 
  if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId.value) { 
    if (e.key === 'Backspace') removeModule(selectedId.value); 
    else disconnectSelected(); 
  }
  // Add Ctrl+Shift+C or Cmd+Shift+C to clear all
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
    clearAll();
  }
  
  // Parameter control shortcuts for selected module
  if (selectedId.value) {
    const module = state.modules[selectedId.value];
    if (module) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (module.type === 'osc') {
            const currentFreq = module.params?.freq || 220;
            updateOscParams(selectedId.value, Math.min(2000, currentFreq + 50), module.params?.wave || 'saw');
          } else if (module.type === 'filter') {
            const currentCutoff = module.params?.cutoff || 1200;
            updateFilterParams(selectedId.value, Math.min(8000, currentCutoff + 100), module.params?.q || 0.8, module.params?.type || 'lowpass');
          } else if (module.type === 'gain') {
            const currentGain = module.params?.gain || 0.7;
            updateGainParams(selectedId.value, Math.min(1, currentGain + 0.1));
          }
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          if (module.type === 'osc') {
            const currentFreq = module.params?.freq || 220;
            updateOscParams(selectedId.value, Math.max(20, currentFreq - 50), module.params?.wave || 'saw');
          } else if (module.type === 'filter') {
            const currentCutoff = module.params?.cutoff || 1200;
            updateFilterParams(selectedId.value, Math.max(20, currentCutoff - 100), module.params?.q || 0.8, module.params?.type || 'lowpass');
          } else if (module.type === 'gain') {
            const currentGain = module.params?.gain || 0.7;
            updateGainParams(selectedId.value, Math.max(0, currentGain - 0.1));
          }
          break;
          
        case 'w':
          if (module.type === 'osc') {
            const waves = ['saw', 'sine', 'square', 'triangle'];
            const currentWave = module.params?.wave || 'saw';
            const currentIndex = waves.indexOf(currentWave);
            const nextWave = waves[(currentIndex + 1) % waves.length];
            updateOscParams(selectedId.value, module.params?.freq || 220, nextWave);
          }
          break;
          
        case 't':
          if (module.type === 'filter') {
            const types = ['lowpass', 'highpass', 'bandpass', 'notch'];
            const currentType = module.params?.type || 'lowpass';
            const currentIndex = types.indexOf(currentType);
            const nextType = types[(currentIndex + 1) % types.length];
            updateFilterParams(selectedId.value, module.params?.cutoff || 1200, module.params?.q || 0.8, nextType);
          }
          break;
      }
    }
  }
}

// Parameter control functions using the engine
function updateOscParams(id: string, freq: number, wave: string) {
  updateModuleParams(id, { freq, wave });
}

function updateFilterParams(id: string, cutoff: number, q: number, type: string) {
  updateModuleParams(id, { cutoff, q, type });
}

function updateGainParams(id: string, gain: number) {
  updateModuleParams(id, { gain });
} onMounted(() => {
  ctx = canvas.value!.getContext('2d');
  canvas.value!.addEventListener('mousedown', onDown);
  canvas.value!.addEventListener('mousemove', onMove);
  canvas.value!.addEventListener('mouseleave', () => {
    hoveredModule = null;
    draw();
  });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
  draw();
}); onUnmounted(()=>{ canvas.value?.removeEventListener('mousedown',onDown); canvas.value?.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); window.removeEventListener('keydown',onKey); }); const addOsc=()=>addModule('osc'); const addFilter=()=>addModule('filter'); const addGain=()=>addModule('gain'); const recording = ref(false); const project=useProjectStore(); async function recordToTrack(){ if(recording.value) return; const out=getAudioOut(); const dest=project.audioCtx.createMediaStreamDestination(); out.connect(dest); const rec=new MediaRecorder(dest.stream); const chunks:BlobPart[]=[]; rec.ondataavailable=e=>chunks.push(e.data); rec.onstop=()=>{ const blob=new Blob(chunks,{type:'audio/webm'}); project.addTakeFromBlob(blob,'Patch Take'); try{ out.disconnect(dest); }catch{} recording.value=false; }; recording.value=true; rec.start(); setTimeout(()=>{ if(rec.state!=='inactive') rec.stop(); }, 10000); } </script>