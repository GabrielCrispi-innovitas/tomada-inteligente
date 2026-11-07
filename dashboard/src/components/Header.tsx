import { useState } from 'react'
import { connectUsb, connectWifi, disconnect, startDemo } from '../device'
import { useNow, type ThemePref } from '../hooks'
import { useStore } from '../store'
import { isWebSerialSupported } from '../transport/serial'

const KIND_LABEL = { usb: 'USB', wifi: 'Wi-Fi', demo: 'Demonstração' } as const

export function Header({ themePref, onTheme }: { themePref: ThemePref; onTheme: (p: ThemePref) => void }) {
  const kind = useStore((s) => s.kind)
  const conn = useStore((s) => s.conn)
  const connDetail = useStore((s) => s.connDetail)
  const lastRx = useStore((s) => s.lastRx)
  const fw = useStore((s) => s.info?.fw)
  const [host, setHost] = useState(() => {
    try {
      return localStorage.getItem('tomada-upx:host') || 'smartplug.local'
    } catch {
      return 'smartplug.local'
    }
  })
  const now = useNow(1000)
  const stale = conn === 'connected' && lastRx > 0 && now - lastRx > 4000
  const serialOk = isWebSerialSupported()

  let dot = ''
  let text = 'Desconectado'
  if (conn === 'connected') {
    dot = stale ? 'wait' : 'ok'
    text = stale ? `${KIND_LABEL[kind ?? 'usb']}: sem dados há ${Math.round((now - lastRx) / 1000)} s` : `Conectado via ${KIND_LABEL[kind ?? 'usb']}`
    if (fw && kind !== 'demo') text += `, firmware ${fw}`
  } else if (conn === 'connecting' || conn === 'reconnecting') {
    dot = 'wait'
    text = conn === 'connecting' ? 'Conectando…' : connDetail || 'Reconectando…'
  } else if (conn === 'error') {
    dot = 'bad'
    text = 'Falha na conexão'
  }

  const onWifi = () => {
    try {
      localStorage.setItem('tomada-upx:host', host)
    } catch {
      /* ignore */
    }
    void connectWifi(host).catch(() => undefined)
  }

  const nextTheme: Record<ThemePref, ThemePref> = { system: 'dark', dark: 'light', light: 'system' }
  const themeLabel = { system: 'Tema: sistema', dark: 'Tema: escuro', light: 'Tema: claro' }[themePref]

  return (
    <header className="top">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" fill="none" stroke="var(--power)" strokeWidth="2" />
            <circle cx="8.6" cy="13.2" r="1.7" fill="var(--power)" />
            <circle cx="15.4" cy="13.2" r="1.7" fill="var(--power)" />
            <circle cx="12" cy="8.2" r="1.7" fill="var(--power)" />
          </svg>
        </div>
        <div>
          <h1>Tomada Inteligente</h1>
          <p>Liga com presença, desliga sem ninguém e mede o consumo.</p>
        </div>
      </div>

      <div className="conn">
        <span className="status-pill" role="status" aria-live="polite">
          <span className={`dot ${dot}`} />
          {text}
        </span>

        {conn === 'connected' || conn === 'reconnecting' ? (
          <button className="btn" onClick={() => void disconnect()}>
            Desconectar
          </button>
        ) : null}

        {kind !== 'usb' && (
          <button
            className="btn primary"
            onClick={() => void connectUsb().catch(() => undefined)}
            disabled={!serialOk || conn === 'connecting'}
            title={serialOk ? 'Escolha a porta COM do ESP32' : 'USB funciona no Chrome ou no Edge'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 3v13M8 7l4-4 4 4M7 12v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3M12 17v4" />
            </svg>
            Conectar USB
          </button>
        )}

        {kind !== 'wifi' && (
          <div className="field">
            <label className="visually-hidden" htmlFor="host">
              Endereço do ESP32 na rede
            </label>
            <input id="host" value={host} onChange={(e) => setHost(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onWifi()} placeholder="IP ou smartplug.local" spellCheck={false} />
            <button className="btn" onClick={onWifi} disabled={conn === 'connecting'}>
              Wi-Fi
            </button>
          </div>
        )}

        {kind !== 'demo' && (
          <button className="btn ghost" onClick={() => void startDemo()}>
            Demonstração
          </button>
        )}

        <button className="btn ghost small" onClick={() => onTheme(nextTheme[themePref])} title="Alternar tema">
          {themeLabel}
        </button>
      </div>
    </header>
  )
}
