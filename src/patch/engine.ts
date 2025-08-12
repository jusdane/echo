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
  node: AudioNode;
  update: (p: any) => void;
};

// Initialize Y.js document
const { doc, awareness } = createYDoc('figma-for-music-patch-demo');
(window as any).__awareness = awareness;

const yModules = doc.getMap<any>('modules');
const yCables = doc.getArray<any>('cables');

// Defer store initialization
let projectStore: ReturnType<typeof useProjectStore> | null = null;

function getProjectStore() {
  if (!projectStore) {
    projectStore = useProjectStore();
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
    outGain = project.audioCtx.createGain();
    outGain.gain.value = 1;
    outGain.connect(project.audioCtx.destination);
  }
  return outGain;
}

function mkOsc(_id: string, p: any) {
  const project = getProjectStore();
  const osc = project.audioCtx.createOscillator();
  osc.type = (p?.wave || 'saw');
  osc.frequency.value = p?.freq ?? 220;
  osc.start();
  
  const g = project.audioCtx.createGain();
  g.gain.value = 0.3;
  osc.connect(g);
  
  return {
    node: g,
    update: (np: any) => {
      osc.type = np.wave || 'saw';
      osc.frequency.setValueAtTime(np.freq ?? 220, project.audioCtx.currentTime);
    }
  };
}

function mkFilter(_id: string, p: any) {
  const project = getProjectStore();
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
  if (runtime.has(m.id)) return runtime.get(m.id)!;
  
  let rt: RuntimeModule;
  if (m.type === 'osc') rt = { id: m.id, type: m.type, ...mkOsc(m.id, m.params) };
  else if (m.type === 'filter') rt = { id: m.id, type: m.type, ...mkFilter(m.id, m.params) };
  else if (m.type === 'gain') rt = { id: m.id, type: m.type, ...mkGain(m.id, m.params) };
  else rt = { id: m.id, type: m.type, node: getOutGain(), update: (_: any) => {} };
  
  runtime.set(m.id, rt);
  return rt;
}

function rebuild() {
  for (const rt of runtime.values()) {
    try {
      (rt.node as any).disconnect();
    } catch {}
  }
  
  const get = (id: string) => ensureRT(state.modules[id]);
  
  for (const c of state.cables) {
    const a = get(c[0]);
    const b = get(c[1]);
    if (a && b) {
      try {
        a.node.connect(b.node);
      } catch {}
    }
  }
}

function sync() {
  (state as any).modules = {};
  yModules.forEach((val: any, key: string) => {
    (state as any).modules[key] = val as ModuleState;
    ensureRT(val as ModuleState);
  });
  (state as any).cables = yCables.toArray() as Cable[];
  rebuild();
}

yModules.observeDeep(sync as any);
yCables.observe(sync as any);
sync();

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
    yModules.set(id, mod);
  }
  
  function connectModules(a: string, b: string) {
    yCables.push([[a, b]]);
  }
  
  function removeModule(id: string) {
    yModules.delete(id);
    const idx: number[] = [];
    yCables.toArray().forEach((c: any, i: number) => {
      if (c[0] === id || c[1] === id) idx.push(i);
    });
    idx.reverse().forEach(i => yCables.delete(i, 1));
    runtime.delete(id);
    rebuild();
    if (selectedId.value === id) selectedId.value = null;
  }
  
  function disconnectSelected() {
    if (!selectedId.value) return;
    const id = selectedId.value;
    const idx: number[] = [];
    yCables.toArray().forEach((c: any, i: number) => {
      if (c[0] === id || c[1] === id) idx.push(i);
    });
    idx.reverse().forEach(i => yCables.delete(i, 1));
    rebuild();
  }
  
  function setModulePos(id: string, x: number, y: number) {
    const m = yModules.get(id);
    if (!m) return;
    m.x = Math.max(8, Math.min(760, x));
    m.y = Math.max(8, Math.min(300, y));
    yModules.set(id, m);
  }
  
  function toggleSelect(id: string | null) {
    selectedId.value = id;
    (window as any).__awareness?.setLocalStateField('selection', id);
  }
  
  function getAudioOut() {
    const hasOut = Object.values(state.modules).some(m => m.type === 'out');
    if (!hasOut) {
      yModules.set('out', { id: 'out', type: 'out', x: 720, y: 160, params: {} });
    }
    return getOutGain();
  }
  
  function clearAll() {
    // Clear all modules
    yModules.clear();
    
    // Clear all cables
    yCables.delete(0, yCables.length);
    
    // Clear runtime modules
    runtime.clear();
    
    // Reset selection
    selectedId.value = null;
    
    // Reset ID counter
    idCounter = 1;
    
    // Rebuild audio graph
    rebuild();
    
    console.log('🧹 Canvas cleared - starting fresh!');
  }
  
  function updateModuleParams(id: string, params: any) {
    const module = yModules.get(id);
    if (module) {
      module.params = { ...module.params, ...params };
      yModules.set(id, module);
      
      // Update runtime if it exists
      const rt = runtime.get(id);
      if (rt) {
        rt.update(module.params);
      }
    }
  }
  
  return {
    doc: { awareness },
    yDoc: doc,
    yModules,
    state,
    addModule,
    connectModules,
    removeModule,
    setModulePos,
    toggleSelect,
    selectedId,
    getAudioOut,
    disconnectSelected,
    clearAll,
    updateModuleParams
  };
}