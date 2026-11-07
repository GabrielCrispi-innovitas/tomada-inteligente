import { useEffect } from 'react'
import { DailyChart } from './components/DailyChart'
import { EventLog } from './components/EventLog'
import { Header } from './components/Header'
import { LiveChart } from './components/LiveChart'
import { PlugCard } from './components/PlugCard'
import { PresenceCard } from './components/PresenceCard'
import { Readings } from './components/Readings'
import { SavingsCard } from './components/SavingsCard'
import { SettingsCard } from './components/SettingsCard'
import { connectUsb, startDemo } from './device'
import { useTheme } from './hooks'
import { useStore } from './store'
import { isWebSerialSupported } from './transport/serial'

export default function App() {
  const [theme, themePref, setThemePref] = useTheme()
  const kind = useStore((s) => s.kind)
  const conn = useStore((s) => s.conn)
  const connDetail = useStore((s) => s.connDetail)

  useEffect(() => {
    // Abre em modo demonstração, a não ser que a URL tenha ?demo=0
    const params = new URLSearchParams(location.search)
    if (params.get('demo') !== '0') void startDemo()
  }, [])

  const httpsWifiIssue = conn === 'error' && location.protocol === 'https:' && connDetail.startsWith('Não foi possível conectar em ws://')

  return (
    <div className="app">
      <Header themePref={themePref} onTheme={setThemePref} />

      {kind === 'demo' && (
        <div className="banner" role="note">
          <span>
            <strong>Modo demonstração.</strong> Os dados são simulados por um ESP32 virtual que roda a mesma lógica do firmware.
          </span>
          {isWebSerialSupported() && (
            <button className="btn small spacer" onClick={() => void connectUsb().catch(() => undefined)}>
              Conectar o ESP32 pelo USB
            </button>
          )}
        </div>
      )}
      {conn === 'error' && (
        <div className="banner error" role="alert">
          <span>
            <strong>{connDetail || 'Não foi possível conectar.'}</strong>{' '}
            {httpsWifiIssue
              ? 'Esta página está em HTTPS e o navegador bloqueia Wi-Fi sem criptografia. Use o USB ou abra o painel local (npm run dev).'
              : 'Confira se o ESP32 está ligado e na mesma rede, ou use o USB.'}
          </span>
        </div>
      )}

      <main className="grid">
        <div className="span-7">
          <PlugCard />
        </div>
        <div className="span-5">
          <PresenceCard />
        </div>
        <div className="span-8">
          <LiveChart theme={theme} />
        </div>
        <div className="span-4">
          <SavingsCard />
        </div>
        <div className="span-7">
          <DailyChart theme={theme} />
        </div>
        <div className="span-5">
          <Readings />
        </div>
        <div className="span-6">
          <EventLog />
        </div>
        <div className="span-6">
          <SettingsCard />
        </div>
      </main>

      <footer className="foot">Projeto UPx, Facens 2026. Monitoramento inteligente de energia com sensor de presença.</footer>
    </div>
  )
}
