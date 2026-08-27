import { useMemo, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Modal, useRecibo } from '../comp/base'
import { fmtBRL, fmtMoeda, fmtNum, fmtQtd, fmtPct, fmtPctSimples, fmtData, sinal, corClasseEfetiva, LISTA_CLASSES } from '../lib/formato'
import { avaliar, ROTULO_SITUACAO } from '../lib/teto'

const COLS = [
  ['ticker', 'Ativo'], ['qtd', 'Qtd.'], ['precoMedio', 'Preço médio'], ['precoAtual', 'Cotação'],
  ['teto', 'Preço teto'], ['valorAtual', 'Valor atual'], ['naoRealizado', 'Resultado'],
  ['naoRealizadoPct', 'Result. %'], ['retornoPct', 'Rentab. total'], ['proventos', 'Proventos'],
  ['fatia', '% carteira'],
]

const Seta = ({ aberta }) => (
  <svg className={'seta-grupo' + (aberta ? ' aberta' : '')} width="11" height="11" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

function LinhaPosicao({ p, premissas, mostrarClasse = true, aoClicar }) {
  const av = avaliar(premissas.find(x => x.ticker === p.ticker), p.precoAtual)
  const rot = ROTULO_SITUACAO[av.situacao]
  return (
    <tr style={{ cursor: 'pointer' }} onClick={aoClicar}>
      <td>
        <span className="ticker">{p.ticker}</span>
        {mostrarClasse && (
          <span className="classe">{p.classe}{(!p.temCotacao && p.esperaCotacao) ? ' · sem cotação' : ''}</span>
        )}
      </td>
      <td className="n">{fmtQtd(p.qtd)}</td>
      <td className="n">{fmtMoeda(p.precoMedio, p.moeda)}</td>
      <td className={'n ' + (p.temCotacao ? '' : 'nulo')}>{fmtMoeda(p.precoAtual, p.moeda)}</td>
      <td className="n">
        {av.teto
          ? <span className="tag" style={{ color: rot.cor, borderColor: rot.cor }}>{fmtMoeda(av.teto, p.moeda)}</span>
          : <span className="nulo">—</span>}
      </td>
      <td className="n"><strong>{fmtMoeda(p.valorAtual, p.moeda)}</strong></td>
      <td className={'n ' + sinal(p.naoRealizado)}>{fmtMoeda(p.naoRealizado, p.moeda)}</td>
      <td className={'n ' + sinal(p.naoRealizado)}>{fmtPct(p.naoRealizadoPct)}</td>
      <td className={'n ' + sinal(p.retornoTotal)}>{fmtPct(p.retornoPct)}</td>
      <td className={'n ' + (p.proventos > 0 ? 'pos' : 'nulo')}>{p.proventos > 0 ? fmtMoeda(p.proventos, p.moeda) : '—'}</td>
      <td className="n">{fmtPctSimples(p.fatia)}</td>
    </tr>
  )
}

export default function TabelaPosicoes({ posicoes, ir }) {
  const { premissas, alvos, mapaCoresClasse } = useDados()
  const [ordem, setOrdem] = useState({ campo: 'valorAtual', asc: false })
  const [agrupar, setAgrupar] = useState(true)
  const [expandidos, setExpandidos] = useState(() => new Set())
  const [detalhe, setDetalhe] = useState(null)

  const ord = useMemo(() => [...posicoes].sort((a, b) => {
    const va = a[ordem.campo], vb = b[ordem.campo]
    if (typeof va === 'string') return ordem.asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return ordem.asc ? (va ?? -Infinity) - (vb ?? -Infinity) : (vb ?? -Infinity) - (va ?? -Infinity)
  }), [posicoes, ordem])

  /**
   * Cada classe vira um bloco com subtotal, recolhido até a pessoa abrir.
   * O subtotal do grupo é sempre em reais, mesmo quando os ativos dentro
   * estão em dólar — grupo mistura moedas dentro de uma classe só se a
   * classe for inteira em outra moeda (Exterior), então somar o valor já
   * convertido é o que faz esse número fazer sentido.
   */
  const grupos = useMemo(() => {
    const mapa = new Map()
    ord.forEach(p => {
      if (!mapa.has(p.classe)) mapa.set(p.classe, [])
      mapa.get(p.classe).push(p)
    })
    return [...mapa.entries()]
      .map(([classe, itens]) => {
        const custo = itens.reduce((s, p) => s + (p.custoBRL ?? 0), 0)
        const resultado = itens.reduce((s, p) => s + (p.naoRealizadoBRL ?? 0), 0)
        const proventos = itens.reduce((s, p) => s + (p.proventosBRL ?? 0), 0)
        const alvo = alvos.find(a => a.nivel === 'classe' && a.chave === classe)
        return {
          classe, itens, custo, resultado, proventos,
          valor: itens.reduce((s, p) => s + (p.valorAtualBRL ?? 0), 0),
          fatia: itens.reduce((s, p) => s + p.fatia, 0),
          rentabilidadePct: custo > 0 ? (resultado + proventos) / custo * 100 : null,
          alvoPct: alvo ? alvo.percentual : null,
          temEstrangeiroSemTaxa: itens.some(p => !p.temTaxa),
        }
      })
      .sort((a, b) => b.valor - a.valor)
  }, [ord, alvos])

  if (!posicoes.length) return (
    <Painel titulo="Meus Ativos"><Vazio><p>Nenhuma posição em aberto.</p></Vazio></Painel>
  )

  const soma = f => ord.reduce((s, p) => s + (f(p) ?? 0), 0)
  const totC = soma(p => p.custoBRL), totV = soma(p => p.valorAtualBRL)
  const totR = soma(p => p.naoRealizadoBRL), totP = soma(p => p.proventosBRL)
  const totRetorno = totR + soma(p => p.realizadoBRL) + totP
  const clique = campo => setOrdem(o => ({ campo, asc: o.campo === campo ? !o.asc : campo === 'ticker' }))

  const alternarGrupo = classe => setExpandidos(s => {
    const n = new Set(s)
    n.has(classe) ? n.delete(classe) : n.add(classe)
    return n
  })

  return (
    <>
      <Painel corpo={false}>
        <div className="painel-cab">
          <h3>Meus Ativos ({posicoes.length})</h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {agrupar && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn mini vazio" onClick={() => setExpandidos(new Set(grupos.map(g => g.classe)))}>
                  Abrir tudo
                </button>
                <button className="btn mini vazio" onClick={() => setExpandidos(new Set())}>Fechar tudo</button>
              </div>
            )}
            <label className="linha-cheque">
              <input type="checkbox" checked={agrupar} onChange={e => setAgrupar(e.target.checked)} />
              Separar por classe
            </label>
          </div>
        </div>

        {agrupar ? (
          <div className="secoes-grupo">
            {grupos.map(g => {
              const aberto = expandidos.has(g.classe)
              const resultadoPct = g.custo > 0 ? g.resultado / g.custo * 100 : null
              return (
                <div key={g.classe} className="secao-grupo">
                  <div className="secao-grupo-cab" onClick={() => alternarGrupo(g.classe)}>
                    <div className="secao-grupo-titulo">
                      <Seta aberta={aberto} />
                      <span className="risco" style={{ background: corClasseEfetiva(g.classe, mapaCoresClasse) }} />
                      <strong>{g.classe}</strong>
                      <span className="conta">{g.itens.length} ativo{g.itens.length === 1 ? '' : 's'}</span>
                      {g.temEstrangeiroSemTaxa && (
                        <span className="tag" style={{ color: 'var(--ambar)', borderColor: 'var(--ambar)', marginLeft: 8 }}>
                          sem câmbio
                        </span>
                      )}
                    </div>
                    <div className="secao-grupo-metricas">
                      <div className="item"><span className="rotulo">Valor</span>
                        <span className="num"><strong>{fmtBRL(g.valor)}</strong></span></div>
                      <div className="item"><span className="rotulo">Resultado</span>
                        <span className={'num ' + sinal(g.resultado)}>{fmtPct(resultadoPct)}</span></div>
                      <div className="item"><span className="rotulo">Rentabilidade</span>
                        <span className={'num ' + sinal(g.resultado + g.proventos)}>{fmtPct(g.rentabilidadePct)}</span></div>
                      <div className="item"><span className="rotulo">% carteira</span>
                        <span className="num">{fmtPctSimples(g.fatia)}
                          {g.alvoPct != null && <span className="nulo"> / {fmtPctSimples(g.alvoPct)}</span>}
                        </span></div>
                    </div>
                  </div>
                  {aberto && (
                    <div className="rolagem">
                      <table>
                        <thead><tr>
                          {COLS.map(([k, r]) => (
                            <th key={k} className="ord" onClick={() => clique(k)}>
                              {r}{ordem.campo === k ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                            </th>
                          ))}
                        </tr></thead>
                        <tbody>{g.itens.map(p => (
                          <LinhaPosicao key={p.ticker} p={p} mostrarClasse={false}
                            premissas={premissas} aoClicar={() => setDetalhe(p)} />
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="secao-grupo-total">
              <strong style={{ fontSize: 13.5 }}>Total da carteira</strong>
              <div className="secao-grupo-metricas">
                <div className="item"><span className="rotulo">Valor</span>
                  <span className="num"><strong>{fmtBRL(totV)}</strong></span></div>
                <div className="item"><span className="rotulo">Resultado</span>
                  <span className={'num ' + sinal(totR)}>{fmtPct(totC > 0 ? totR / totC * 100 : null)}</span></div>
                <div className="item"><span className="rotulo">Rentabilidade</span>
                  <span className={'num ' + sinal(totRetorno)}>{fmtPct(totC > 0 ? totRetorno / totC * 100 : null)}</span></div>
                <div className="item"><span className="rotulo">Proventos</span>
                  <span className="num pos">{fmtBRL(totP)}</span></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rolagem">
            <table>
              <thead><tr>
                {COLS.map(([k, r]) => (
                  <th key={k} className="ord" onClick={() => clique(k)}>
                    {r}{ordem.campo === k ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {ord.map(p => (
                  <LinhaPosicao key={p.ticker} p={p}
                    premissas={premissas} aoClicar={() => setDetalhe(p)} />
                ))}
              </tbody>
              <tfoot><tr>
                <td>Total</td><td /><td /><td /><td />
                <td>{fmtBRL(totV)}</td>
                <td className={sinal(totR)}>{fmtBRL(totR)}</td>
                <td className={sinal(totR)}>{fmtPct(totC > 0 ? totR / totC * 100 : null)}</td>
                <td className={sinal(totRetorno)}>{fmtPct(totC > 0 ? totRetorno / totC * 100 : null)}</td>
                <td className="pos">{fmtBRL(totP)}</td><td>100,0%</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </Painel>
      {detalhe && <DetalheAtivo posicao={detalhe} aoFechar={() => setDetalhe(null)} ir={ir} />}
    </>
  )
}

function DetalheAtivo({ posicao: p, aoFechar, ir }) {
  const { operacoes, proventos, premissas, definirClasse, podeEscrever } = useDados()
  const recibo = useRecibo()
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
        <div className="cartao"><div className="rotulo">Preço médio</div><div className="v">{fmtMoeda(p.precoMedio, p.moeda)}</div></div>
        <div className="cartao"><div className="rotulo">Valor atual</div><div className="v">{fmtMoeda(p.valorAtual, p.moeda)}</div></div>
        <div className="cartao"><div className="rotulo">Retorno total</div>
          <div className={'v ' + sinal(p.retornoTotal)}>{fmtMoeda(p.retornoTotal, p.moeda)}</div>
          <div className="p">{fmtPct(p.retornoPct)}</div></div>
      </div>

      {p.moeda === 'USD' && (
        <div className="aviso info" style={{ marginBottom: 18 }}>
          Ativo cotado em dólar. Os valores acima estão na moeda nativa; no total da carteira e na
          alocação, entram convertidos para real{p.temTaxa ? ` a ${fmtNum(p.taxaCambio, 4)}` : ' — mas ainda não há câmbio cadastrado, então este ativo não está contando no total'}.
        </div>
      )}

      {av.teto && (
        <div className="aviso info" style={{ marginBottom: 18 }}>
          <strong style={{ color: rot.cor }}>{rot.texto}.</strong>{' '}
          Teto mais conservador em {fmtMoeda(av.teto, p.moeda)}, faixa de {fmtMoeda(av.faixa.min, p.moeda)} a {fmtMoeda(av.faixa.max, p.moeda)}.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <span className="rotulo">Classe</span>
        <select value={p.classe} disabled={!podeEscrever}
          onChange={async e => {
            try {
              await definirClasse(p.ticker, e.target.value)
              recibo(`${p.ticker} agora é ${e.target.value}.`, 'ok')
            } catch (err) { recibo(err.message, 'erro') }
          }}
          style={{ padding: '5px 9px', border: '1px solid var(--linha)', borderRadius: 3, background: '#fff' }}>
          {LISTA_CLASSES.map(c => <option key={c}>{c}</option>)}
        </select>
        {p.corretoras.length > 0 && (
          <span className="rotulo" style={{ marginLeft: 8 }}>Custodiado em: {p.corretoras.join(' · ')}</span>
        )}
      </div>

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
