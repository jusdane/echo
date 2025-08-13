import { reactive, ref } from 'vue';
import { createYDoc } from '../realtime/yDoc';
import { useProjectStore } from '../stores/project';

type ModuleType = 'osc' | 'filter' | 'gain' | 'out';
type ModuleState = {
  id: string;
  type: ModuleType;
  x: number;
  y: number;
  params: any;
};
type Cable = [string, string];

export type PatchState = {
  modules: Record<string, ModuleState>;
  cables: Cable[];
};

type RuntimeModule = {
  id: string;
  type: ModuleType;
  node: AudioNode | null;
  update: (p: any) => void;
};

// Initialize Y.js document
const { doc, awareness } = createYDoc('figma-for-music-patch-demo');
(window as any).__awareness = awareness;

// 🚫 Y.js completely removed - using direct state management
// const yModules = doc.getMap<any>('modules');
// const yCables = doc.getArray<any>('cables');

// Defer store initialization
let projectStore: ReturnType<typeof useProjectStore> | null = null;

function getProjectStore() {
  if (!projectStore) {
    try {
      projectStore = useProjectStore();
    } catch (error) {
      // Store not ready yet, return null
              console.log('Pinia store not ready yet, deferring audio creation');
      return null;
    }
  }
  return projectStore;
}

const state = reactive<PatchState>({
  modules: {},
  cables: []
});

const selectedId = ref<string | null>(null);
const runtime = new Map<string, RuntimeModule>();

// Defer audio context creation
let outGain: GainNode | null = null;

function getOutGain() {
  if (!outGain) {
    const project = getProjectStore();
    if (!project) {
      return null;
    }
    
    try {
      outGain = project.audioCtx.createGain();
      outGain.gain.value = 1;
      outGain.connect(project.audioCtx.destination);
    } catch (error) {
      console.error('getOutGain: Failed to create output gain:', error);
      return null;
    }
  }
  return outGain;
}

function startAudio() {
  const project = getProjectStore();
  if (!project) {
    return;
  }
  
  if (project.audioCtx.state === 'suspended') {
    project.audioCtx.resume();
  }
  
  // Test audio output
  try {
    const testOsc = project.audioCtx.createOscillator();
    const testGain = project.audioCtx.createGain();
    testOsc.frequency.value = 440;
    testGain.gain.value = 0.5;
    testOsc.connect(testGain);
    testGain.connect(project.audioCtx.destination);
    testOsc.start();
    setTimeout(() => {
      testOsc.stop();
      testOsc.disconnect();
      testGain.disconnect();
    }, 500);
  } catch (error) {
    console.error('Audio test failed:', error);
  }
}

function ensureAudioOutput() {
  // Always ensure we have an output module and it's connected
  const hasOut = Object.values(state.modules).some(m => m.type === 'out');
  
  if (!hasOut) {
    (state as any).modules['out'] = { id: 'out', type: 'out', x: 720, y: 160, params: {} };
  }
  
  // Make sure the output module is connected to speakers
  const outModule = Object.values(state.modules).find(m => m.type === 'out');
  
  if (outModule && outModule.id && outModule.type) {
    const rt = ensureRT(outModule);
    
    if (rt && rt.node) {
      // Disconnect old connections
      try { rt.node.disconnect(); } catch {}
      // Connect output module directly to speakers
      const project = getProjectStore();
      if (project?.audioCtx) {
        rt.node.connect(project.audioCtx.destination);
      }
    }
  }
}

function mkOsc(_id: string, p: any) {
  const project = getProjectStore();
  if (!project) {
    console.log('mkOsc: No project store available');
    return { node: null, update: (_: any) => {} };
  }
  
  // Resume suspended audio context before creating oscillator
  if (project.audioCtx.state === 'suspended') {
    try {
      project.audioCtx.resume();
    } catch (error) {
      console.error('mkOsc: Failed to resume audio context:', error);
    }
  }
  
  try {
    const osc = project.audioCtx.createOscillator();
    // Fix wave type validation
    const wave = p?.wave || 'sine';
    if (wave === 'saw') {
      osc.type = 'sawtooth';
    } else if (wave === 'square') {
      osc.type = 'square';
    } else {
      osc.type = 'sine';
    }
    osc.frequency.value = p?.freq ?? 220;
    osc.start();
    
    const g = project.audioCtx.createGain();
    g.gain.value = 0.8; // Increased from 0.3 to 0.8 for better audibility
    osc.connect(g);
    
      // Store references to prevent garbage collection
      (g as any)._oscillator = osc;

      // Ensure audio context stays active
      const keepAliveInterval = setInterval(() => {
        if (project.audioCtx.state === 'suspended') {
          try {
            project.audioCtx.resume();
          } catch (error) {
            // Silent fail for keep-alive
          }
        }
      }, 1000);

      // Store the interval so we can clear it later if needed
      (g as any)._keepAliveInterval = keepAliveInterval;
    
    return {
      node: g,
      update: (np: any) => {
        const wave = np.wave || 'sine';
        if (wave === 'saw') {
          osc.type = 'sawtooth';
        } else if (wave === 'square') {
          osc.type = 'square';
        } else {
          osc.type = 'sine';
        }
        osc.frequency.setValueAtTime(np.freq ?? 220, project.audioCtx.currentTime);
      }
    };
  } catch (error) {
          console.error('mkOsc: Failed to create oscillator:', error);
    return { node: null, update: (_: any) => {} };
  }
}

