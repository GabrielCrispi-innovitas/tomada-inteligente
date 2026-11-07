// @vitest-environment jsdom
// Teste de fumaça: renderiza o painel inteiro e roda o modo demo por alguns
// "segundos" simulados, garantindo que não há travamentos nem loops de renderização.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('echarts/core', () => {
  const chart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
  return { use: vi.fn(), init: vi.fn(() => chart) }
})
vi.mock('dexie', () => {
  class Table {
    rows = new Map<number, unknown>()
    async get(k: number) { return this.rows.get(k) }
    async put(v: { key: number }) { this.rows.set(v.key, v) }
    async bulkPut(vs: { key: number }[]) { vs.forEach((v) => this.rows.set(v.key, v)) }
    async count() { return this.rows.size }
    async clear() { this.rows.clear() }
    where() { return { aboveOrEqual: () => ({ toArray: async () => [...this.rows.values()] }) } }
  }
  class Dexie {
    buckets = new Table()
    version() { return { stores: () => undefined } }
    async transaction(_m: string, _t: unknown, fn: () => Promise<void>) { await fn() }
  }
  return { default: Dexie }
})

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  window.scrollTo = (() => undefined) as typeof window.scrollTo
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver
})
afterEach(() => cleanup())

describe('App', () => {
  it('renderiza sem dispositivo (?demo=0)', async () => {
    window.history.replaceState(null, '', '/?demo=0')
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a))
    let t = performance.now()
    const { default: App } = await import('../App')
    console.log('import ms', Math.round(performance.now() - t))
    t = performance.now()
    const { container } = render(<App />)
    console.log('render ms', Math.round(performance.now() - t))
    t = performance.now()
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    console.log('settle ms', Math.round(performance.now() - t))
    expect(container.textContent).toContain('Estado da tomada')
    expect(container.textContent).toContain('Sem sinal')
    expect(errors).toEqual([])
    spy.mockRestore()
  }, 60000)

  it('modo demo liga e desliga a tomada conforme a presença', async () => {
    window.history.replaceState(null, '', '/')
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a))
    const { default: App } = await import('../App')
    const { setDemoPresence } = await import('../device')
    const { container } = render(<App />)
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)) })
    expect(container.textContent).toContain('Modo demonstração')

    await act(async () => { setDemoPresence('present') ; await new Promise((r) => setTimeout(r, 1800)) })
    expect(container.querySelector('.plug-state')?.textContent).toBe('Ligada')

    await act(async () => { setDemoPresence('absent'); await new Promise((r) => setTimeout(r, 4200)) })
    expect(container.querySelector('.plug-state')?.textContent).toBe('Desligada')
    expect(container.textContent).toContain('Sem presença: desligada automaticamente')
    expect(errors).toEqual([])
    spy.mockRestore()
  }, 20000)
})
