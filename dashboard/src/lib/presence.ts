// Porta fiel de firmware/lib/core/src/presence.cpp — usada pelo modo demo,
// para que a simulação se comporte exatamente como o ESP32.
import type { Mode, Reason } from './protocol'

export interface PresenceConfig {
  absenceTimeoutMs: number
  debounceMs: number
  minSwitchIntervalMs: number
}

export class PresenceController {
  cfg: PresenceConfig
  mode: Mode = 'auto'
  relay = false
  reason: Reason = 'boot'
  presence = false

  private rawLast = false
  private rawSince = 0
  private everSeen = false
  private lastPresence = 0
  private everSwitched = false
  private lastSwitch = 0

  constructor(cfg: Partial<PresenceConfig> = {}) {
    this.cfg = { absenceTimeoutMs: 0, debounceMs: 500, minSwitchIntervalMs: 3000, ...cfg }
  }

  private apply(on: boolean, why: Reason, now: number, force: boolean): boolean {
    if (on === this.relay) return false
    if (!force && this.everSwitched && now - this.lastSwitch < this.cfg.minSwitchIntervalMs) return false
    this.relay = on
    this.reason = why
    this.lastSwitch = now
    this.everSwitched = true
    return true
  }

  update(raw: boolean, now: number): boolean {
    if (raw !== this.rawLast) {
      this.rawLast = raw
      this.rawSince = now
    }
    if (this.rawLast !== this.presence && now - this.rawSince >= this.cfg.debounceMs) this.presence = this.rawLast
    if (this.presence) {
      this.lastPresence = now
      this.everSeen = true
    }
    if (this.mode === 'on') return this.apply(true, 'manual', now, true)
    if (this.mode === 'off') return this.apply(false, 'manual', now, true)
    if (this.presence) return this.apply(true, 'presence', now, false)
    if (this.relay && (!this.everSeen || now - this.lastPresence >= this.cfg.absenceTimeoutMs)) {
      return this.apply(false, 'absence', now, false)
    }
    return false
  }

  setMode(m: Mode, now: number): boolean {
    this.mode = m
    if (m === 'on') return this.apply(true, 'manual', now, true)
    if (m === 'off') return this.apply(false, 'manual', now, true)
    if (this.relay) {
      this.lastPresence = now
      this.everSeen = true
    } else if (this.presence) {
      return this.apply(true, 'presence', now, true)
    }
    return false
  }

  get offByAbsence(): boolean {
    return !this.relay && this.mode === 'auto' && this.reason === 'absence'
  }

  countdownMs(now: number): number {
    if (this.mode !== 'auto' || !this.relay || this.presence || !this.everSeen) return 0
    const elapsed = now - this.lastPresence
    return elapsed >= this.cfg.absenceTimeoutMs ? 0 : this.cfg.absenceTimeoutMs - elapsed
  }
}