function mkFilter(_id: string, p: any) {
  const project = getProjectStore();
  if (!project) return { node: null, update: (_: any) => {} };
  const biq = project.audioCtx.createBiquadFilter();
  biq.type = (p?.type || 'lowpass');
  biq.frequency.value = p?.cutoff ?? 1200;
  biq.Q.value = p?.q ?? 0.8;
  
  return {
    node: biq,
    update: (np: any) => {
      biq.type = np.type || 'lowpass';
      biq.frequency.setValueAtTime(np.cutoff ?? 1200, project.audioCtx.currentTime);
      biq.Q.setValueAtTime(np.q ?? 0.8, project.audioCtx.currentTime);
    }
  };
}

function mkGain(_id: string, p: any) {
  const project = getProjectStore();
  if (!project) return { node: null, update: (_: any) => {} };
  const g = project.audioCtx.createGain();
  g.gain.value = p?.gain ?? 0.7;
  
  return {
    node: g,
    update: (np: any) => {
      g.gain.setValueAtTime(np.gain ?? 0.7, project.audioCtx.currentTime);
    }
  };
}

function ensureRT(m: ModuleState) {
  // Safety check - ensure module exists
  if (!m || !m.id) {
    console.warn('ensureRT called with invalid module:', m);
    return null;
  }
  
  if (runtime.has(m.id)) {
    const existing = runtime.get(m.id)!;
          // If we have a module but no audio node, try to create it now
      if (!existing.node && getProjectStore()) {
        runtime.delete(m.id);
      } else {
        return existing;
      }
  }
  
  let rt: RuntimeModule;
  if (m.type === 'osc') rt = { id: m.id, type: m.type, ...mkOsc(m.id, m.params) };
  else if (m.type === 'filter') rt = { id: m.id, type: m.type, ...mkFilter(m.id, m.params) };
  else if (m.type === 'gain') rt = { id: m.id, type: m.type, ...mkGain(m.id, m.params) };
  else {
    const outGainNode = getOutGain();
    rt = { id: m.id, type: m.type, node: outGainNode, update: (_: any) => {} };
  }
  
  runtime.set(m.id, rt);
  return rt;
}

function rebuild() {
  // Disconnect all existing connections
  for (const rt of runtime.values()) {
    if (rt.node) {
      try {
        rt.node.disconnect();
      } catch (error) {
        console.warn('rebuild: Failed to disconnect module:', rt.id, error);
      }
    }
  }
  
  const get = (id: string) => {
    const module = state.modules[id];
    if (!module) {
      return null;
    }
    
    // Reuse existing runtime if available
    const existingRT = runtime.get(id);
    if (existingRT && existingRT.node) {
      return existingRT;
    }
    
    // Create new runtime if none exists
    return ensureRT(module);
  };
  
  // Connect modules according to cables
  for (const c of state.cables) {
    const a = get(c[0]);
    const b = get(c[1]);
    if (a && b && a.node && b.node) {
      try {
        a.node.connect(b.node);
      } catch (error) {
        console.error('rebuild: Failed to connect', a.id, '->', b.id, error);
      }
    }
  }

  // Ensure output module is connected to speakers
  ensureAudioOutput();
}

// 🚫 Y.js sync function removed - not needed in single-user mode
// function sync() { ... }

// 🚫 COMPLETELY DISABLED: Multiplayer synchronization
// yModules.observeDeep(sync as any);
// yCables.observe(sync as any);
// sync();

// Initialize empty state
(state as any).modules = {};
(state as any).cables = [];

let idCounter = 1;
const newId = (pfx: string) => `${pfx}_${idCounter++}`;

