import { describe, expect, it } from 'vitest'
import { PresenceController } from '../lib/presence'

// Mesmos cenários de firmware/test/test_core/test_main.cpp
const run = (pc: PresenceController, raw: boolean, from: number, to: number, step = 100) => {
  for (let t = from; t < to; t += step) pc.update(raw, t)
}

describe('PresenceController (porta do firmware)', () => {
  it('segue o sensor com atraso 0: presença liga, ausência desliga', () => {
    const pc = new PresenceController({ absenceTimeoutMs: 0 })
    run(pc, false, 0, 2000)
    expect(pc.relay).toBe(false)
    run(pc, true, 2000, 3000)
    expect(pc.relay).toBe(true)
    expect(pc.reason).toBe('presence')
    run(pc, true, 3000, 10000)
    run(pc, false, 10000, 10600)
    expect(pc.relay).toBe(false)
    expect(pc.reason).toBe('absence')
    expect(pc.offByAbsence).toBe(true)
  })

  it('respeita o atraso configurado e cancela se a pessoa voltar', () => {
    const pc = new PresenceController({ absenceTimeoutMs: 10000 })
    run(pc, true, 0, 5000)
    run(pc, false, 5000, 12000)
    expect(pc.relay).toBe(true)
    expect(pc.countdownMs(11900)).toBeGreaterThan(0)
    run(pc, true, 12000, 13000)
    run(pc, false, 13000, 20000)
    expect(pc.relay).toBe(true)
    run(pc, false, 20000, 24000)
    expect(pc.relay).toBe(false)
  })

  it('ignora pulsos curtos (debounce)', () => {
    const pc = new PresenceController()
    pc.update(true, 1000)
    pc.update(false, 1200)
    run(pc, false, 1300, 5000)
    expect(pc.relay).toBe(false)
  })

  it('modos manuais têm prioridade', () => {
    const pc = new PresenceController()
    pc.setMode('on', 0)
    run(pc, false, 0, 30000)
    expect(pc.relay).toBe(true)
    pc.setMode('off', 30000)
    run(pc, true, 30000, 40000)
    expect(pc.relay).toBe(false)
    expect(pc.offByAbsence).toBe(false)
  })
})
