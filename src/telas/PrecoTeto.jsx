import { useEffect, useState } from 'react'
import { buscarNoServidor } from '../lib/cotacoes'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Modal, useRecibo } from '../comp/base'
import { avaliar, MODELOS, ROTULO_SITUACAO, dpaPelosProventos } from '../lib/teto'
import { fmtBRL, fmtNum, fmtPctSimples, fmtPct, paraNumero, CLASSES_TETO } from '../lib/formato'

const PADRAO = {
  dpa: '', lpa: '', vpa: '',
  yield_exigido: 6, taxa_exigida: 10, crescimento: 3, margem: 0,
  metodos: ['bazin', 'graham', 'gordon'], nota: '',
}

export default function PrecoTeto({ focoTicker, limparFoco }) {
  const { calc, premissas } = useDados()
  const [editando, setEditando] = useState(null)

  const elegiveis = calc.abertas.filter(p => CLASSES_TETO.includes(p.classe))

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
      <Painel titulo="Como funciona" aoLado="três modelos, uma faixa">
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
        <div className="rolagem">
          <table>
            <thead><tr>
              <th>Ativo</th><th>Cotação</th><th>Preço médio</th>
              <th>Bazin</th><th>Graham</th><th>Gordon</th>
              <th>Teto</th><th>Margem p/ teto</th><th>Situação</th><th />
            </tr></thead>
            <tbody>{elegiveis.map(p => {
              const prem = premissas.find(x => x.ticker === p.ticker)
              const av = avaliar(prem, p.precoAtual)
              const val = m => {
                const r = av.resultados.find(x => x.metodo === m)
                if (!r) return <span className="nulo">—</span>
                return r.ok ? fmtNum(r.comMargem) : <span className="nulo" title={r.motivo}>—</span>
              }
              const rot = ROTULO_SITUACAO[av.situacao]
              return (
                <tr key={p.ticker}>
                  <td><span className="ticker">{p.ticker}</span><span className="classe">{p.classe}</span></td>
                  <td className={'n ' + (p.temCotacao ? '' : 'nulo')}>{fmtNum(p.precoAtual)}</td>
                  <td className="n">{fmtNum(p.precoMedio)}</td>
                  <td className="n">{val('bazin')}</td>
                  <td className="n">{val('graham')}</td>
                  <td className="n">{val('gordon')}</td>
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
      </Painel>

      {editando && <FormPremissas posicao={editando} aoFechar={() => setEditando(null)} />}
    </>
  )
}

function FormPremissas({ posicao: p, aoFechar }) {
  const { premissas, proventos, salvarPremissas, apagarPremissas, podeEscrever } = useDados()
  const recibo = useRecibo()
  const existente = premissas.find(x => x.ticker === p.ticker)
  const [v, setV] = useState(() => ({
    ...PADRAO,
    ...(existente || {}),
    metodos: existente?.metodos?.length ? existente.metodos : PADRAO.metodos,
  }))
  const [erro, setErro] = useState(null)

  const num = { ...v, dpa: paraNumero(v.dpa), lpa: paraNumero(v.lpa), vpa: paraNumero(v.vpa) }
  const av = avaliar(num, p.precoAtual)
  const rot = ROTULO_SITUACAO[av.situacao]
  const eFundo = p.classe === 'FII'

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
        yield_exigido: paraNumero(v.yield_exigido), taxa_exigida: paraNumero(v.taxa_exigida),
        crescimento: paraNumero(v.crescimento), margem: paraNumero(v.margem),
        metodos: v.metodos, nota: v.nota || null,
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
      <div className="duas" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,300px)' }}>
        <div>
          <div className="rotulo" style={{ marginBottom: 10 }}>Modelos aplicados</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            {Object.entries(MODELOS).map(([k, m]) => (
              <label key={k} className="linha-cheque">
                <input type="checkbox" checked={v.metodos.includes(k)} onChange={() => alternar(k)} />
                {m.nome}
              </label>
            ))}
          </div>

          <div className="grade">
            <label className="campo">
              <span className="rotulo">DPA — dividendo por {eFundo ? 'cota' : 'ação'}</span>
              <input type="number" step="any" value={v.dpa} onChange={e => campo('dpa', e.target.value)} />
              <span className="dica">
                {eFundo ? 'Some os rendimentos dos últimos 12 meses por cota.' : 'Média dos últimos 5 anos costuma alisar bem.'}{' '}
                <button className="btn mini vazio" style={{ marginTop: 5 }} onClick={estimarDPA} type="button">
                  Estimar pelos meus proventos
                </button>
              </span>
            </label>
            <label className="campo">
              <span className="rotulo">LPA — lucro por {eFundo ? 'cota' : 'ação'}</span>
              <input type="number" step="any" value={v.lpa} onChange={e => campo('lpa', e.target.value)} />
              <span className="dica">Usado só por Graham.</span>
            </label>
            <label className="campo">
              <span className="rotulo">VPA — valor patrimonial</span>
              <input type="number" step="any" value={v.vpa} onChange={e => campo('vpa', e.target.value)} />
              <span className="dica">{eFundo ? 'O VP por cota do último relatório gerencial.' : 'Patrimônio líquido dividido pelas ações.'}</span>
            </label>
          </div>

          <div className="grade">
            <label className="campo"><span className="rotulo">Yield exigido (%)</span>
              <input type="number" step="any" value={v.yield_exigido} onChange={e => campo('yield_exigido', e.target.value)} />
              <span className="dica">Bazin. O clássico é 6%.</span></label>
            <label className="campo"><span className="rotulo">Taxa exigida (%)</span>
              <input type="number" step="any" value={v.taxa_exigida} onChange={e => campo('taxa_exigida', e.target.value)} />
              <span className="dica">Gordon. Seu retorno mínimo aceitável.</span></label>
            <label className="campo"><span className="rotulo">Crescimento (%)</span>
              <input type="number" step="any" value={v.crescimento} onChange={e => campo('crescimento', e.target.value)} />
              <span className="dica">Gordon. Precisa ser menor que a taxa.</span></label>
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
          <table>
            <tbody>{av.resultados.map(r => (
              <tr key={r.metodo}>
                <td style={{ padding: '7px 0' }}>{r.nome}</td>
                <td className="n" style={{ padding: '7px 0' }}>
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
          metodos: atual?.metodos?.length ? atual.metodos : ['bazin', 'graham', 'gordon'],
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
