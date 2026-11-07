import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, MinuteAccumulator, groupByDay, lastNDays, project } from '../lib/energy'
import { parseLine, type Telemetry } from '../lib/protocol'

const tel = (p: number | null, relay = true, presence = true, saved = 0): Telemetry =>
  parseLine(JSON.stringify({ type: 'tel', p, relay, presence, saved_wh: saved })) as Telemetry

describe('MinuteAccumulator', () => {
  it('integra 100 W por 1 minuto = 1,667 Wh e fecha o balde na virada', () => {
    const acc = new MinuteAccumulator()
    const t0 = Date.UTC(2026, 10, 7, 12, 0, 0)
    let done = null
    for (let s = 0; s <= 60; s++) done = acc.add(t0 + s * 1000, tel(100)) ?? done
    expect(done).not.toBeNull()
    expect(done!.wh).toBeCloseTo((100 * 60) / 3600, 2)
    expect(done!.onS).toBeCloseTo(60, 0)
  })

  it('não inventa consumo quando a conexão cai (dt limitado a 5 s)', () => {
    const acc = new MinuteAccumulator()
    const t0 = Date.UTC(2026, 10, 7, 12, 0, 0)
    acc.add(t0, tel(100))
    acc.add(t0 + 40_000, tel(100))
    expect(acc.peek()!.wh).toBeCloseTo((100 * 6) / 3600, 3) // 1 s inicial + 5 s
  })

  it('soma economia pelo delta do contador do ESP32 e ignora zeramento', () => {
    const acc = new MinuteAccumulator()
    const t0 = Date.UTC(2026, 10, 7, 12, 0, 0)
    acc.add(t0, tel(0, false, false, 10))
    acc.add(t0 + 1000, tel(0, false, false, 10.5))
    acc.add(t0 + 2000, tel(0, false, false, 0)) // reset_energy
    acc.add(t0 + 3000, tel(0, false, false, 0.2))
    expect(acc.peek()!.savedWh).toBeCloseTo(0.7, 5)
  })

  it('ignora potência inválida', () => {
    const acc = new MinuteAccumulator()
    acc.add(0, tel(null))
    expect(acc.peek()!.wh).toBe(0)
  })
})

describe('agregação e projeção', () => {
  it('agrupa por dia local e preenche dias vazios', () => {
    const d1 = new Date(2026, 10, 5, 10).getTime()
    const d2 = new Date(2026, 10, 7, 9).getTime()
    const days = groupByDay([
      { key: d1, wh: 100, savedWh: 50, onS: 3600, presenceS: 3000, maxW: 120 },
      { key: d1 + 3600_000, wh: 100, savedWh: 0, onS: 3600, presenceS: 3600, maxW: 110 },
      { key: d2, wh: 30, savedWh: 10, onS: 600, presenceS: 600, maxW: 100 },
    ])
    expect(days).toHaveLength(2)
    expect(days[0].wh).toBe(200)
    const filled = lastNDays(days, 7, new Date(2026, 10, 7, 20).getTime())
    expect(filled).toHaveLength(7)
    expect(filled[filled.length - 1].day).toBe('2026-11-07')
    expect(filled.find((d) => d.day === '2026-11-06')!.wh).toBe(0)
  })

  it('reproduz o exemplo do relatório: 100 W x 4 h/dia a R$ 0,90 = R$ 10,80/mês, retorno em ~16 meses', () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ day: `d${i}`, ts: i, wh: 500, savedWh: 400, onS: 3600, presenceS: 3600 }))
    const p = project(days, DEFAULT_SETTINGS)
    expect(p.monthlySavedKwh).toBeCloseTo(12, 5)
    expect(p.monthlySavedBRL).toBeCloseTo(10.8, 5)
    expect(p.paybackMonths).toBeCloseTo(16.3, 1)
  })

  it('sem dados não há retorno calculado', () => {
    expect(project([], DEFAULT_SETTINGS).paybackMonths).toBeNull()
  })
})
