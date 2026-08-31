import { useEffect, useState } from 'react'
import { buscarNoServidor } from '../lib/cotacoes'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Modal, Ponto, useRecibo } from '../comp/base'
import { avaliar, MODELOS, MODELOS_PADRAO, MODELOS_PADRAO_POR_CLASSE, ROTULO_SITUACAO, dpaPelosProventos, taxaGordonAjustado } from '../lib/teto'
import { fmtBRL, fmtNum, fmtPctSimples, fmtPct, paraNumero, CLASSES_TETO } from '../lib/formato'

const PADRAO = {
  dpa: '', lpa: '', vpa: '',
  yield_exigido: 6, taxa_exigida: 10, crescimento: 3, margem: 0, pvp_maximo: 1.1,
  tipo_fii: 'tijolo', taxa_livre_risco: '', premio_risco: 2, ajustar_ir: true, aliquota_ir: 15,
  metodos: [], nota: '',
}

export default function PrecoTeto({ focoTicker, limparFoco }) {
  const { calc, premissas } = useDados()
  const [editando, setEditando] = useState(null)

  const elegiveis = calc.abertas.filter(p => CLASSES_TETO.includes(p.classe))
  const porClasse = (() => {
    const m = new Map()
    elegiveis.forEach(p => { (m.get(p.classe) || m.set(p.classe, []).get(p.classe)).push(p) })
    return [...m.entries()].sort((a, b) =>
      b[1].reduce((s, p) => s + p.valorAtual, 0) - a[1].reduce((s, p) => s + p.valorAtual, 0))
  })()

  useEffect(() => {
    if (!focoTicker) return
    const p = elegiveis.find(x => x.ticker === focoTicker)
    if (p) setEditando(p)
    limparFoco?.()
  }, [focoTicker])

  if (!elegiveis.length) return (
    <Painel><Vazio>
      <p>Preço teto se aplica a ações, FIIs e BDRs — nenhum desses aparece em carteira ainda.
        Os modelos partem de dividendo, lucro e patrimônio por ação, que renda fixa não tem.</p>
    </Vazio></Painel>
  )

  const semPremissa = elegiveis.filter(p => !premissas.some(x => x.ticker === p.ticker)).length

  return (
    <>
      <Painel titulo="Como funciona" aoLado="quatro modelos, uma faixa">
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
          {Object.entries(MODELOS).map(([k, m]) => (
            <div key={k}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{m.nome}</div>
              <div className="num" style={{ fontSize: 12, color: 'var(--verde)', marginBottom: 5 }}>{m.formula}</div>
              <div style={{ fontSize: 12.5, color: 'var(--tinta-3)', lineHeight: 1.55 }}>{m.resumo}</div>
            </div>
          ))}
        </div>
        <div className="aviso info" style={{ marginTop: 16 }}>
          O teto que vale é <strong>o mais baixo entre os modelos escolhidos</strong>, já com a margem de
          segurança descontada. A faixa entre o menor e o maior mostra o quanto os métodos discordam — quando
          eles divergem muito, é sinal de que alguma premissa merece uma segunda olhada.
        </div>
        <div className="aviso atencao" style={{ marginTop: 10 }}>
          Este cálculo é uma referência, não uma recomendação de investimento. Premissas diferentes geram
          resultados diferentes. Avalie usando múltiplos critérios.
        </div>
      </Painel>

      <BuscarFundamentos elegiveis={elegiveis} />

      {semPremissa > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 20 }}>
          <strong>{semPremissa} ativo{semPremissa === 1 ? '' : 's'} sem premissas.</strong>{' '}
          Use a busca acima para preencher DPA, LPA e VPA de uma vez, ou digite ativo por ativo em
          Premissas. O que você digitar à mão nunca é sobrescrito pela busca.
        </div>
      )}

      <Painel titulo="Preço teto por ativo" aoLado={`${elegiveis.length} ativo${elegiveis.length === 1 ? '' : 's'}`} corpo={false}>
        {porClasse.map(([classe, itens]) => (
          <div key={classe} style={{ borderTop: classe === porClasse[0][0] ? 'none' : '1px solid var(--linha-2)' }}>
            <div style={{ padding: '10px 16px', background: 'var(--cedula-3)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 16, fontWeight: 600, color: 'var(--tinta)' }}>
                <Ponto classe={classe} />{classe}
              </span>
              <span className="rotulo" style={{ paddingBottom: 0 }}>· {itens.length} ativo{itens.length === 1 ? '' : 's'}</span>
            </div>
            <div className="rolagem">
              <table style={{ tableLayout: 'fixed' }}>
                <thead><tr>
                  <th style={{ width: 90 }}>Ativo</th><th style={{ width: 90 }}>Cotação</th><th style={{ width: 100 }}>Preço médio</th>
                  <th style={{ width: 80 }}>Bazin</th><th style={{ width: 80 }}>Graham</th><th style={{ width: 80 }}>Gordon</th><th style={{ width: 80 }}>P/VP</th>
                  <th style={{ width: 90 }}>Teto</th><th style={{ width: 110 }}>Margem p/ teto</th><th style={{ width: 130 }}>Situação</th><th style={{ width: 100 }} />
                </tr></thead>
                <tbody>{itens.map(p => {
                  const prem = premissas.find(x => x.ticker === p.ticker)
                  const av = avaliar(prem, p.precoAtual, p.classe)
                  const val = m => {
                    const r = av.resultados.find(x => x.metodo === m)
                    if (!r) return <span className="nulo">—</span>
                    return r.ok ? fmtNum(r.comMargem) : <span className="nulo" title={r.motivo}>—</span>
                  }
                  const rot = ROTULO_SITUACAO[av.situacao]
                  return (
                    <tr key={p.ticker}>
                      <td><span className="ticker">{p.ticker}</span></td>
                      <td className={'n ' + (p.temCotacao ? '' : 'nulo')}>{fmtNum(p.precoAtual)}</td>
                      <td className="n">{fmtNum(p.precoMedio)}</td>
                      <td className="n">{val('bazin')}</td>
                      <td className="n">{val('graham')}</td>
                      <td className="n">{val('gordon')}</td>
                      <td className="n">{val('vp_teto')}</td>
                      <td className="n"><strong>{av.teto ? fmtNum(av.teto) : '—'}</strong></td>
                      <td className={'n ' + (av.desconto == null ? 'nulo' : av.desconto >= 0 ? 'pos' : 'neg')}>
                        {av.desconto == null ? '—' : fmtPct(av.desconto, 1)}
                      </td>
                      <td><span className="tag" style={{ color: rot.cor, borderColor: rot.cor }}>{rot.texto}</span></td>
                      <td><button className="btn mini vazio" onClick={() => setEditando(p)}>Premissas</button></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </div>
        ))}
      </Painel>

      {editando && <FormPremissas posicao={editando} aoFechar={() => setEditando(null)} />}
    </>
  )
}

function FormPremissas({ posicao: p, aoFechar }) {
  const { premissas, proventos, salvarPremissas, apagarPremissas, premissasDaComunidade, podeEscrever } = useDados()
  const recibo = useRecibo()
  const existente = premissas.find(x => x.ticker === p.ticker)
  const eFundo = p.classe === 'FII'
  const modelosPadraoDaClasse = MODELOS_PADRAO_POR_CLASSE[p.classe] || MODELOS_PADRAO
  const [v, setV] = useState(() => ({
    ...PADRAO,
    ...(existente || {}),
    metodos: existente?.metodos?.length ? existente.metodos : modelosPadraoDaClasse,
  }))
  const [erro, setErro] = useState(null)
  const [comunidade, setComunidade] = useState(null)

  useEffect(() => {
    let vivo = true
    premissasDaComunidade(p.ticker).then(r => { if (vivo) setComunidade(r) }).catch(() => {})
    return () => { vivo = false }
  }, [p.ticker])

  const num = { ...v, dpa: paraNumero(v.dpa), lpa: paraNumero(v.lpa), vpa: paraNumero(v.vpa) }
  const usaBazin = v.metodos.includes('bazin')
  const usaGraham = v.metodos.includes('graham')
  const usaGordon = v.metodos.includes('gordon')
  const usaVpTeto = v.metodos.includes('vp_teto')
  // para FII, a taxa exigida do Gordon não é digitada direto — é a soma da
  // taxa livre de risco (líquida de IR, se marcado) com o prêmio de risco
  const taxaExigidaEfetiva = eFundo ? taxaGordonAjustado(v) : paraNumero(v.taxa_exigida)
  const av = avaliar({ ...num, taxa_exigida: taxaExigidaEfetiva }, p.precoAtual, p.classe)
  const rot = ROTULO_SITUACAO[av.situacao]

  const campo = (k, x) => setV(s => ({ ...s, [k]: x }))
  const alternar = m => setV(s => ({
    ...s, metodos: s.metodos.includes(m) ? s.metodos.filter(x => x !== m) : [...s.metodos, m],
  }))

  function estimarDPA() {
    const d = dpaPelosProventos(proventos, p.ticker, p.qtd, 12)
    if (!d) return recibo('Não há proventos suficientes dos últimos 12 meses para estimar.', 'erro')
    campo('dpa', String(Number(d.toFixed(6))))
    recibo(`DPA estimado em ${fmtBRL(d)} por ${eFundo ? 'cota' : 'ação'}, com base nos proventos do último ano.`, 'ok')
  }

  async function salvar() {
    try {
      await salvarPremissas({
        ticker: p.ticker,
        dpa: paraNumero(v.dpa) || null, lpa: paraNumero(v.lpa) || null, vpa: paraNumero(v.vpa) || null,
        yield_exigido: paraNumero(v.yield_exigido), taxa_exigida: taxaExigidaEfetiva,
        crescimento: paraNumero(v.crescimento), margem: paraNumero(v.margem),
        pvp_maximo: paraNumero(v.pvp_maximo),
        tipo_fii: eFundo ? v.tipo_fii : null,
        taxa_livre_risco: eFundo ? paraNumero(v.taxa_livre_risco) || null : null,
        premio_risco: eFundo ? paraNumero(v.premio_risco) : null,
        ajustar_ir: eFundo ? Boolean(v.ajustar_ir) : null,
        aliquota_ir: eFundo ? paraNumero(v.aliquota_ir) : null,
        metodos: v.metodos, nota: v.nota || null,
        teto_calculado: av.teto,
        // salvar pelo formulário marca como conferido à mão, e a busca
        // automática passa a respeitar esses números
        origem: 'manual',
      })
      recibo('Premissas salvas.', 'ok')
      aoFechar()
    } catch (e) { setErro(e.message) }
  }

  return (
    <Modal titulo={`Preço teto — ${p.ticker}`} largo aoFechar={aoFechar} pe={<>
      {existente && podeEscrever && (
        <button className="btn perigo mini" style={{ marginRight: 'auto' }}
          onClick={async () => { await apagarPremissas(p.ticker); recibo('Premissas removidas.'); aoFechar() }}>
          Limpar premissas
        </button>
      )}
      <button className="btn vazio" onClick={aoFechar}>Fechar</button>
      {podeEscrever && <button className="btn verde" onClick={salvar}>Salvar</button>}
    </>}>
      <div className="duas duas-flex-260">
        <div>
          <div className="rotulo" style={{ marginBottom: 10 }}>Modelos aplicados</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            {Object.entries(MODELOS).map(([k, m]) => (
              <label key={k} className="linha-cheque">
                <input type="checkbox" checked={v.metodos.includes(k)} onChange={() => alternar(k)} />
                {m.nome}
                {m.naoRecomendadoPara?.includes(p.classe) && <span className="nulo"> (não recomendado)</span>}
              </label>
            ))}
          </div>

          {(usaBazin || usaGordon) && (
            <div className="grade">
              <label className="campo">
                <span className="rotulo">DPA</span>
                <input type="number" step="any" value={v.dpa} onChange={e => campo('dpa', e.target.value)} />
                <span className="dica">
                  Dividendo por {eFundo ? 'cota' : 'ação'}. <button className="btn mini vazio" onClick={estimarDPA} type="button">Estimar pelos meus proventos</button>
                </span>
              </label>
              {usaBazin && (
                <label className="campo"><span className="rotulo">Yield exigido (%)</span>
                  <input type="number" step="any" value={v.yield_exigido} onChange={e => campo('yield_exigido', e.target.value)} />
                  <span className="dica">Bazin. O clássico é 6%.</span></label>
              )}
              {usaGordon && !eFundo && (<>
                <label className="campo"><span className="rotulo">Taxa exigida (%)</span>
                  <input type="number" step="any" value={v.taxa_exigida} onChange={e => campo('taxa_exigida', e.target.value)} />
                  <span className="dica">Gordon. Seu retorno mínimo aceitável.</span></label>
                <label className="campo"><span className="rotulo">Crescimento (%)</span>
                  <input type="number" step="any" value={v.crescimento} onChange={e => campo('crescimento', e.target.value)} />
                  <span className="dica">Gordon. Precisa ser menor que a taxa.</span></label>
              </>)}
            </div>
          )}

          {usaGordon && eFundo && (
            <div style={{ marginBottom: 18 }}>
              <div className="rotulo" style={{ marginBottom: 8 }}>Gordon Ajustado — taxa exigida composta</div>
              <div className="grade" style={{ marginBottom: 0 }}>
                <label className="campo"><span className="rotulo">Tipo de FII</span>
                  <select value={v.tipo_fii} onChange={e => campo('tipo_fii', e.target.value)}>
                    <option value="tijolo">Tijolo</option>
                    <option value="papel">Papel, FOF ou Fiagro</option>
                  </select>
                  <span className="dica">Muda a taxa de referência ao lado.</span>
                </label>
                <label className="campo">
                  <span className="rotulo">Taxa livre (%)</span>
                  <input type="number" step="any" value={v.taxa_livre_risco} onChange={e => campo('taxa_livre_risco', e.target.value)} />
                  <span className="dica">
                    {v.tipo_fii === 'tijolo' ? 'Tesouro IPCA+ longo, taxa bruta atual.' : 'Tesouro Prefixado longo, taxa bruta atual.'}
                  </span>
                </label>
                <label className="campo"><span className="rotulo">Prêmio (%)</span>
                  <input type="number" step="any" value={v.premio_risco} onChange={e => campo('premio_risco', e.target.value)} />
                  <span className="dica">Soma à taxa livre. 2% é comum.</span></label>
                <label className="campo"><span className="rotulo">Crescimento (%)</span>
                  <input type="number" step="any" value={v.crescimento} onChange={e => campo('crescimento', e.target.value)} />
                  <span className="dica">
                    {v.tipo_fii === 'tijolo' ? 'Real — acima da inflação. 0% é conservador.' : 'Nominal do dividendo. 0% é conservador.'}
                  </span></label>
              </div>
              <label className="linha-cheque" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={v.ajustar_ir} onChange={e => campo('ajustar_ir', e.target.checked)} />
                <span>Descontar IR da taxa livre de risco —</span>
                {v.ajustar_ir && (
                  <input type="number" step="any" value={v.aliquota_ir} style={{ width: 60 }}
                    onChange={e => campo('aliquota_ir', e.target.value)} />
                )}
                <span>%</span>
              </label>
              <p style={{ fontSize: 12, color: 'var(--tinta-3)', margin: '10px 0 0', lineHeight: 1.5 }}>
                Para fundos de tijolo, usamos o Tesouro IPCA+ como referência (trabalhando em termos
                reais). Para fundos de papel, FOFs e Fiagro, usamos o Tesouro Prefixado (a inflação já
                está embutida no dividendo). Dividendo de FII não paga IR para pessoa física — por isso
                comparar com a taxa do Tesouro líquida de imposto é a comparação justa.
              </p>
              <div className="aviso info" style={{ marginTop: 10 }}>
                Taxa exigida composta: <strong>{fmtNum(taxaExigidaEfetiva, 2)}%</strong>{' '}
                ({fmtNum(v.ajustar_ir ? paraNumero(v.taxa_livre_risco) * (1 - paraNumero(v.aliquota_ir) / 100) : paraNumero(v.taxa_livre_risco), 2)}%
                líquida + {fmtNum(v.premio_risco, 2)}% de prêmio)
              </div>
            </div>
          )}

          {(usaGraham || usaVpTeto) && (
            <div className="grade">
              {usaGraham && (
                <label className="campo">
                  <span className="rotulo">LPA — lucro por ação</span>
                  <input type="number" step="any" value={v.lpa} onChange={e => campo('lpa', e.target.value)} />
                  <span className="dica">Usado só por Graham.</span>
                </label>
              )}
              <label className="campo">
                <span className="rotulo">VPA — valor patrimonial</span>
                <input type="number" step="any" value={v.vpa} onChange={e => campo('vpa', e.target.value)} />
                <span className="dica">{eFundo ? 'VP por cota do último relatório gerencial.' : 'Patrimônio líquido ÷ ações.'}</span>
              </label>
              {usaVpTeto && (
                <label className="campo"><span className="rotulo">P/VP máximo</span>
                  <input type="number" step="any" value={v.pvp_maximo} onChange={e => campo('pvp_maximo', e.target.value)} />
                  <span className="dica">{eFundo ? 'Quanto acima do patrimônio aceita pagar. 1,10 é comum.' : 'Teto por P/VP.'}</span></label>
              )}
            </div>
          )}

          <div className="grade">
            <label className="campo"><span className="rotulo">Margem de segurança (%)</span>
              <input type="number" step="any" value={v.margem} onChange={e => campo('margem', e.target.value)} />
              <span className="dica">Desconta do teto de todos os modelos.</span></label>
          </div>

          <label className="campo"><span className="rotulo">Anotação</span>
            <textarea rows={2} value={v.nota || ''} placeholder="de onde vieram os números, data do balanço…"
              onChange={e => campo('nota', e.target.value)} /></label>
          {erro && <div className="aviso erro">{erro}</div>}
        </div>

        <div>
          <div className="cartao" style={{ marginBottom: 12 }}>
            <div className="rotulo">Cotação</div>
            <div className="v">{p.temCotacao ? fmtBRL(p.precoAtual) : '—'}</div>
            <div className="p">preço médio {fmtBRL(p.precoMedio)}</div>
          </div>
          <div className="cartao" style={{ marginBottom: 12, borderColor: rot.cor }}>
            <div className="rotulo" style={{ color: rot.cor }}>{rot.texto}</div>
            <div className="v">{av.teto ? fmtBRL(av.teto) : '—'}</div>
            <div className="p">
              {av.faixa ? `faixa ${fmtNum(av.faixa.min)} – ${fmtNum(av.faixa.max)}` : 'faltam premissas'}
            </div>
          </div>

          <div className="rotulo" style={{ marginBottom: 8 }}>Modelo a modelo</div>
          <table style={{ tableLayout: 'fixed' }}>
            <tbody>{av.resultados.map(r => (
              <tr key={r.metodo}>
                <td style={{ padding: '7px 0', width: 70, whiteSpace: 'normal' }}>{r.nome}</td>
                <td className="n" style={{ padding: '7px 0', whiteSpace: 'normal', textAlign: 'left' }}>
                  {r.ok ? <strong>{fmtBRL(r.comMargem)}</strong>
                    : <span className="nulo" style={{ fontSize: 11.5 }}>{r.motivo}</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>

          {paraNumero(v.margem) > 0 && av.faixa && (
            <div className="dica" style={{ marginTop: 10 }}>
              Valores já com {fmtPctSimples(paraNumero(v.margem))} de margem descontada.
            </div>
          )}

          {comunidade && comunidade.quantidade > 0 && comunidade.menor_teto != null && (
            <div className="aviso info" style={{ marginTop: 14, fontSize: 12.5 }}>
              {comunidade.quantidade} outra{comunidade.quantidade === 1 ? '' : 's'} carteira{comunidade.quantidade === 1 ? '' : 's'} no
              gmINVEST já calculou um teto para {p.ticker} — o mais conservador: <strong>{fmtBRL(comunidade.menor_teto)}</strong>.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}


/**
 * Preenche DPA, LPA e VPA de todos os ativos elegíveis numa tacada.
 * O que veio da fonte é sempre marcado como tal, e valores digitados à mão
 * ficam intocados — quem conferiu no balanço não perde o trabalho.
 */
function BuscarFundamentos({ elegiveis }) {
  const { premissas, salvarPremissasLote, podeEscrever } = useDados()
  const recibo = useRecibo()
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState(null)

  async function buscar() {
    setOcupado(true); setResultado(null)
    try {
      const r = await buscarNoServidor(elegiveis.map(p => p.ticker), { comFundamentos: true })
      const achados = Object.entries(r.fundamentos)
      if (!achados.length)
        throw new Error(r.avisoFundamentos || 'A fonte não devolveu fundamentos desta vez.')

      const lote = [], preservados = []
      for (const [ticker, f] of achados) {
        const atual = premissas.find(x => x.ticker === ticker)
        const manual = atual && atual.origem !== 'yahoo'
        if (manual) { preservados.push(ticker); continue }
        lote.push({
          ...(atual || {}),
          ticker,
          dpa: f.dpa ?? atual?.dpa ?? null,
          lpa: f.lpa ?? atual?.lpa ?? null,
          vpa: f.vpa ?? atual?.vpa ?? null,
          yield_exigido: atual?.yield_exigido ?? 6,
          taxa_exigida: atual?.taxa_exigida ?? 10,
          crescimento: atual?.crescimento ?? 3,
          margem: atual?.margem ?? 0,
          metodos: atual?.metodos?.length ? atual.metodos
            : (MODELOS_PADRAO_POR_CLASSE[elegiveis.find(p => p.ticker === ticker)?.classe] || MODELOS_PADRAO),
          origem: 'yahoo',
          carteira_id: undefined,
        })
      }
      const n = await salvarPremissasLote(lote.map(({ carteira_id, ...x }) => x))
      setResultado({
        gravados: n, preservados,
        semRetorno: elegiveis.map(p => p.ticker).filter(t => !r.fundamentos[t]),
        aviso: r.avisoFundamentos,
      })
      recibo(n ? `${n} ativo${n === 1 ? '' : 's'} preenchido${n === 1 ? '' : 's'}.` : 'Nada novo para gravar.', n ? 'ok' : '')
    } catch (e) {
      recibo(e.message, 'erro')
      setResultado({ erro: e.message })
    } finally { setOcupado(false) }
  }

  return (
    <Painel titulo="Preencher premissas automaticamente" aoLado="dividendo, lucro e patrimônio por ação">
      <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14, maxWidth: 820 }}>
        A mesma função que busca as cotações traz também os números de balanço. É um bom ponto de
        partida, não uma verdade final: a fonte não é oficial, arredonda e às vezes atrasa. Para um
        ativo que pese na carteira, vale conferir no relatório e digitar — o que você digitar fica
        protegido das buscas seguintes.
      </p>
      <button className="btn verde" onClick={buscar} disabled={ocupado || !podeEscrever}>
        {ocupado ? 'Consultando…' : `Buscar para ${elegiveis.length} ativo${elegiveis.length === 1 ? '' : 's'}`}
      </button>

      {resultado && !resultado.erro && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {resultado.aviso && <div className="aviso atencao">{resultado.aviso}</div>}
          {resultado.preservados.length > 0 && (
            <div className="aviso info">
              Mantive o que você já tinha digitado em: {resultado.preservados.join(', ')}.
            </div>
          )}
          {resultado.semRetorno.length > 0 && (
            <div className="aviso atencao">
              Sem retorno da fonte para {resultado.semRetorno.join(', ')} — esses ficam para preenchimento
              manual. FIIs menores costumam cair aqui.
            </div>
          )}
        </div>
      )}
    </Painel>
  )
}