export function usePatch() {
  function addModule(type: ModuleType) {
    const id = newId(type);
      const mod: ModuleState = {
    id, type, x: 40 + Math.random() * 300, y: 40 + Math.random() * 200, params: {}
  };
  if (type === 'out') {
    mod.x = 600;
    mod.y = 160;
  }
  
  // Add module to state
  (state as any).modules[id] = mod;
  
  // Create runtime if store is available
  if (getProjectStore()) {
    ensureRT(mod);
  }
  
  return id;
  }
  
  function connectModules(a: string, b: string) {
    // Ensure output module exists if connecting to 'out'
    if (b === 'out') {
      const hasOut = Object.values(state.modules).some(m => m.type === 'out');
      if (!hasOut) {
        (state as any).modules['out'] = { id: 'out', type: 'out', x: 720, y: 160, params: {} };
      }
      ensureAudioOutput();
    }
    
    // Add cable to state
    (state as any).cables.push([a, b]);
    
    // Establish the actual audio connection
    const aModule = (state as any).modules[a];
    const bModule = (state as any).modules[b];
    
    if (aModule && bModule) {
      const aRT = runtime.get(a);
      const bRT = runtime.get(b);
      
      if (aRT?.node && bRT?.node) {
        try {
          aRT.node.connect(bRT.node);
        } catch (error) {
          console.error('connectModules: Failed to connect audio:', a, '->', b, error);
        }
      }
    }
  }
  
  function removeModule(id: string) {
    // 🎯 SINGLE-USER MODE: Remove from state instead of Y.js
    delete (state as any).modules[id];
    const idx: number[] = [];
    (state as any).cables.forEach((c: any, i: number) => {
      if (c[0] === id || c[1] === id) idx.push(i);
    });
    idx.reverse().forEach(i => (state as any).cables.splice(i, 1));
    runtime.delete(id);
    rebuild();
    if (selectedId.value === id) selectedId.value = null;
  }
  
  function disconnectSelected() {
    if (!selectedId.value) return;
    const id = selectedId.value;
    const idx: number[] = [];
    (state as any).cables.forEach((c: any, i: number) => {
      if (c[0] === id || c[1] === id) idx.push(i);
    });
    idx.reverse().forEach(i => (state as any).cables.splice(i, 1));
    rebuild();
  }
  
  function setModulePos(id: string, x: number, y: number) {
    const m = (state as any).modules[id];
    if (!m) return;
    m.x = Math.max(8, Math.min(760, x));
    m.y = Math.max(8, Math.min(300, y));
    (state as any).modules[id] = m;
  }
  
  function toggleSelect(id: string | null) {
    selectedId.value = id;
    (window as any).__awareness?.setLocalStateField('selection', id);
  }
  
  function getAudioOut() {
    const hasOut = Object.values(state.modules).some(m => m.type === 'out');
    if (!hasOut) {
      (state as any).modules['out'] = { id: 'out', type: 'out', x: 720, y: 160, params: {} };
    }
    return getOutGain();
  }
  
  function clearAll() {
    // Clear state directly
    (state as any).modules = {};
    (state as any).cables = [];
    
    // Clear runtime modules
    runtime.clear();
    
    // Reset selection
    selectedId.value = null;
    
    // Reset ID counter
    idCounter = 1;
    
    // Rebuild audio graph
    rebuild();
  }
  
  function updateModuleParams(id: string, params: any) {
    const module = (state as any).modules[id];
    if (module) {
      module.params = { ...module.params, ...params };
      (state as any).modules[id] = module;
      
      // Update runtime if it exists
      const rt = runtime.get(id);
      if (rt && rt.node) {
        rt.update(module.params);
      }
    }
  }
  
  function retryAudioCreation() {
    // Try to create audio nodes for modules that don't have them yet
    let needsRebuild = false;
    for (const [id, rt] of runtime.entries()) {
      if (!rt.node && getProjectStore()) {
        runtime.delete(id);
        needsRebuild = true;
      }
    }
    if (needsRebuild) {
      try {
        rebuild();
      } catch (error) {
        console.warn('Failed to rebuild audio graph:', error);
      }
    }
  }
  
  return {
    doc: { awareness },
    state,
    runtime, // Expose runtime for debugging
    addModule,
    connectModules,
    removeModule,
    setModulePos,
    toggleSelect,
    selectedId,
    getAudioOut,
    disconnectSelected,
    clearAll,
    updateModuleParams,
    startAudio,
    ensureAudioOutput,
    retryAudioCreation
  };
}