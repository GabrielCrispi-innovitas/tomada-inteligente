// Protocolo ESP32 <-> dashboard: uma mensagem JSON por linha (docs/protocolo.md).
// O mesmo parser é usado para USB (Web Serial), Wi-Fi (WebSocket) e modo demo.

export type Mode = 'auto' | 'on' | 'off'
export type Reason = 'boot' | 'presence' | 'absence' | 'manual'

export interface Telemetry {
  type: 'tel'
  seq: number
  up: number
  v: number | null
  i: number | null
  p: number | null
  pf: number | null
  hz: number | null
  kwh: number | null
  presence: boolean
  moving: boolean
  static: boolean
  dist: number
  e_mov: number
  e_sta: number
  relay: boolean
  mode: Mode
  reason: Reason
  countdown: number
  timeout: number
  saved_wh: number | null
  saved_s: number
  ref_w: number | null
  meter_ok: boolean
  radar_ok: boolean
  rssi: number
}

export interface Info {
  type: 'info'
  fw: string
  sim: boolean
  timeout: number
  mode: Mode
  wifi: boolean
  ip: string
  host: string
  radar_uart: boolean
  meter_ok: boolean
}

export interface DeviceEvent {
  type: 'evt'
  kind: 'relay_on' | 'relay_off'
  reason: Reason
  up: number
}

export interface Ack {
  type: 'ack'
  cmd: string
  ok: boolean
  msg?: string
}

export type DeviceMessage = Telemetry | Info | DeviceEvent | Ack

export type Command =
  | { cmd: 'mode'; value: Mode }
  | { cmd: 'timeout'; value: number }
  | { cmd: 'reset_energy' }
  | { cmd: 'info' }

const MODES: readonly Mode[] = ['auto', 'on', 'off']
const REASONS: readonly Reason[] = ['boot', 'presence', 'absence', 'manual']

type Obj = Record<string, unknown>

const num = (o: Obj, k: string): number | null => {
  const v = o[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const int = (o: Obj, k: string, d = 0): number => num(o, k) ?? d
const bool = (o: Obj, k: string): boolean => o[k] === true
const str = (o: Obj, k: string, d = ''): string => (typeof o[k] === 'string' ? (o[k] as string) : d)
const oneOf = <T extends string>(o: Obj, k: string, list: readonly T[], d: T): T =>
  list.includes(o[k] as T) ? (o[k] as T) : d

export function parseLine(raw: string): DeviceMessage | null {
  const line = raw.trim()
  if (!line.startsWith('{') || !line.endsWith('}')) return null
  let o: Obj
  try {
    const parsed: unknown = JSON.parse(line)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    o = parsed as Obj
  } catch {
    return null
  }

  switch (o.type) {
    case 'tel':
      return {
        type: 'tel',
        seq: int(o, 'seq'),
        up: int(o, 'up'),
        v: num(o, 'v'),
        i: num(o, 'i'),
        p: num(o, 'p'),
        pf: num(o, 'pf'),
        hz: num(o, 'hz'),
        kwh: num(o, 'kwh'),
        presence: bool(o, 'presence'),
        moving: bool(o, 'moving'),
        static: bool(o, 'static'),
        dist: int(o, 'dist'),
        e_mov: int(o, 'e_mov'),
        e_sta: int(o, 'e_sta'),
        relay: bool(o, 'relay'),
        mode: oneOf(o, 'mode', MODES, 'auto'),
        reason: oneOf(o, 'reason', REASONS, 'boot'),
        countdown: int(o, 'countdown'),
        timeout: int(o, 'timeout'),
        saved_wh: num(o, 'saved_wh'),
        saved_s: int(o, 'saved_s'),
        ref_w: num(o, 'ref_w'),
        meter_ok: bool(o, 'meter_ok'),
        radar_ok: bool(o, 'radar_ok'),
        rssi: int(o, 'rssi'),
      }
    case 'info':
      return {
        type: 'info',
        fw: str(o, 'fw', '?'),
        sim: bool(o, 'sim'),
        timeout: int(o, 'timeout'),
        mode: oneOf(o, 'mode', MODES, 'auto'),
        wifi: bool(o, 'wifi'),
        ip: str(o, 'ip'),
        host: str(o, 'host'),
        radar_uart: bool(o, 'radar_uart'),
        meter_ok: bool(o, 'meter_ok'),
      }
    case 'evt': {
      const kind = o.kind === 'relay_on' || o.kind === 'relay_off' ? o.kind : null
      if (!kind) return null
      return { type: 'evt', kind, reason: oneOf(o, 'reason', REASONS, 'boot'), up: int(o, 'up') }
    }
    case 'ack':
      return { type: 'ack', cmd: str(o, 'cmd'), ok: bool(o, 'ok'), msg: typeof o.msg === 'string' ? o.msg : undefined }
    default:
      return null
  }
}

export const encodeCommand = (c: Command): string => JSON.stringify(c)

/** Junta pedaços de texto vindos da serial em linhas completas. */
export class LineSplitter {
  private buf = ''
  private readonly max: number

  constructor(max = 8192) {
    this.max = max
  }

  push(chunk: string): string[] {
    this.buf += chunk
    const parts = this.buf.split(/\r?\n/)
    this.buf = parts.pop() ?? ''
    if (this.buf.length > this.max) this.buf = '' // lixo sem quebra de linha
    return parts.filter((l) => l.trim().length > 0)
  }

  reset() {
    this.buf = ''
  }
}
