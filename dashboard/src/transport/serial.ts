// USB via Web Serial API (Chrome / Edge). Não precisa de servidor nem driver extra
// além do driver CH340 do Windows, que normalmente já vem instalado.
import { LineSplitter, encodeCommand, parseLine, type Command } from '../lib/protocol'
import type { Transport, TransportHandlers } from './types'

export const BAUD_RATE = 115200

export const isWebSerialSupported = (): boolean => typeof navigator !== 'undefined' && 'serial' in navigator

export class SerialTransport implements Transport {
  readonly kind = 'usb' as const
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private closing = false
  private readonly splitter = new LineSplitter()
  private readonly decoder = new TextDecoder()
  private readonly encoder = new TextEncoder()
  private readonly h: TransportHandlers

  constructor(h: TransportHandlers) {
    this.h = h
  }

  async connect() {
    if (!isWebSerialSupported()) throw new Error('Este navegador não suporta USB. Use o Chrome ou o Edge.')
    this.h.onStatus('connecting')
    const port = await navigator.serial.requestPort()
    await port.open({ baudRate: BAUD_RATE, bufferSize: 16384 })
    // Solta EN/IO0 do circuito de auto-reset -> o ESP32 roda o programa normalmente.
    try {
      await port.setSignals({ dataTerminalReady: false, requestToSend: false })
    } catch {
      /* alguns adaptadores não suportam; sem problema */
    }
    this.port = port
    this.closing = false
    navigator.serial.addEventListener('disconnect', this.onUnplug)
    this.h.onStatus('connected', 'USB')
    void this.readLoop()
    // pede as informações do firmware (caso o boot já tenha passado)
    setTimeout(() => void this.send({ cmd: 'info' }).catch(() => undefined), 800)
  }

  private onUnplug = (e: Event) => {
    if ((e as Event & { target: SerialPort }).target === this.port) {
      this.h.onStatus('error', 'Cabo USB desconectado')
      void this.disconnect(true)
    }
  }

  private async readLoop() {
    const port = this.port
    while (port?.readable && !this.closing) {
      this.reader = port.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (!value) continue
          for (const line of this.splitter.push(this.decoder.decode(value, { stream: true }))) {
            this.h.onRawLine?.(line)
            const msg = parseLine(line)
            if (msg) this.h.onMessage(msg)
          }
        }
      } catch (err) {
        // erro de framing/paridade é recuperável: o loop abre um novo reader
        if (this.closing) break
        console.warn('[serial]', err)
      } finally {
        this.reader?.releaseLock()
        this.reader = null
      }
    }
  }

  async send(c: Command) {
    const w = this.port?.writable?.getWriter()
    if (!w) throw new Error('Porta USB não está aberta')
    try {
      await w.write(this.encoder.encode(encodeCommand(c) + '\n'))
    } finally {
      w.releaseLock()
    }
  }

  async disconnect(silent = false) {
    this.closing = true
    navigator.serial?.removeEventListener('disconnect', this.onUnplug)
    try {
      await this.reader?.cancel()
    } catch {
      /* ignore */
    }
    try {
      await this.port?.close()
    } catch {
      /* ignore */
    }
    this.port = null
    this.splitter.reset()
    if (!silent) this.h.onStatus('idle')
  }
}
