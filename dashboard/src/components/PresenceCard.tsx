import { motion } from 'framer-motion'
import { setDemoPresence } from '../device'
import { useAnimatedNumber } from '../hooks'
import { fmt } from '../lib/energy'
import { useStore } from '../store'
import type { DemoPresence } from '../transport/demo'

const MAX_CM = 500
const CX = 170
const CY = 178
const R = 158

function arcPath(r: number) {
  return `M ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY}`
}

const DEMO_OPTS: { id: DemoPresence; label: string }[] = [
  { id: 'scenario', label: 'Roteiro automático' },
  { id: 'present', label: 'Pessoa na sala' },
  { id: 'absent', label: 'Sala vazia' },
]

export function PresenceCard() {
  const tel = useStore((s) => s.tel)
  const kind = useStore((s) => s.kind)
  const conn = useStore((s) => s.conn)
  const demoPresence = useStore((s) => s.demoPresence)
  const active = conn === 'connected' && !!tel
  const present = !!tel?.presence
  const distAnim = useAnimatedNumber(tel && tel.dist > 0 ? tel.dist : null, 900)
  const r = distAnim ? Math.max(14, Math.min(R, (distAnim / MAX_CM) * R)) : 0

  const kindLabel = !tel ? '—' : tel.moving ? 'Em movimento' : tel.static ? 'Parada' : 'Nenhuma'

  return (
    <section className="panel" aria-labelledby="presence-title">
      <div className="panel-head">
        <h2 id="presence-title">Sensor de presença</h2>
        <span className={`presence-badge ${present ? 'yes' : ''}`} aria-live="polite">
          <span className="dot" style={{ background: present ? 'var(--presence)' : undefined }} />
          {!active ? 'Sem sinal' : present ? 'Pessoa detectada' : 'Ninguém no ambiente'}
        </span>
      </div>

      <div className="radar-wrap">
        <svg className="radar-svg" viewBox="0 0 340 196" role="img" aria-label={present && tel ? `Pessoa a ${(tel.dist / 100).toFixed(1)} metros` : 'Nenhuma pessoa detectada'}>
          {[1, 2, 3, 4, 5].map((m) => (
            <g key={m}>
              <path d={arcPath((m * 100 * R) / MAX_CM)} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray={m === 5 ? undefined : '2 5'} />
              <text x={CX + (m * 100 * R) / MAX_CM - 2} y={CY + 14} fontSize="10" fill="var(--muted)" textAnchor="middle">
                {m} m
              </text>
            </g>
          ))}
          <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="var(--line)" />


          {/* alvo: o LD2410C informa só a distância, então mostramos um arco nessa distância */}
          {active && present && r > 0 && (
            <g>
              <path d={arcPath(r)} fill="none" stroke="var(--presence)" strokeOpacity="0.25" strokeWidth="18" strokeLinecap="round" />
              <path d={arcPath(r)} fill="none" stroke="var(--presence)" strokeWidth="4" strokeLinecap="round" className={tel?.moving ? 'arc-moving' : undefined} />
            </g>
          )}

          <circle cx={CX} cy={CY} r="7" fill={active ? 'var(--presence)' : 'var(--off)'} />
          <circle cx={CX} cy={CY} r="12" fill="none" stroke={active ? 'var(--presence)' : 'var(--off)'} strokeOpacity="0.4" />
        </svg>
        {/* varredura em CSS (transform na GPU) — posição casada com o viewBox 340x196, centro (170,178), raio 158 */}
        {active && (
          <div className="radar-sweep-clip" aria-hidden>
            <div className="radar-sweep" />
          </div>
        )}
      </div>

      <div className="radar-legend">
        <div>
          Distância
          <strong className="num">{present && tel ? `${fmt.n(tel.dist / 100, 2)} m` : '—'}</strong>
        </div>
        <div>
          Pessoa
          <strong>{active ? kindLabel : '—'}</strong>
        </div>
        <div>
          Sinal
          <strong className="num">{tel ? `${Math.max(tel.e_mov, tel.e_sta)}%` : '—'}</strong>
        </div>
      </div>

      {tel && !tel.radar_ok && kind !== 'demo' && (
        <p className="sub" style={{ marginTop: 10 }}>
          Lendo só o pino OUT do radar: a presença funciona, mas distância e sinal não aparecem.
        </p>
      )}

      {kind === 'demo' && (
        <div style={{ marginTop: 14 }}>
          <div className="sub" style={{ marginBottom: 6 }}>
            Simular o ambiente
          </div>
          <div className="seg" role="group" aria-label="Simular presença">
            {DEMO_OPTS.map((o) => (
              <button key={o.id} aria-pressed={demoPresence === o.id} onClick={() => setDemoPresence(o.id)}>
                {demoPresence === o.id && <motion.span layoutId="demo-thumb" className="seg-thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
