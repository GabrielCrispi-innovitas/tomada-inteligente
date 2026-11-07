import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { send } from '../device'
import { fmt } from '../lib/energy'
import type { Mode, Telemetry } from '../lib/protocol'
import { useNow, useThrottled } from '../hooks'
import { useStore } from '../store'

function OutletFace({ on, unknown }: { on: boolean; unknown: boolean }) {
  const lit = on && !unknown
  const hole = lit ? 'var(--power)' : 'var(--panel)'
  return (
    <svg className="plug-face" viewBox="0 0 200 200" role="img" aria-label={unknown ? 'Estado desconhecido' : lit ? 'Tomada ligada' : 'Tomada desligada'}>
      <defs>
        <radialGradient id="faceGrad" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="var(--panel-2)" />
          <stop offset="100%" stopColor="var(--panel)" />
        </radialGradient>
      </defs>
      {/* espelho da tomada */}
      <rect x="6" y="6" width="188" height="188" rx="44" fill="url(#faceGrad)" stroke="var(--line)" strokeWidth="2" />
      {/* anel de energia */}
      <motion.circle
        cx="100"
        cy="100"
        r="66"
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        initial={false}
        animate={{ stroke: lit ? 'var(--power)' : 'var(--line)', pathLength: lit ? 1 : 0.999, opacity: unknown ? 0.4 : 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* brilho suave sem filtro de blur (barato de pintar) */}
      <circle cx="100" cy="100" r="66" fill="none" stroke="var(--power)" strokeWidth="18" opacity={lit ? 0.16 : 0} style={{ transition: 'opacity .6s' }} />
      {/* recesso padrão NBR 14136 */}
      <circle cx="100" cy="100" r="52" fill="var(--bg)" stroke="var(--line)" strokeWidth="1.5" />
      <motion.g initial={false} animate={{ opacity: unknown ? 0.35 : 1 }}>
        {[
          [78, 108],
          [122, 108],
          [100, 82],
        ].map(([cx, cy], i) => (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r="8.5"
            initial={false}
            animate={{ fill: hole }}
            transition={{ duration: 0.5, delay: lit ? i * 0.06 : 0 }}
            stroke="var(--line)"
            strokeWidth="1.5"
          />
        ))}
      </motion.g>
    </svg>
  )
}

function why(tel: Telemetry): string {
  if (tel.relay) {
    if (tel.mode === 'on') return 'Ligada manualmente (modo sempre ligada)'
    if (tel.presence) return 'Presença detectada: ligada automaticamente'
    if (tel.countdown > 0) return `Sem presença: desliga em ${tel.countdown} s`
    return 'Ligada'
  }
  if (tel.mode === 'off') return 'Desligada manualmente (modo sempre desligada)'
  if (tel.reason === 'absence') return 'Sem presença: desligada automaticamente'
  if (tel.presence) return 'Presença detectada, ligando…'
  return 'Aguardando presença para ligar'
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'on', label: 'Sempre ligada' },
  { id: 'off', label: 'Sempre desligada' },
]

export function PlugCard() {
  const tel = useStore((s) => s.tel)
  const samples = useStore((s) => s.samples)
  const live = useThrottled(useStore((s) => s.live), 5000)
  const history = useStore((s) => s.history)
  const conn = useStore((s) => s.conn)
  const now = useNow(1000)
  const [pending, setPending] = useState<Mode | null>(null)

  const unknown = !tel || conn !== 'connected'
  const on = !!tel?.relay

  // desde quando está no estado atual
  const since = useMemo(() => {
    if (!samples.length) return null
    const cur = samples[samples.length - 1].relay
    for (let i = samples.length - 2; i >= 0; i--) if (samples[i].relay !== cur) return samples[i + 1].t
    return samples[0].t
  }, [samples])

  const todayOnS = useMemo(() => {
    const d = new Date(now)
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    return history.filter((b) => b.key >= midnight).reduce((a, b) => a + b.onS, 0) + (live && live.key >= midnight ? live.onS : 0)
  }, [history, live, now])

  const setMode = async (m: Mode) => {
    setPending(m)
    try {
      await send({ cmd: 'mode', value: m })
    } catch (e) {
      console.warn(e)
    } finally {
      setTimeout(() => setPending(null), 600)
    }
  }
  const mode = pending ?? tel?.mode ?? 'auto'

  return (
    <section className={`panel plug ${on && !unknown ? 'is-on' : ''}`} aria-labelledby="plug-title">
      <div className="plug-face-wrap">
        <OutletFace on={on} unknown={unknown} />
        {on && !unknown && <span className="plug-pulse" aria-hidden />}
      </div>
      <div style={{ minWidth: 0, position: 'relative' }}>
        <div className="plug-label" id="plug-title">
          Estado da tomada
        </div>
        <motion.div
          key={unknown ? 'u' : on ? 'on' : 'off'}
          className={`plug-state ${unknown ? 'off' : on ? 'on' : 'off'}`}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          aria-live="polite"
        >
          {unknown ? 'Sem sinal' : on ? 'Ligada' : 'Desligada'}
        </motion.div>
        <div className="plug-why">
          {unknown ? 'Conecte o ESP32 pelo USB ou pelo Wi-Fi para ver o estado real.' : why(tel!)}
        </div>

        <div className="seg" role="group" aria-label="Modo de funcionamento">
          {MODES.map((m) => (
            <button key={m.id} aria-pressed={mode === m.id} onClick={() => void setMode(m.id)} disabled={unknown}>
              {mode === m.id && <motion.span layoutId="seg-thumb" className="seg-thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              {m.label}
            </button>
          ))}
        </div>

        <div className="plug-meta">
          <div>
            {on ? 'Ligada há' : 'Desligada há'}
            <strong className="num">{unknown || since === null ? '—' : fmt.dur((now - since) / 1000)}</strong>
          </div>
          <div>
            Potência agora
            <strong className="num">{unknown ? '—' : `${fmt.w(tel!.p)} W`}</strong>
          </div>
          <div>
            Tempo ligada hoje
            <strong className="num">{fmt.dur(todayOnS)}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}
