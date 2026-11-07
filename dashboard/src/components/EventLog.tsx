import { AnimatePresence, motion } from 'framer-motion'
import { useStore, type LogEvent } from '../store'

const REASON: Record<string, string> = {
  presence: 'presença detectada',
  absence: 'ninguém no ambiente',
  manual: 'comando do painel',
  boot: 'inicialização',
}

function describe(e: LogEvent): { text: string; color: string } {
  switch (e.kind) {
    case 'relay_on':
      return { text: `Tomada ligada: ${REASON[e.reason ?? 'boot']}`, color: 'var(--power)' }
    case 'relay_off':
      return { text: `Tomada desligada: ${REASON[e.reason ?? 'boot']}`, color: 'var(--off)' }
    case 'connect':
      return { text: `Conectado (${e.text === 'usb' ? 'USB' : e.text === 'wifi' ? 'Wi-Fi' : 'demonstração'})`, color: 'var(--ok)' }
    case 'disconnect':
      return { text: 'Desconectado', color: 'var(--muted)' }
    default:
      return { text: `Comando recusado: ${e.text ?? ''}`, color: 'var(--bad)' }
  }
}

export function EventLog() {
  const events = useStore((s) => s.events)
  return (
    <section className="panel" aria-labelledby="events-title">
      <div className="panel-head">
        <h2 id="events-title">Acionamentos</h2>
        <span className="sub">{events.filter((e) => e.kind === 'relay_on' || e.kind === 'relay_off').length} nesta sessão</span>
      </div>
      {events.length === 0 ? (
        <div className="empty">Cada vez que a tomada ligar ou desligar, o motivo aparece aqui.</div>
      ) : (
        <ul className="events">
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const d = describe(e)
              return (
                <motion.li key={`${e.t}-${e.kind}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.3 }}>
                  <time className="num">{new Date(e.t).toLocaleTimeString('pt-BR')}</time>
                  <span className="ev-dot" style={{ background: d.color }} />
                  <span>{d.text}</span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}
