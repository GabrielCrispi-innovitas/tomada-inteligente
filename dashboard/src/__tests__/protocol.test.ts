import { describe, expect, it } from 'vitest'
import { LineSplitter, encodeCommand, parseLine } from '../lib/protocol'
import { normalizeWsUrl } from '../transport/websocket'

// linha exatamente como o firmware (main.cpp -> sendTelemetry) produz
const REAL =
  '{"type":"tel","seq":12,"up":42,"v":127.3,"i":0.812,"p":96.4,"pf":0.93,"hz":60,"kwh":0.8421,"presence":true,"moving":false,"static":true,"dist":142,"e_mov":5,"e_sta":61,"relay":true,"mode":"auto","reason":"presence","countdown":0,"timeout":0,"saved_wh":12.5,"saved_s":340,"ref_w":95.8,"meter_ok":true,"radar_ok":true,"rssi":-60}'

describe('parseLine', () => {
  it('lê a telemetria do firmware', () => {
    const m = parseLine(REAL)
    expect(m?.type).toBe('tel')
    if (m?.type !== 'tel') return
    expect(m.p).toBe(96.4)
    expect(m.relay).toBe(true)
    expect(m.presence).toBe(true)
    expect(m.mode).toBe('auto')
    expect(m.dist).toBe(142)
  })

  it('aceita null quando o PZEM não responde', () => {
    const m = parseLine('{"type":"tel","v":null,"i":null,"p":null,"relay":false,"meter_ok":false}')
    expect(m?.type === 'tel' && m.p).toBeNull()
    expect(m?.type === 'tel' && m.meter_ok).toBe(false)
  })

  it('ignora logs, lixo do boot e JSON quebrado', () => {
    expect(parseLine('ets Jun  8 2016 00:22:57')).toBeNull()
    expect(parseLine('rst:0x1 (POWERON_RESET),boot:0x13')).toBeNull()
    expect(parseLine('{"type":"tel","p":9')).toBeNull()
    expect(parseLine('{"type":"desconhecido"}')).toBeNull()
    expect(parseLine('[1,2,3]')).toBeNull()
    expect(parseLine('')).toBeNull()
  })

  it('normaliza valores fora do contrato', () => {
    const m = parseLine('{"type":"tel","mode":"turbo","reason":42,"p":"100"}')
    expect(m?.type === 'tel' && m.mode).toBe('auto')
    expect(m?.type === 'tel' && m.p).toBeNull()
  })

  it('lê eventos, info e ack', () => {
    expect(parseLine('{"type":"evt","kind":"relay_off","reason":"absence","up":9}')).toEqual({ type: 'evt', kind: 'relay_off', reason: 'absence', up: 9 })
    expect(parseLine('{"type":"info","fw":"1.0.0","sim":false,"timeout":0}')?.type).toBe('info')
    expect(parseLine('{"type":"ack","cmd":"timeout","ok":false,"msg":"use 0..3600 s"}')).toEqual({ type: 'ack', cmd: 'timeout', ok: false, msg: 'use 0..3600 s' })
  })
})

describe('LineSplitter', () => {
  it('remonta linhas quebradas em vários pedaços (como chega pela serial)', () => {
    const s = new LineSplitter()
    const half = Math.floor(REAL.length / 2)
    expect(s.push(REAL.slice(0, half))).toEqual([])
    expect(s.push(REAL.slice(half) + '\r\n{"type":"ack"')).toEqual([REAL])
    expect(s.push(',"cmd":"info","ok":true}\n')).toEqual(['{"type":"ack","cmd":"info","ok":true}'])
  })

  it('descarta lixo longo sem quebra de linha', () => {
    const s = new LineSplitter(100)
    s.push('x'.repeat(500))
    expect(s.push('\n{"a":1}\n')).toEqual(['{"a":1}'])
  })
})

describe('comandos', () => {
  it('codifica no formato que o firmware espera', () => {
    expect(encodeCommand({ cmd: 'mode', value: 'off' })).toBe('{"cmd":"mode","value":"off"}')
    expect(encodeCommand({ cmd: 'timeout', value: 0 })).toBe('{"cmd":"timeout","value":0}')
  })

  it('monta a URL do WebSocket', () => {
    expect(normalizeWsUrl('192.168.0.50')).toBe('ws://192.168.0.50:81/')
    expect(normalizeWsUrl('smartplug.local')).toBe('ws://smartplug.local:81/')
    expect(normalizeWsUrl('http://10.0.0.2/')).toBe('ws://10.0.0.2:81/')
    expect(normalizeWsUrl('localhost:8181')).toBe('ws://localhost:8181/')
    expect(normalizeWsUrl('')).toBe('ws://smartplug.local:81/')
  })
})
