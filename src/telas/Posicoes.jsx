import { useDados } from '../ctx/Dados'
import { Painel } from '../comp/base'
import { fmtBRL, fmtData, sinal } from '../lib/formato'
import TabelaPosicoes from './TabelaPosicoes'

export default function Posicoes({ ir }) {
  const { calc } = useDados()
  const totR = calc.encerradas.reduce((s, x) => s + x.realizado, 0)
  return (
    <>
      <TabelaPosicoes posicoes={calc.abertas} ir={ir} />
      {calc.encerradas.length > 0 && (
        <Painel titulo="Posições encerradas" aoLado={`resultado ${fmtBRL(totR)}`} corpo={false}>
          <div className="rolagem">
            <table>
              <thead><tr><th>Ativo</th><th>Período</th><th>Custo vendido</th><th>Resultado</th><th>Proventos</th></tr></thead>
              <tbody>{calc.encerradas.map(x => (
                <tr key={x.ticker}>
                  <td><span className="ticker">{x.ticker}</span><span className="classe">{x.classe}</span></td>
                  <td className="n">{fmtData(x.primeira)} – {fmtData(x.ultima)}</td>
                  <td className="n">{fmtBRL(x.custoVendido)}</td>
                  <td className={'n ' + sinal(x.realizado)}>{fmtBRL(x.realizado)}</td>
                  <td className={'n ' + (x.proventos > 0 ? 'pos' : 'nulo')}>{x.proventos > 0 ? fmtBRL(x.proventos) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Painel>
      )}
    </>
  )
}
