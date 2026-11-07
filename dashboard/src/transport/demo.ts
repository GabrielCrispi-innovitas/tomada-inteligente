// Modo demonstração: um "ESP32 virtual" que roda a MESMA máquina de estados do
// firmware e responde aos mesmos comandos. Gera exatamente o protocolo real.
import { PresenceController } from '../lib/presence'
import type { Command, DeviceMessage, Telemetry } from '../lib/protocol'
import type { Transport, TransportHandlers } from './types'

export type DemoPresence = 'scenario' | 'present' | 'absent'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class DemoTransport implements Transport {
  readonly kind = 'demo' as const
  private readonly h: TransportHandlers
  private ctl = new PresenceController({ absenceTimeoutMs: 0 })
  private tick: ReturnType<typeof setInterval> | null = null
  private loop: ReturnType<typeof setInterval> | null = null
  private start = 0
  private seq = 0
  private kwh = 0.8421
  private savedWh = 0
  private savedMs = 0
  private refW = 0
  private lastTel = 0

  // cenário de presença
  presenceMode: DemoPresence = 'scenario'
  private scenePresent = true
  private sceneUntil = 0
  private dist = 140
  private distTarget = 140

  constructor(h: TransportHandlers) {
    this.h = h
  }

  async connect() {
    this.start = performance.now()
    this.lastTel = this.start
    this.sceneUntil = this.start + rand(20000, 40000)
    this.h.onStatus('connected', 'Demonstração')
    this.emit(this.info())
    // loop rápido (como o loop() do ESP32) + telemetria a 1 Hz
    this.loop = setInterval(() => this.step(), 100)
    this.tick = setInterval(() => this.telemetry(), 1000)
  }

  async disconnect() {
    if (this.loop) clearInterval(this.loop)
    if (this.tick) clearInterval(this.tick)
    this.loop = this.tick = null
    this.h.onStatus('idle')
  }

  setPresence(mode: DemoPresence) {
    this.presenceMode = mode
    if (mode === 'scenario') this.sceneUntil = performance.now() + rand(15000, 30000)
  }

  private now() {
    return performance.now() - this.start
  }

  private rawPresence(): boolean {
    if (this.presenceMode === 'present') return true
    if (this.presenceMode === 'absent') return false
    const t = performance.now()
    if (t >= this.sceneUntil) {
      this.scenePresent = !this.scenePresent
      this.sceneUntil = t + (this.scenePresent ? rand(25000, 50000) : rand(15000, 35000))
    }
    return this.scenePresent
  }

  private step() {
    const raw = this.rawPresence()
    if (this.ctl.update(raw, this.now())) this.relayEvent()
    if (Math.random() < 0.02) this.distTarget = rand(60, 420)
    this.dist += (this.distTarget - this.dist) * 0.04
  }

  private relayEvent() {
    this.emit({ type: 'evt', kind: this.ctl.relay ? 'relay_on' : 'relay_off', reason: this.ctl.reason, up: Math.floor(this.now() / 1000) })
  }

  private telemetry() {
    const t = performance.now()
    const dt = t - this.lastTel
    this.lastTel = t
    const now = this.now()
    const on = this.ctl.relay

    const v = 127 + Math.sin(t / 37000) * 1.8 + rand(-0.3, 0.3)
    let p = 0
    let pf = 0
    if (on) {
      // monitor + computador: ~96 W com variações de uso e picos curtos
      p = 96 + Math.sin(t / 9000) * 6 + (Math.random() < 0.05 ? rand(10, 35) : 0) + rand(-1.5, 1.5)
      pf = 0.92 + rand(-0.02, 0.02)
      this.refW = this.refW <= 0 ? p : this.refW + 0.05 * (p - this.refW)
    } else if (this.ctl.offByAbsence) {
      this.savedMs += dt
      this.savedWh += (this.refW * dt) / 3600000
    }
    this.kwh += (p * dt) / 3600000 / 1000
    const present = this.ctl.presence
    const moving = present && Math.floor(t / 4000) % 3 === 0

    const tel: Telemetry = {
      type: 'tel',
      seq: this.seq++,
      up: Math.floor(now / 1000),
      v: round(v, 1),
      i: round(pf > 0 ? p / (v * pf) : 0, 3),
      p: round(p, 1),
      pf: round(pf, 2),
      hz: round(60 + rand(-0.02, 0.02), 1),
      kwh: round(this.kwh, 4),
      presence: present,
      moving,
      static: present && !moving,
      dist: present ? Math.round(this.dist) : 0,
      e_mov: moving ? Math.round(rand(40, 95)) : Math.round(rand(0, 12)),
      e_sta: present && !moving ? Math.round(rand(30, 80)) : Math.round(rand(0, 15)),
      relay: on,
      mode: this.ctl.mode,
      reason: this.ctl.reason,
      countdown: Math.ceil(this.ctl.countdownMs(now) / 1000),
      timeout: this.ctl.cfg.absenceTimeoutMs / 1000,
      saved_wh: round(this.savedWh, 2),
      saved_s: Math.floor(this.savedMs / 1000),
      ref_w: round(this.refW, 1),
      meter_ok: true,
      radar_ok: true,
      rssi: Math.round(rand(-64, -55)),
    }
    this.emit(tel)
  }

  private info(): DeviceMessage {
    return {
      type: 'info',
      fw: '1.0.0-demo',
      sim: true,
      timeout: this.ctl.cfg.absenceTimeoutMs / 1000,
      mode: this.ctl.mode,
      wifi: false,
      ip: '',
      host: 'demo',
      radar_uart: true,
      meter_ok: true,
    }
  }

  private emit(m: DeviceMessage) {
    // passa pelo mesmo caminho de texto do dispositivo real
    const line = JSON.stringify(m)
    this.h.onRawLine?.(line)
    this.h.onMessage(JSON.parse(line) as DeviceMessage)
  }

  async send(c: Command) {
    const now = this.now()
    switch (c.cmd) {
      case 'mode':
        if (this.ctl.setMode(c.value, now)) this.relayEvent()
        break
      case 'timeout':
        if (c.value < 0 || c.value > 3600) return this.emit({ type: 'ack', cmd: c.cmd, ok: false, msg: 'use 0..3600 s' })
        this.ctl.cfg.absenceTimeoutMs = c.value * 1000
        break
      case 'reset_energy':
        this.kwh = 0
        this.savedWh = 0
        this.savedMs = 0
        break
      case 'info':
        return this.emit(this.info())
    }
    this.emit({ type: 'ack', cmd: c.cmd, ok: true })
  }
}

function round(v: number, d: number) {
  const m = 10 ** d
  return Math.round(v * m) / m
}
