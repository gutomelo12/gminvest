import { useEffect, useState } from 'react'
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

      {semPremissa > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 20 }}>
          <strong>{semPremissa} ativo{semPremissa === 1 ? '' : 's'} sem premissas.</strong>{' '}
          DPA, LPA e VPA vêm do balanço da empresa ou do relatório gerencial do fundo. Você preenche
          uma vez e fica salvo — só volta aqui quando sair balanço novo.
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
