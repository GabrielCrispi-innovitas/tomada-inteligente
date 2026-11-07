import { useMemo } from 'react'
import { useAnimatedNumber, useNow, useThrottled } from '../hooks'
import { fmt, groupByDay, lastNDays, project } from '../lib/energy'
import { useStore } from '../store'

export function SavingsCard() {
  const history = useStore((s) => s.history)
  const live = useThrottled(useStore((s) => s.live), 5000)
  const settings = useStore((s) => s.settings)
  const tel = useStore((s) => s.tel)
  const now = useNow(5000)

  const { today, proj } = useMemo(() => {
    const all = live ? [...history, live] : history
    const days = lastNDays(groupByDay(all), 14, now)
    return { today: days[days.length - 1], proj: project(days, settings) }
  }, [history, live, settings, now])

  const savedToday = useAnimatedNumber(today.savedWh, 800)
  const usedBRL = (today.wh / 1000) * settings.tariff
  const savedBRL = (today.savedWh / 1000) * settings.tariff

  return (
    <section className="panel" aria-labelledby="savings-title">
      <div className="panel-head">
        <h2 id="savings-title">Economia gerada</h2>
        <span className="sub">Tarifa de {fmt.brl(settings.tariff)}/kWh</span>
      </div>

      <div className="sub" style={{ marginBottom: 4 }}>
        Energia evitada hoje com a tomada desligada por ausência
      </div>
      <div className="savings-hero">
        <span className="v num">{fmt.kwh(savedToday ?? 0)}</span>
        <span className="u num">{savedBRL >= 0.01 ? `${fmt.brl(savedBRL)} a menos na conta` : 'economia ainda abaixo de R$ 0,01'}</span>
      </div>

      <div className="stat-list">
        <div className="stat-row">
          <span>Consumo de hoje</span>
          <strong className="num">
            {fmt.kwh(today.wh)} ({fmt.brl(usedBRL)})
          </strong>
        </div>
        <div className="stat-row">
          <span>Projeção de economia em 30 dias</span>
          <strong className="num">
            {fmt.n(proj.monthlySavedKwh, 2)} kWh ({fmt.brl(proj.monthlySavedBRL)})
          </strong>
        </div>
        <div className="stat-row">
          <span>CO₂ evitado em 30 dias</span>
          <strong className="num">{fmt.kg(proj.monthlyCo2Kg)}</strong>
        </div>
        <div className="stat-row">
          <span>Retorno do protótipo ({fmt.brl(settings.prototypeCost)})</span>
          <strong className="num">{proj.paybackMonths === null ? 'Sem dados ainda' : proj.paybackMonths > 120 ? 'Mais de 10 anos' : `${fmt.n(proj.paybackMonths, 1)} meses`}</strong>
        </div>
        <div className="stat-row">
          <span>Tempo desligada por ausência no ESP32</span>
          <strong className="num">{tel ? `${fmt.dur(tel.saved_s)} (${fmt.kwh(tel.saved_wh ?? 0)})` : '—'}</strong>
        </div>
      </div>
      <p className="sub" style={{ margin: '12px 0 0' }}>
        A economia é estimada com a potência média do aparelho enquanto ligado. A projeção usa a média de {proj.basisDays || 0}{' '}
        {proj.basisDays === 1 ? 'dia' : 'dias'} com dados.
      </p>
    </section>
  )
}
