import { useEffect, useState } from 'react'
import { currentIsDemo, reloadHistory, send } from '../device'
import { DEFAULT_SETTINGS, dayKey, groupByDay } from '../lib/energy'
import { clearHistory } from '../lib/history'
import { useStore } from '../store'

const DELAYS = [0, 10, 30, 60, 300]

function download(name: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const n = (v: number | null, d = 3) => (v === null ? '' : v.toFixed(d).replace('.', ','))

export function SettingsCard() {
  const tel = useStore((s) => s.tel)
  const conn = useStore((s) => s.conn)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const rawLines = useStore((s) => s.rawLines)
  const [delay, setDelay] = useState<string>('')
  const [showConsole, setShowConsole] = useState(false)
  const [msg, setMsg] = useState('')
  const connected = conn === 'connected'

  useEffect(() => {
    if (tel && delay === '') setDelay(String(tel.timeout))
  }, [tel, delay])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  const applyDelay = async (s: number) => {
    setDelay(String(s))
    try {
      await send({ cmd: 'timeout', value: s })
      flash(s === 0 ? 'Pronto: a tomada agora segue o sensor na hora.' : `Pronto: desliga ${s} s depois que a pessoa sair.`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Falha ao enviar')
    }
  }

  const exportSession = () => {
    const rows = useStore.getState().samples
    const head = 'data_hora;potencia_w;tensao_v;corrente_a;presenca;tomada_ligada'
    const body = rows.map((s) => [new Date(s.t).toLocaleString('pt-BR'), n(s.p, 1), n(s.v, 1), n(s.i, 3), s.presence ? 1 : 0, s.relay ? 1 : 0].join(';'))
    download(`tomada-sessao-${dayKey(Date.now())}.csv`, [head, ...body].join('\n'))
  }

  const exportDaily = () => {
    const days = groupByDay(useStore.getState().history)
    const head = 'dia;consumo_kwh;economia_kwh;horas_ligada;horas_com_presenca;custo_r$;economia_r$'
    const body = days.map((d) => [d.day, n(d.wh / 1000), n(d.savedWh / 1000), n(d.onS / 3600, 2), n(d.presenceS / 3600, 2), n((d.wh / 1000) * settings.tariff, 2), n((d.savedWh / 1000) * settings.tariff, 2)].join(';'))
    download(`tomada-diario-${dayKey(Date.now())}.csv`, [head, ...body].join('\n'))
  }

  const resetEnergy = async () => {
    try {
      await send({ cmd: 'reset_energy' })
      flash('Contadores do ESP32 zerados.')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Falha ao enviar')
    }
  }

  const wipeHistory = async () => {
    await clearHistory(currentIsDemo())
    await reloadHistory()
    flash('Histórico deste navegador apagado.')
  }

  const num = (k: keyof typeof settings, step: string) => (
    <input
      type="number"
      step={step}
      min="0"
      value={settings[k]}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (Number.isFinite(v) && v >= 0) setSettings({ [k]: v })
      }}
    />
  )

  return (
    <section className="panel" aria-labelledby="settings-title">
      <div className="panel-head">
        <h2 id="settings-title">Ajustes</h2>
        <span className="sub" aria-live="polite">
          {msg}
        </span>
      </div>
      <div className="settings">
        <div className="setting">
          <label>Esperar antes de desligar quando a pessoa sai</label>
          <div className="chips">
            {DELAYS.map((s) => (
              <button key={s} className="btn small" aria-pressed={delay === String(s)} style={delay === String(s) ? { borderColor: 'var(--power)', color: 'var(--power)' } : undefined} disabled={!connected} onClick={() => void applyDelay(s)}>
                {s === 0 ? 'Na hora' : s < 60 ? `${s} s` : `${s / 60} min`}
              </button>
            ))}
          </div>
          <div className="hint">“Na hora” segue o sensor: presença liga e ausência desliga. Fica salvo no ESP32.</div>
        </div>

        <div className="setting">
          <label htmlFor="tariff">Tarifa de energia (R$/kWh)</label>
          <div className="row" id="tariff">
            {num('tariff', '0.01')}
          </div>
        </div>
        <div className="setting">
          <label>Fator de emissão (kg CO₂/kWh) e custo do protótipo (R$)</label>
          <div className="row">
            {num('co2Factor', '0.0001')}
            {num('prototypeCost', '1')}
            <button className="btn small ghost" onClick={() => setSettings(DEFAULT_SETTINGS)}>
              Restaurar padrões
            </button>
          </div>
        </div>

        <div className="setting">
          <label>Dados para o relatório</label>
          <div className="row">
            <button className="btn small" onClick={exportSession}>
              Baixar sessão (CSV)
            </button>
            <button className="btn small" onClick={exportDaily}>
              Baixar resumo diário (CSV)
            </button>
          </div>
        </div>

        <div className="setting">
          <label>Manutenção</label>
          <div className="row">
            <button className="btn small" onClick={() => void resetEnergy()} disabled={!connected}>
              Zerar contadores do ESP32
            </button>
            <button className="btn small ghost" onClick={() => void wipeHistory()}>
              Apagar histórico
            </button>
            <button className="btn small ghost" onClick={() => setShowConsole((v) => !v)} aria-expanded={showConsole}>
              {showConsole ? 'Ocultar mensagens' : 'Ver mensagens do ESP32'}
            </button>
          </div>
          {showConsole && <pre className="console">{rawLines.slice(-40).join('\n') || 'Nenhuma mensagem recebida ainda.'}</pre>}
        </div>
      </div>
    </section>
  )
}
