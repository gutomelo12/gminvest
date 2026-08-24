import { useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Modal } from '../comp/base'
import { fmtBRL, fmtNum, fmtQtd, fmtPct, fmtPctSimples, fmtData, sinal } from '../lib/formato'
import { avaliar, ROTULO_SITUACAO } from '../lib/teto'

const COLS = [
  ['ticker', 'Ativo'], ['qtd', 'Qtd.'], ['precoMedio', 'Preço médio'], ['precoAtual', 'Cotação'],
  ['custo', 'Custo'], ['valorAtual', 'Valor atual'], ['naoRealizado', 'Resultado'],
  ['naoRealizadoPct', 'Result. %'], ['proventos', 'Proventos'], ['fatia', '% carteira'],
]

export default function TabelaPosicoes({ posicoes, ir, comTeto }) {
  const { premissas } = useDados()
  const [ordem, setOrdem] = useState({ campo: 'valorAtual', asc: false })
  const [detalhe, setDetalhe] = useState(null)

  if (!posicoes.length) return (
    <Painel titulo="Posições em aberto"><Vazio><p>Nenhuma posição em aberto.</p></Vazio></Painel>
  )

  const ord = [...posicoes].sort((a, b) => {
    const va = a[ordem.campo], vb = b[ordem.campo]
    if (typeof va === 'string') return ordem.asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return ordem.asc ? (va ?? -Infinity) - (vb ?? -Infinity) : (vb ?? -Infinity) - (va ?? -Infinity)
  })
  const soma = f => ord.reduce((s, p) => s + f(p), 0)
  const totC = soma(p => p.custo), totV = soma(p => p.valorAtual)
  const totR = soma(p => p.naoRealizado), totP = soma(p => p.proventos)

  const clique = campo => setOrdem(o => ({ campo, asc: o.campo === campo ? !o.asc : campo === 'ticker' }))

  return (
    <>
      <Painel titulo="Posições em aberto" aoLado={`${posicoes.length} ativo${posicoes.length === 1 ? '' : 's'}`} corpo={false}>
        <div className="rolagem">
          <table>
            <thead><tr>
              {COLS.map(([k, r]) => (
                <th key={k} className="ord" onClick={() => clique(k)}>
                  {r}{ordem.campo === k ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              {comTeto && <th>Teto</th>}
            </tr></thead>
            <tbody>
              {ord.map(p => {
                const av = comTeto ? avaliar(premissas.find(x => x.ticker === p.ticker), p.precoAtual) : null
                const rot = av ? ROTULO_SITUACAO[av.situacao] : null
                return (
                  <tr key={p.ticker} style={{ cursor: 'pointer' }} onClick={() => setDetalhe(p)}>
                    <td><span className="ticker">{p.ticker}</span>
                      <span className="classe">{p.classe}{p.temCotacao ? '' : ' · sem cotação'}</span></td>
                    <td className="n">{fmtQtd(p.qtd)}</td>
                    <td className="n">{fmtNum(p.precoMedio, p.precoMedio < 1 ? 4 : 2)}</td>
                    <td className={'n ' + (p.temCotacao ? '' : 'nulo')}>{fmtNum(p.precoAtual, p.precoAtual < 1 ? 4 : 2)}</td>
                    <td className="n">{fmtBRL(p.custo)}</td>
                    <td className="n"><strong>{fmtBRL(p.valorAtual)}</strong></td>
                    <td className={'n ' + sinal(p.naoRealizado)}>{fmtBRL(p.naoRealizado)}</td>
                    <td className={'n ' + sinal(p.naoRealizado)}>{fmtPct(p.naoRealizadoPct)}</td>
                    <td className={'n ' + (p.proventos > 0 ? 'pos' : 'nulo')}>{p.proventos > 0 ? fmtBRL(p.proventos) : '—'}</td>
                    <td className="n">{fmtPctSimples(p.fatia)}</td>
                    {comTeto && (
                      <td className="n">
                        {av?.teto
                          ? <span className="tag" style={{ color: rot.cor, borderColor: rot.cor }}>{fmtNum(av.teto)}</span>
                          : <span className="nulo">—</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr>
              <td>Total</td><td /><td /><td />
              <td>{fmtBRL(totC)}</td><td>{fmtBRL(totV)}</td>
              <td className={sinal(totR)}>{fmtBRL(totR)}</td>
              <td className={sinal(totR)}>{fmtPct(totC > 0 ? totR / totC * 100 : null)}</td>
              <td className="pos">{fmtBRL(totP)}</td><td>100,0%</td>
              {comTeto && <td />}
            </tr></tfoot>
          </table>
        </div>
      </Painel>
      {detalhe && <DetalheAtivo posicao={detalhe} aoFechar={() => setDetalhe(null)} ir={ir} />}
    </>
  )
}

function DetalheAtivo({ posicao: p, aoFechar, ir }) {
  const { operacoes, proventos, premissas } = useDados()
  const ops = operacoes.filter(o => o.ticker === p.ticker).sort((a, b) => b.data.localeCompare(a.data))
  const pvs = proventos.filter(o => o.ticker === p.ticker).sort((a, b) => b.data.localeCompare(a.data))
  const av = avaliar(premissas.find(x => x.ticker === p.ticker), p.precoAtual)
  const rot = ROTULO_SITUACAO[av.situacao]

  return (
    <Modal titulo={p.ticker} largo aoFechar={aoFechar} pe={<>
      <button className="btn vazio" onClick={aoFechar}>Fechar</button>
      {ir && <button className="btn" onClick={() => { aoFechar(); ir('teto', p.ticker) }}>Ver preço teto</button>}
    </>}>
      <div className="cartoes" style={{ marginBottom: 18 }}>
        <div className="cartao"><div className="rotulo">Quantidade</div><div className="v">{fmtQtd(p.qtd)}</div></div>
        <div className="cartao"><div className="rotulo">Preço médio</div><div className="v">{fmtBRL(p.precoMedio)}</div></div>
        <div className="cartao"><div className="rotulo">Valor atual</div><div className="v">{fmtBRL(p.valorAtual)}</div></div>
        <div className="cartao"><div className="rotulo">Retorno total</div>
          <div className={'v ' + sinal(p.retornoTotal)}>{fmtBRL(p.retornoTotal)}</div>
          <div className="p">{fmtPct(p.retornoPct)}</div></div>
      </div>

      {av.teto && (
        <div className="aviso info" style={{ marginBottom: 18 }}>
          <strong style={{ color: rot.cor }}>{rot.texto}.</strong>{' '}
          Teto mais conservador em {fmtBRL(av.teto)}, faixa de {fmtBRL(av.faixa.min)} a {fmtBRL(av.faixa.max)}.
          {av.desconto != null && ` A cotação está ${av.desconto >= 0 ? fmtPctSimples(av.desconto, 1) + ' abaixo' : fmtPctSimples(-av.desconto, 1) + ' acima'} do teto.`}
        </div>
      )}

      {p.corretoras.length > 0 && (
        <div className="rotulo" style={{ marginBottom: 12 }}>Custodiado em: {p.corretoras.join(' · ')}</div>
      )}

      <div className="rotulo" style={{ marginBottom: 8 }}>Operações ({ops.length})</div>
      <div className="rolagem" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--linha-2)', borderRadius: 3, marginBottom: 18 }}>
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Qtd.</th><th>Preço</th><th>Taxas</th><th>Total</th></tr></thead>
          <tbody>{ops.map(o => (
            <tr key={o.id}>
              <td className="n">{fmtData(o.data)}</td><td>{o.tipo}</td>
              <td className="n">{fmtQtd(o.quantidade)}</td>
              <td className="n">{fmtNum(o.preco, 4)}</td>
              <td className="n">{fmtNum(o.taxas)}</td>
              <td className="n">{fmtBRL(Math.abs(o.quantidade) * o.preco)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="rotulo" style={{ marginBottom: 8 }}>
        Proventos ({pvs.length}) — {fmtBRL(p.proventos)}
        {p.yieldCusto != null && ` · ${fmtPctSimples(p.yieldCusto, 2)} sobre o custo`}
      </div>
      {pvs.length ? (
        <div className="rolagem" style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--linha-2)', borderRadius: 3 }}>
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Valor</th></tr></thead>
            <tbody>{pvs.map(o => (
              <tr key={o.id}><td className="n">{fmtData(o.data)}</td><td>{o.tipo}</td>
                <td className="n pos">{fmtBRL(o.valor)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p style={{ fontSize: 12.5, color: 'var(--tinta-3)' }}>Nenhum provento registrado para este ativo.</p>}
    </Modal>
  )
}
