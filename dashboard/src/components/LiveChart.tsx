import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { readTokens, useEChart, type ThemeName } from '../hooks'
import { fmt } from '../lib/energy'
import { useStore, type Sample } from '../store'

const WINDOWS = [
  { id: 60, label: '1 min' },
  { id: 600, label: '10 min' },
  { id: 3600, label: '1 h' },
] as const

type Seg = { from: number; to: number }

function segments(samples: Sample[], key: 'presence' | 'relay', t0: number, t1: number): Seg[] {
  const out: Seg[] = []
  let start: number | null = null
  for (const s of samples) {
    if (s.t < t0) continue
    if (s[key] && start === null) start = s.t
    if (!s[key] && start !== null) {
      out.push({ from: start, to: s.t })
      start = null
    }
  }
  if (start !== null) out.push({ from: start, to: t1 })
  return out
}

const hhmmss = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function LiveChart({ theme }: { theme: ThemeName }) {
  const samples = useStore((s) => s.samples)
  const [win, setWin] = useState<number>(600)

  const t1 = samples.length ? samples[samples.length - 1].t : Date.now()
  // Enquanto houver menos dados que a janela, o eixo começa na primeira amostra
  // (senão a linha fica espremida na borda direita).
  const t0 = Math.max(t1 - win * 1000, samples.length ? Math.min(samples[0].t, t1 - 20_000) : 0)
  const visible = useMemo(() => samples.filter((s) => s.t >= t0), [samples, t0])

  const option = useMemo(() => {
    const k = readTokens()
    void theme
    return {
      animation: true,
      animationDuration: 500,
      animationDurationUpdate: 450,
      animationEasingUpdate: 'linear' as const,
      textStyle: { fontFamily: k.font },
      grid: { left: 46, right: 14, top: 14, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: k.panel,
        borderColor: k.line,
        textStyle: { color: k.ink, fontSize: 12.5 },
        axisPointer: { type: 'line', lineStyle: { color: k.muted, type: 'dashed' } },
        formatter: (ps: { value: [number, number | null] }[]) => {
          const p = ps[0]
          if (!p) return ''
          return `<div style="font-size:12px;color:${k.muted}">${hhmmss(p.value[0])}</div><b style="font-size:15px">${fmt.w(p.value[1])} W</b>`
        },
      },
      xAxis: {
        type: 'time',
        min: t0,
        max: t1,
        axisLine: { lineStyle: { color: k.line } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: k.muted, fontSize: 11, hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleTimeString('pt-BR', t1 - t0 <= 180_000 ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' }) },
      },
      yAxis: {
        type: 'value',
        min: 0,
        boundaryGap: [0, '15%'],
        splitNumber: 4,
        axisLabel: { color: k.muted, fontSize: 11, formatter: '{value} W' },
        splitLine: { lineStyle: { color: k.lineSoft } },
      },
      series: [
        {
          type: 'line',
          name: 'Potência',
          showSymbol: false,
          smooth: 0.25,
          sampling: 'lttb',
          lineStyle: { width: 2, color: k.power },
          itemStyle: { color: k.power },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: k.powerSoft },
                { offset: 1, color: 'rgba(0,0,0,0)' },
              ],
            },
          },
          data: visible.map((s) => [s.t, s.p]),
        },
      ],
    }
  }, [visible, t0, t1, win, theme])

  const ref = useEChart(option)
  const presence = useMemo(() => segments(visible, 'presence', t0, t1), [visible, t0, t1])
  const relay = useMemo(() => segments(visible, 'relay', t0, t1), [visible, t0, t1])
  const pos = (s: Seg) => ({ left: `${((s.from - t0) / (t1 - t0)) * 100}%`, width: `${Math.max(0.3, ((s.to - s.from) / (t1 - t0)) * 100)}%` })

  const avg = visible.length ? visible.reduce((a, s) => a + (s.p ?? 0), 0) / visible.length : null
  const peak = visible.length ? Math.max(...visible.map((s) => s.p ?? 0)) : null

  return (
    <section className="panel" aria-labelledby="live-title">
      <div className="panel-head">
        <div>
          <h2 id="live-title">Potência em tempo real</h2>
          <div className="sub num">
            Média de {fmt.w(avg)} W, pico de {fmt.w(peak)} W
          </div>
        </div>
        <div className="seg" role="group" aria-label="Janela de tempo">
          {WINDOWS.map((w) => (
            <button key={w.id} aria-pressed={win === w.id} onClick={() => setWin(w.id)}>
              {win === w.id && <motion.span layoutId="win-thumb" className="seg-thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              {w.label}
            </button>
          ))}
        </div>
      </div>
      {/* a div do gráfico precisa existir desde o início para o ECharts inicializar */}
      <div style={{ position: 'relative' }}>
        <div ref={ref} className="chart" role="img" aria-label="Gráfico da potência consumida ao longo do tempo" />
        {visible.length === 0 && (
          <div className="empty" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            Os dados aparecem aqui assim que o ESP32 começar a enviar.
          </div>
        )}
      </div>

      <div className="timeline" aria-label="Linha do tempo de presença e da tomada">
        <div className="tl-row">
          <span>Presença</span>
          <div className="tl-track">
            {presence.map((s, i) => (
              <div key={i} className="tl-seg" style={{ ...pos(s), background: 'var(--presence)' }} />
            ))}
          </div>
        </div>
        <div className="tl-row">
          <span>Tomada</span>
          <div className="tl-track">
            {relay.map((s, i) => (
              <div key={i} className="tl-seg" style={{ ...pos(s), background: 'var(--power)' }} />
            ))}
          </div>
        </div>
        <div className="legend" style={{ marginLeft: 84 }}>
          <span>
            <i style={{ background: 'var(--presence)' }} /> Pessoa detectada
          </span>
          <span>
            <i style={{ background: 'var(--power)' }} /> Tomada ligada
          </span>
          <span>
            <i style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }} /> Ausente / desligada
          </span>
        </div>
      </div>
    </section>
  )
}
