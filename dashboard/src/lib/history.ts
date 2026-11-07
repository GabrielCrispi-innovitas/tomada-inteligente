// Histórico local no navegador (IndexedDB). Dados reais e de demonstração ficam
// em bancos separados para a demo nunca contaminar as medições do relatório.
import Dexie, { type Table } from 'dexie'
import type { Bucket } from './energy'

class HistoryDB extends Dexie {
  declare buckets: Table<Bucket, number> // "declare": não sobrescrever a tabela criada pelo Dexie
  constructor(name: string) {
    super(name)
    this.version(1).stores({ buckets: 'key' })
  }
}

const dbs = new Map<string, HistoryDB>()

export function historyDb(demo: boolean): HistoryDB {
  const name = demo ? 'tomada-upx-demo' : 'tomada-upx'
  let db = dbs.get(name)
  if (!db) {
    db = new HistoryDB(name)
    dbs.set(name, db)
  }
  return db
}

/** Soma o balde ao que já existe (o mesmo minuto pode vir de duas sessões). */
export async function saveBucket(demo: boolean, b: Bucket) {
  const db = historyDb(demo)
  await db.transaction('rw', db.buckets, async () => {
    const old = await db.buckets.get(b.key)
    if (old) {
      await db.buckets.put({
        key: b.key,
        wh: old.wh + b.wh,
        savedWh: old.savedWh + b.savedWh,
        onS: old.onS + b.onS,
        presenceS: old.presenceS + b.presenceS,
        maxW: Math.max(old.maxW, b.maxW),
      })
    } else {
      await db.buckets.put(b)
    }
  })
}

export async function loadBuckets(demo: boolean, sinceMs: number): Promise<Bucket[]> {
  return historyDb(demo).buckets.where('key').aboveOrEqual(sinceMs).toArray()
}

export async function clearHistory(demo: boolean) {
  await historyDb(demo).buckets.clear()
}

/** Gera 13 dias de histórico plausível (baldes por hora) para a demonstração. */
export async function seedDemoHistory() {
  const db = historyDb(true)
  if ((await db.buckets.count()) > 0) return
  const rows: Bucket[] = []
  const now = new Date()
  for (let day = 13; day >= 1; day--) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
    const weekend = base.getDay() === 0 || base.getDay() === 6
    for (let h = 0; h < 24; h++) {
      const working = !weekend && h >= 8 && h < 18
      const evening = h >= 19 && h < 23
      // fração da hora com gente na sala e com o aparelho ligado
      const presence = working ? 0.55 + Math.random() * 0.35 : evening ? Math.random() * 0.5 : 0
      // sem a automação, o aparelho ficaria ligado das 8h às 23h -> o resto é economia
      const wouldBeOn = h >= 8 && h < 23 ? 1 : 0
      const onFrac = Math.min(1, presence + (presence > 0 ? 0.05 : 0))
      const watts = 92 + Math.random() * 10
      rows.push({
        key: new Date(base.getFullYear(), base.getMonth(), base.getDate(), h).getTime(),
        wh: watts * onFrac,
        savedWh: watts * Math.max(0, wouldBeOn - onFrac),
        onS: 3600 * onFrac,
        presenceS: 3600 * presence,
        maxW: onFrac > 0 ? watts + 20 : 0,
      })
    }
  }
  await db.buckets.bulkPut(rows)
}
