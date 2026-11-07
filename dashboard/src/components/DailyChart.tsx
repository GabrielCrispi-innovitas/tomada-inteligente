import { useMemo } from 'react'
import { readTokens, useEChart, useNow, useThrottled, type ThemeName } from '../hooks'
import { fmt, groupByDay, lastNDays } from '../lib/energy'
import { useStore } from '../store'

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function DailyChart({ theme }: { theme: ThemeName }) {
  const history = useStore((s) => s.history)
  const live = useThrottled(useStore((s) => s.live), 15000) // o minuto atual muda pouco
  const tariff = useStore((s) => s.settings.tariff)
  const now = useNow(30000)

  const days = useMemo(() => lastNDays(groupByDay(live ? [...history, live] : history), 14, now), [history, live, now])
  const hasData = days.some((d) => d.wh > 0 || d.savedWh > 0)

  const option = useMemo(() => {
    const k = readTokens()
    void theme
    const labels = days.map((d) => {
      const dt = new Date(d.ts)
      return `${WEEK[dt.getDay()]}\n${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`
    })
    const bar = (name: string, color: string, data: number[]) => ({
      type: 'bar',
      name,
      data,
      barMaxWidth: 16,
      barGap: '20%',
      itemStyle: { color, borderRadius: [4, 4, 0, 0] },
      emphasis: { focus: 'series' },
    })
    return {
      animationDuration: 700,
      animationDurationUpdate: 300,
      animationEasing: 'cubicOut' as const,
      textStyle: { fontFamily: k.font },
      grid: { left: 52, right: 10, top: 12, bottom: 42 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: k.lineSoft, opacity: 0.6 } },
        backgroundColor: k.panel,
        borderColor: k.line,
        textStyle: { color: k.ink, fontSize: 12.5 },
        formatter: (ps: { dataIndex: number }[]) => {
          const d = days[ps[0]?.dataIndex ?? 0]
          if (!d) return ''
          const date = new Date(d.ts).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
          return `<div style="font-size:12px;color:${k.muted};margin-bottom:4px">${date}</div>
            <div><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${k.power};margin-right:6px"></span>Consumida <b>${fmt.kwh(d.wh)}</b> (${fmt.brl((d.wh / 1000) * tariff)})</div>
            <div><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${k.saved};margin-right:6px"></span>Economizada <b>${fmt.kwh(d.savedWh)}</b> (${fmt.brl((d.savedWh / 1000) * tariff)})</div>
            <div style="color:${k.muted};margin-top:4px">Ligada por ${fmt.dur(d.onS)}</div>`
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: k.line } },
        axisTick: { show: false },
        axisLabel: { color: k.muted, fontSize: 10.5, lineHeight: 14 },
      },
      yAxis: {
        type: 'value',
        splitNumber: 4,
        axisLabel: { color: k.muted, fontSize: 11, formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kWh` : `${v} Wh`) },
        splitLine: { lineStyle: { color: k.lineSoft } },
      },
      series: [bar('Consumida', k.power, days.map((d) => Math.round(d.wh))), bar('Economizada', k.saved, days.map((d) => Math.round(d.savedWh)))],
    }
  }, [days, tariff, theme])

  const ref = useEChart(option)

  return (
    <section className="panel" aria-labelledby="daily-title">
      <div className="panel-head">
        <div>
          <h2 id="daily-title">Energia por dia</h2>
          <div className="sub">Últimos 14 dias, guardados neste navegador</div>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--power)' }} /> Consumida
          </span>
          <span>
            <i style={{ background: 'var(--saved)' }} /> Economizada
          </span>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={ref} className="chart tall" role="img" aria-label="Gráfico de barras da energia consumida e economizada por dia" />
        {!hasData && (
          <div className="empty" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            O histórico começa a ser gravado quando o ESP32 se conecta.
          </div>
        )}
      </div>
    </section>
  )
}
