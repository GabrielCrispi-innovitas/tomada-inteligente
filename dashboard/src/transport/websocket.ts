// Wi-Fi via WebSocket (porta 81 do ESP32). Reconecta sozinho se a rede cair.
import { encodeCommand, parseLine, type Command } from '../lib/protocol'
import type { Transport, TransportHandlers } from './types'

export function normalizeWsUrl(input: string): string {
  let s = input.trim()
  if (!s) s = 'smartplug.local'
  if (/^wss?:\/\//i.test(s)) return s
  s = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!/:\d+$/.test(s)) s += ':81'
  return `ws://${s}/`
}

export class WsTransport implements Transport {
  readonly kind = 'wifi' as const
  private ws: WebSocket | null = null
  private manualClose = false
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly url: string
  private readonly h: TransportHandlers

  constructor(host: string, h: TransportHandlers) {
    this.url = normalizeWsUrl(host)
    this.h = h
  }

  connect(): Promise<void> {
    this.manualClose = false
    this.h.onStatus(this.retry ? 'reconnecting' : 'connecting', this.url)
    return new Promise((resolve, reject) => {
      let opened = false
      let ws: WebSocket
      try {
        ws = new WebSocket(this.url)
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
        return
      }
      this.ws = ws
      ws.onopen = () => {
        opened = true
        this.retry = 0
        this.h.onStatus('connected', this.url)
        ws.send(encodeCommand({ cmd: 'info' }))
        resolve()
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return
        for (const line of ev.data.split('\n')) {
          this.h.onRawLine?.(line)
          const msg = parseLine(line)
          if (msg) this.h.onMessage(msg)
        }
      }
      ws.onclose = () => {
        this.ws = null
        if (this.manualClose) return
        if (!opened && this.retry === 0) {
          this.h.onStatus('error', `Não foi possível conectar em ${this.url}`)
          reject(new Error(`Não foi possível conectar em ${this.url}`))
          return
        }
        this.scheduleReconnect()
      }
    })
  }

  private scheduleReconnect() {
    this.retry++
    const delay = Math.min(10000, 500 * 2 ** Math.min(this.retry, 5))
    this.h.onStatus('reconnecting', `Tentando de novo em ${Math.round(delay / 1000)} s`)
    this.timer = setTimeout(() => void this.connect().catch(() => undefined), delay)
  }

  async send(c: Command) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Wi-Fi desconectado')
    this.ws.send(encodeCommand(c))
  }

  async disconnect() {
    this.manualClose = true
    if (this.timer) clearTimeout(this.timer)
    this.ws?.close()
    this.ws = null
    this.retry = 0
    this.h.onStatus('idle')
  }
}
