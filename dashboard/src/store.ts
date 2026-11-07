import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Bucket, type Settings } from './lib/energy'
import type { Info, Reason, Telemetry } from './lib/protocol'
import type { ConnState, TransportKind } from './transport/types'
import type { DemoPresence } from './transport/demo'

export interface Sample {
  t: number
  p: number | null
  v: number | null
  i: number | null
  presence: boolean
  relay: boolean
}

export interface LogEvent {
  t: number
  kind: 'relay_on' | 'relay_off' | 'connect' | 'disconnect' | 'ack_error'
  reason?: Reason
  text?: string
}

export const MAX_SAMPLES = 3600 // 1 h a 1 Hz

const SETTINGS_KEY = 'tomada-upx:settings'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    /* armazenamento indisponível */
  }
  return DEFAULT_SETTINGS
}

interface State {
  kind: TransportKind | null
  conn: ConnState
  connDetail: string
  info: Info | null
  tel: Telemetry | null
  lastRx: number
  samples: Sample[]
  events: LogEvent[]
  history: Bucket[] // baldes já salvos (14 dias)
  live: Bucket | null // minuto em andamento
  settings: Settings
  demoPresence: DemoPresence
  rawLines: string[]

  setConn: (kind: TransportKind | null, conn: ConnState, detail?: string) => void
  pushTel: (t: number, tel: Telemetry) => void
  pushEvent: (e: LogEvent) => void
  setInfo: (i: Info) => void
  setHistory: (h: Bucket[]) => void
  appendHistory: (b: Bucket) => void
  setLive: (b: Bucket | null) => void
  setSettings: (s: Partial<Settings>) => void
  setDemoPresence: (p: DemoPresence) => void
  pushRaw: (line: string) => void
  resetSession: () => void
}

export const useStore = create<State>((set) => ({
  kind: null,
  conn: 'idle',
  connDetail: '',
  info: null,
  tel: null,
  lastRx: 0,
  samples: [],
  events: [],
  history: [],
  live: null,
  settings: loadSettings(),
  demoPresence: 'scenario',
  rawLines: [],

  setConn: (kind, conn, detail = '') => set({ kind, conn, connDetail: detail }),
  pushTel: (t, tel) =>
    set((s) => {
      const sample: Sample = { t, p: tel.p, v: tel.v, i: tel.i, presence: tel.presence, relay: tel.relay }
      const samples = s.samples.length >= MAX_SAMPLES ? [...s.samples.slice(-MAX_SAMPLES + 1), sample] : [...s.samples, sample]
      return { tel, lastRx: t, samples }
    }),
  pushEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 80) })),
  setInfo: (info) => set({ info, lastRx: Date.now() }),
  setHistory: (history) => set({ history }),
  appendHistory: (b) =>
    set((s) => {
      const i = s.history.findIndex((h) => h.key === b.key)
      if (i < 0) return { history: [...s.history, b] }
      const copy = s.history.slice()
      const o = copy[i]
      copy[i] = { ...o, wh: o.wh + b.wh, savedWh: o.savedWh + b.savedWh, onS: o.onS + b.onS, presenceS: o.presenceS + b.presenceS, maxW: Math.max(o.maxW, b.maxW) }
      return { history: copy }
    }),
  setLive: (live) => set({ live }),
  setSettings: (p) =>
    set((s) => {
      const settings = { ...s.settings, ...p }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        /* ignore */
      }
      return { settings }
    }),
  setDemoPresence: (demoPresence) => set({ demoPresence }),
  pushRaw: (line) => set((s) => ({ rawLines: [...s.rawLines.slice(-199), line] })),
  resetSession: () => set({ tel: null, info: null, samples: [], events: [], live: null, rawLines: [], lastRx: 0 }),
}))
