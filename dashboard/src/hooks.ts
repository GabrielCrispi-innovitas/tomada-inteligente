import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, MarkAreaComponent, CanvasRenderer])

export type ThemeName = 'dark' | 'light'
export type ThemePref = ThemeName | 'system'

const THEME_KEY = 'tomada-upx:theme'

function systemTheme(): ThemeName {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Tema efetivo + preferência (sistema / claro / escuro), aplicada em <html data-theme>. */
export function useTheme(): [ThemeName, ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as ThemePref) || 'system'
    } catch {
      return 'system'
    }
  })
  const [sys, setSys] = useState<ThemeName>(systemTheme)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const fn = () => setSys(mq.matches ? 'light' : 'dark')
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    if (pref === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', pref)
    try {
      localStorage.setItem(THEME_KEY, pref)
    } catch {
      /* ignore */
    }
  }, [pref])

  return [pref === 'system' ? sys : pref, pref, setPref]
}

/** Lê os tokens de cor do CSS (para os gráficos seguirem o tema). */
export function readTokens() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    ink: v('--ink'),
    ink2: v('--ink-2'),
    muted: v('--muted'),
    line: v('--line'),
    lineSoft: v('--line-soft'),
    panel: v('--panel'),
    panel2: v('--panel-2'),
    power: v('--power'),
    powerSoft: v('--power-soft'),
    presence: v('--presence'),
    presenceSoft: v('--presence-soft'),
    saved: v('--saved'),
    off: v('--off'),
    font: v('--font'),
  }
}
export type Tokens = ReturnType<typeof readTokens>

/** Instancia um gráfico ECharts e o mantém do tamanho do contêiner. */
export function useEChart(option: echarts.EChartsCoreOption | null, opts?: { notMerge?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    chart.current = c
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    if (option && chart.current) chart.current.setOption(option, { notMerge: opts?.notMerge ?? false, lazyUpdate: true })
  }, [option, opts?.notMerge])

  return ref
}

/** Número que desliza suavemente até o novo valor. */
export function useAnimatedNumber(target: number | null, ms = 650): number | null {
  const [val, setVal] = useState<number | null>(target)
  const from = useRef<number | null>(target)
  const raf = useRef(0)

  useEffect(() => {
    if (target === null || !Number.isFinite(target)) {
      from.current = null
      setVal(null)
      return
    }
    const start = from.current ?? target
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || start === target) {
      from.current = target
      setVal(target)
      return
    }
    const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = 1 - (1 - k) ** 3
      const cur = start + (target - start) * e
      from.current = cur
      setVal(cur)
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms])

  return val
}

/** Re-renderiza a cada `ms` (relógios, "há X s"). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** Repassa o valor no máximo uma vez a cada `ms` (evita recalcular gráficos pesados a cada segundo). */
export function useThrottled<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const wait = last.current + ms - Date.now()
    if (wait <= 0) {
      last.current = Date.now()
      setV(value)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      last.current = Date.now()
      setV(value)
    }, wait)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, ms])
  return v
}
