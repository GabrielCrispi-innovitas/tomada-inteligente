// Liga os transportes (USB / Wi-Fi / demo) ao estado da aplicação e ao histórico.
import { MinuteAccumulator } from './lib/energy'
import { loadBuckets, saveBucket, seedDemoHistory } from './lib/history'
import type { Command, DeviceMessage } from './lib/protocol'
import { useStore } from './store'
import { DemoTransport, type DemoPresence } from './transport/demo'
import { SerialTransport } from './transport/serial'
import type { ConnState, Transport, TransportHandlers, TransportKind } from './transport/types'
import { WsTransport } from './transport/websocket'

const HISTORY_DAYS = 14

let transport: Transport | null = null
const acc = new MinuteAccumulator()
let isDemo = false

const S = () => useStore.getState()

function onMessage(m: DeviceMessage) {
  const now = Date.now()
  switch (m.type) {
    case 'tel': {
      S().pushTel(now, m)
      const done = acc.add(now, m)
      if (done) {
        S().appendHistory(done)
        void saveBucket(isDemo, done).catch((e) => console.warn('[histórico]', e))
      }
      const live = acc.peek()
      S().setLive(live ? { ...live } : null)
      break
    }
    case 'info':
      S().setInfo(m)
      break
    case 'evt':
      S().pushEvent({ t: now, kind: m.kind, reason: m.reason })
      break
    case 'ack':
      if (!m.ok) S().pushEvent({ t: now, kind: 'ack_error', text: `${m.cmd}: ${m.msg ?? 'recusado'}` })
      break
  }
}

function handlers(kind: TransportKind): TransportHandlers {
  return {
    onMessage,
    onStatus: (s: ConnState, detail?: string) => {
      // ignora status atrasado de um transporte que já foi trocado
      if (transport && transport.kind !== kind) return
      S().setConn(s === 'idle' ? null : kind, s, detail)
    },
    onRawLine: (line) => S().pushRaw(line),
  }
}

async function loadHistory() {
  const since = Date.now() - HISTORY_DAYS * 86_400_000
  try {
    S().setHistory(await loadBuckets(isDemo, since))
  } catch (e) {
    console.warn('[histórico]', e)
    S().setHistory([])
  }
}

async function flushAccumulator() {
  const b = acc.flush()
  acc.reset()
  if (b) {
    S().appendHistory(b)
    await saveBucket(isDemo, b).catch(() => undefined)
  }
}

// Trocas de conexão rodam uma de cada vez (evita dois transportes ativos ao mesmo tempo).
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn)
  chain = p.catch(() => undefined)
  return p
}

const switchTo = (kind: TransportKind, make: () => Transport) => serial(() => doSwitch(kind, make))

async function doSwitch(kind: TransportKind, make: () => Transport) {
  await doDisconnect()
  isDemo = kind === 'demo'
  S().resetSession()
  if (isDemo) await seedDemoHistory().catch(() => undefined)
  await loadHistory()
  const t = make()
  transport = t
  try {
    await t.connect()
    S().pushEvent({ t: Date.now(), kind: 'connect', text: kind })
  } catch (e) {
    transport = null
    const msg = e instanceof Error ? e.message : String(e)
    // usuário fechou o seletor de porta: não é erro
    if (/No port selected|cancel/i.test(msg)) S().setConn(null, 'idle')
    else S().setConn(null, 'error', msg)
    throw e
  }
}

export const connectUsb = () => switchTo('usb', () => new SerialTransport(handlers('usb')))
export const connectWifi = (host: string) => switchTo('wifi', () => new WsTransport(host, handlers('wifi')))
export const startDemo = () => switchTo('demo', () => new DemoTransport(handlers('demo')))

export const disconnect = () => serial(doDisconnect)

async function doDisconnect() {
  const t = transport
  if (!t) return
  transport = null
  await flushAccumulator()
  await t.disconnect().catch(() => undefined)
  S().setConn(null, 'idle')
  S().pushEvent({ t: Date.now(), kind: 'disconnect' })
}

export async function send(c: Command) {
  if (!transport) throw new Error('Nenhum dispositivo conectado')
  await transport.send(c)
}

export function setDemoPresence(p: DemoPresence) {
  if (transport instanceof DemoTransport) transport.setPresence(p)
  S().setDemoPresence(p)
}

export const reloadHistory = loadHistory
export const currentIsDemo = () => isDemo

// salva o minuto em andamento ao fechar a aba
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const b = acc.peek()
    if (b) void saveBucket(isDemo, b)
  })
}
