import type { Telemetry } from './protocol'

/** Agregado de um minuto (ou de uma hora, no histórico de demonstração). */
export interface Bucket {
  key: number // início do período (ms epoch)
  wh: number // energia consumida
  savedWh: number // energia evitada (desligada por ausência)
  onS: number // segundos com a tomada ligada
  presenceS: number // segundos com presença
  maxW: number
}

const MINUTE = 60_000

/**
 * Integra a telemetria em baldes de 1 minuto. A energia é integrada a partir da
 * potência (p·dt), o que não depende do contador interno do PZEM (que pode ser zerado).
 */
export class MinuteAccumulator {
  private cur: Bucket | null = null
  private lastT: number | null = null
  private lastSaved: number | null = null

  add(t: number, tel: Telemetry): Bucket | null {
    const key = Math.floor(t / MINUTE) * MINUTE
    let done: Bucket | null = null
    if (this.cur && this.cur.key !== key) {
      done = this.cur
      this.cur = null
    }
    if (!this.cur) this.cur = { key, wh: 0, savedWh: 0, onS: 0, presenceS: 0, maxW: 0 }

    // dt limitado a 5 s: se a conexão cair, não inventamos consumo no buraco
    const dt = this.lastT === null ? 1 : Math.min(Math.max((t - this.lastT) / 1000, 0), 5)
    this.lastT = t

    if (tel.p !== null && tel.p >= 0) {
      this.cur.wh += (tel.p * dt) / 3600
      this.cur.maxW = Math.max(this.cur.maxW, tel.p)
    }
    if (tel.relay) this.cur.onS += dt
    if (tel.presence) this.cur.presenceS += dt

    if (tel.saved_wh !== null) {
      if (this.lastSaved !== null) {
        const d = tel.saved_wh - this.lastSaved
        if (d > 0 && d < 50) this.cur.savedWh += d // d<0 => contador zerado
      }
      this.lastSaved = tel.saved_wh
    }
    return done
  }

  /** Balde em andamento (para mostrar "hoje" em tempo real). */
  peek(): Bucket | null {
    return this.cur
  }

  flush(): Bucket | null {
    const b = this.cur
    this.cur = null
    return b
  }

  reset() {
    this.cur = null
    this.lastT = null
    this.lastSaved = null
  }
}

export interface DayTotal {
  day: string // AAAA-MM-DD (horário local)
  ts: number // meia-noite local
  wh: number
  savedWh: number
  onS: number
  presenceS: number
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function groupByDay(buckets: Bucket[]): DayTotal[] {
  const map = new Map<string, DayTotal>()
  for (const b of buckets) {
    const day = dayKey(b.key)
    let t = map.get(day)
    if (!t) {
      const d = new Date(b.key)
      t = { day, ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), wh: 0, savedWh: 0, onS: 0, presenceS: 0 }
      map.set(day, t)
    }
    t.wh += b.wh
    t.savedWh += b.savedWh
    t.onS += b.onS
    t.presenceS += b.presenceS
  }
  return [...map.values()].sort((a, b) => a.ts - b.ts)
}

/** Preenche dias sem dados com zero para o gráfico não "pular" datas. */
export function lastNDays(days: DayTotal[], n: number, today = Date.now()): DayTotal[] {
  const map = new Map(days.map((d) => [d.day, d]))
  const out: DayTotal[] = []
  const base = new Date(today)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i)
    const key = dayKey(d.getTime())
    out.push(map.get(key) ?? { day: key, ts: d.getTime(), wh: 0, savedWh: 0, onS: 0, presenceS: 0 })
  }
  return out
}

export interface Settings {
  tariff: number // R$/kWh
  co2Factor: number // kg CO2 por kWh
  prototypeCost: number // R$
}

export const DEFAULT_SETTINGS: Settings = {
  tariff: 0.9, // valor usado no relatório (seção 5.1.2)
  co2Factor: 0.0385, // fator médio do SIN, 2023 (MCTI) — ajustável
  prototypeCost: 176, // orçamento do protótipo (Tabela 2)
}

export interface Projection {
  avgSavedKwhDay: number
  monthlySavedKwh: number
  monthlySavedBRL: number
  monthlyCo2Kg: number
  paybackMonths: number | null
  basisDays: number
}

/** Projeção mensal com base na média dos dias que têm dados. */
export function project(days: DayTotal[], s: Settings): Projection {
  const withData = days.filter((d) => d.onS > 0 || d.savedWh > 0)
  const basisDays = withData.length
  const avgSavedKwhDay = basisDays ? withData.reduce((a, d) => a + d.savedWh, 0) / 1000 / basisDays : 0
  const monthlySavedKwh = avgSavedKwhDay * 30
  const monthlySavedBRL = monthlySavedKwh * s.tariff
  return {
    avgSavedKwhDay,
    monthlySavedKwh,
    monthlySavedBRL,
    monthlyCo2Kg: monthlySavedKwh * s.co2Factor,
    paybackMonths: monthlySavedBRL > 0.001 ? s.prototypeCost / monthlySavedBRL : null,
    basisDays,
  }
}

// ---------- formatação pt-BR ----------
const nf = (d: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const nf0 = nf(0)
const nf1 = nf(1)
const nf2 = nf(2)

export const fmt = {
  n: (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : nf(d).format(v)),
  w: (v: number | null) => (v === null ? '—' : v >= 100 ? nf0.format(v) : nf1.format(v)),
  kwh: (wh: number) => (wh < 1000 ? `${nf1.format(wh)} Wh` : `${nf2.format(wh / 1000)} kWh`),
  brl: (v: number) => (v > 0 && v < 0.01 ? 'menos de R$ 0,01' : `R$ ${nf2.format(v)}`),
  kg: (v: number) => (v < 1 ? `${nf0.format(v * 1000)} g` : `${nf2.format(v)} kg`),
  dur: (s: number) => {
    s = Math.max(0, Math.round(s))
    if (s < 60) return `${s} s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
    const h = Math.floor(m / 60)
    return `${h} h ${String(m % 60).padStart(2, '0')} min`
  },
}
