import { useAnimatedNumber } from '../hooks'
import { fmt } from '../lib/energy'
import { useStore } from '../store'

function Reading({ k, v, u, d, big }: { k: string; v: number | null; u: string; d: number; big?: boolean }) {
  const a = useAnimatedNumber(v)
  return (
    <div className={`reading ${big ? 'big' : ''}`}>
      <div className="k">{k}</div>
      <div className="v num">
        {fmt.n(a, d)}
        <span className="u">{u}</span>
      </div>
    </div>
  )
}

export function Readings() {
  const tel = useStore((s) => s.tel)
  const meterDown = tel && !tel.meter_ok

  return (
    <section className="panel" aria-labelledby="readings-title">
      <div className="panel-head">
        <h2 id="readings-title">Medição elétrica</h2>
        <span className="sub">{meterDown ? 'Medidor sem resposta: confira o PZEM-004T' : 'PZEM-004T, atualizado a cada segundo'}</span>
      </div>
      <div className="readings">
        <Reading big k="Potência" v={tel?.p ?? null} u="W" d={tel && tel.p !== null && tel.p >= 100 ? 0 : 1} />
        <Reading k="Tensão" v={tel?.v ?? null} u="V" d={1} />
        <Reading k="Corrente" v={tel?.i ?? null} u="A" d={3} />
        <Reading k="Fator de potência" v={tel?.pf ?? null} u="" d={2} />
        <Reading k="Frequência" v={tel?.hz ?? null} u="Hz" d={1} />
      </div>
    </section>
  )
}
