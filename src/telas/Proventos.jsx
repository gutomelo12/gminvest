import { useMemo, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Modal, Confirmacao, Barras, Colunas, useRecibo } from '../comp/base'
import { fmtBRL, fmtData, fmtPctSimples, hoje, paraNumero, corClasse, inferirClasse, normalizarTicker } from '../lib/formato'
import { proventosPorMes } from '../lib/calculo'

export const TIPOS_PV = ['Dividendo', 'JCP', 'Rendimento', 'Amortização', 'Restituição', 'Juros', 'Outro']

export default function Proventos({ ir, editando, setEditando }) {
  const { proventos, calc, podeEscrever } = useDados()
  const pvs = useMemo(() => [...proventos].sort((a, b) => b.data.localeCompare(a.data)), [proventos])
  const total = pvs.reduce((s, p) => s + paraNumero(p.valor), 0)

  if (!pvs.length) return (
    <Painel>
      <Vazio>
        <p>Nenhum provento registrado. O extrato de movimentação da B3 traz dividendos, JCP e
          rendimentos — importe-o e eles entram sozinhos.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn verde" onClick={() => ir('b3')}>Importar extratos</button>
          {podeEscrever && <button className="btn vazio" onClick={() => setEditando({})}>Lançar à mão</button>}
        </div>
      </Vazio>
    </Painel>
  )

  const porAtivo = {}, porAno = {}
  pvs.forEach(p => {
    porAtivo[p.ticker] = (porAtivo[p.ticker] || 0) + paraNumero(p.valor)
    const a = p.data.slice(0, 4)
    porAno[a] = (porAno[a] || 0) + paraNumero(p.valor)
  })
  const rank = Object.entries(porAtivo).map(([t, v]) => ({ t, v })).sort((a, b) => b.v - a.v)
  const meses = proventosPorMes(proventos, 12)
  const soma12 = meses.reduce((s, m) => s + m.valor, 0)

  return (
    <>
      <Painel titulo="Proventos nos últimos 12 meses" aoLado={`${fmtBRL(soma12)} no período`}>
        <Colunas dados={meses} formatar={fmtBRL} />
      </Painel>

      <Painel titulo="De onde vêm os proventos" aoLado="acumulado por ativo">
        <div className="duas">
          <div>
            <div className="rotulo" style={{ marginBottom: 10 }}>Por ano</div>
            <Barras itens={Object.entries(porAno).sort((a, b) => b[0].localeCompare(a[0]))
              .map(([a, v]) => ({ chave: a, rotulo: <strong>{a}</strong>, direita: fmtBRL(v), valor: v, cor: 'var(--verde)' }))} />
          </div>
          <div>
            <div className="rotulo" style={{ marginBottom: 10 }}>Maiores pagadores</div>
            <Barras itens={rank.slice(0, 12).map(x => ({
              chave: x.t, rotulo: <strong>{x.t}</strong>,
              direita: `${fmtBRL(x.v)} · ${fmtPctSimples(x.v / total * 100)}`,
              valor: x.v, cor: corClasse((calc.lista.find(p => p.ticker === x.t) || {}).classe),
            }))} />
          </div>
        </div>
      </Painel>

      <ExtratoProventos pvs={pvs} total={total} podeEscrever={podeEscrever} aoEditar={setEditando} />

      {editando && <FormProvento pv={editando} aoFechar={() => setEditando(null)} />}
    </>
  )
}

/**
 * O extrato inteiro pode ter centenas de linhas e empurrar tudo para baixo.
 * Abre mostrando o ano corrente e as últimas linhas; o resto vem sob demanda.
 */
function ExtratoProventos({ pvs, total, podeEscrever, aoEditar }) {
  const anos = [...new Set(pvs.map(p => String(p.data).slice(0, 4)))].sort().reverse()
  const [ano, setAno] = useState(anos[0] || '')
  const [tudo, setTudo] = useState(false)

  const doAno = ano === 'todos' ? pvs : pvs.filter(p => String(p.data).startsWith(ano))
  const somaAno = doAno.reduce((s, p) => s + paraNumero(p.valor), 0)
  const LIMITE = 15
  const visiveis = tudo ? doAno : doAno.slice(0, LIMITE)
  const ocultos = doAno.length - visiveis.length

  return (
    <Painel corpo={false}>
      <div className="painel-cab">
        <h3>Extrato de proventos</h3>
        <div className="filtros">
          <select value={ano} onChange={e => { setAno(e.target.value); setTudo(false) }}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
            <option value="todos">Todos os anos</option>
          </select>
          <span className="rotulo">{doAno.length} crédito{doAno.length === 1 ? '' : 's'} · {fmtBRL(somaAno)}</span>
        </div>
      </div>
      <div className="rolagem">
        <table>
          <thead><tr><th>Data</th><th>Ativo</th><th>Tipo</th><th>Valor</th><th /></tr></thead>
          <tbody>{visiveis.map(p => (
            <tr key={p.id}>
              <td className="n">{fmtData(p.data)}</td>
              <td><span className="ticker">{p.ticker}</span></td>
              <td>{p.tipo}</td>
              <td className="n pos"><strong>{fmtBRL(p.valor)}</strong></td>
              <td>{podeEscrever && <button className="btn mini vazio" onClick={() => aoEditar(p)}>Editar</button>}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr>
            <td>{ano === 'todos' ? 'Total geral' : `Total de ${ano}`}</td><td /><td />
            <td className="pos">{fmtBRL(somaAno)}</td><td />
          </tr></tfoot>
        </table>
      </div>
      {ocultos > 0 && (
        <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid var(--linha-2)' }}>
          <button className="btn vazio mini" onClick={() => setTudo(true)}>
            Mostrar os outros {ocultos} crédito{ocultos === 1 ? '' : 's'}
          </button>
        </div>
      )}
      {tudo && doAno.length > LIMITE && (
        <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid var(--linha-2)' }}>
          <button className="btn vazio mini" onClick={() => setTudo(false)}>Recolher</button>
        </div>
      )}
    </Painel>
  )
}

export function FormProvento({ pv, aoFechar }) {
  const { salvarProvento, apagarProvento } = useDados()
  const recibo = useRecibo()
  const [v, setV] = useState({
    data: pv?.data || hoje(), ticker: pv?.ticker || '',
    tipo: pv?.tipo || 'Dividendo', valor: pv?.valor ?? '',
  })
  const [erro, setErro] = useState(null)
  const [confirma, setConfirma] = useState(false)
  const novo = !pv?.id

  async function salvar() {
    if (!v.data || !v.ticker || !paraNumero(v.valor)) return setErro('Preencha data, ativo e valor.')
    try {
      await salvarProvento({
        id: pv?.id, data: v.data, ticker: v.ticker, tipo: v.tipo,
        valor: paraNumero(v.valor), classe: inferirClasse(v.ticker, ''),
      })
      recibo(novo ? 'Provento lançado.' : 'Provento salvo.', 'ok')
      aoFechar()
    } catch (e) { setErro(e.message) }
  }

  return (
    <>
      <Modal titulo={novo ? 'Novo provento' : 'Editar provento'} aoFechar={aoFechar} pe={<>
        {!novo && <button className="btn perigo mini" style={{ marginRight: 'auto' }}
          onClick={() => setConfirma(true)}>Excluir</button>}
        <button className="btn vazio" onClick={aoFechar}>Cancelar</button>
        <button className="btn verde" onClick={salvar}>{novo ? 'Lançar' : 'Salvar'}</button>
      </>}>
        <div className="grade">
          <label className="campo"><span className="rotulo">Data do crédito</span>
            <input type="date" value={v.data} max={hoje()} onChange={e => setV({ ...v, data: e.target.value })} /></label>
          <label className="campo"><span className="rotulo">Ativo</span>
            <input value={v.ticker} placeholder="MXRF11" style={{ textTransform: 'uppercase' }}
              onChange={e => setV({ ...v, ticker: normalizarTicker(e.target.value) })} /></label>
        </div>
        <div className="grade">
          <label className="campo"><span className="rotulo">Tipo</span>
            <select value={v.tipo} onChange={e => setV({ ...v, tipo: e.target.value })}>
              {TIPOS_PV.map(t => <option key={t}>{t}</option>)}
            </select></label>
          <label className="campo"><span className="rotulo">Valor líquido recebido</span>
            <input type="number" step="any" value={v.valor} onChange={e => setV({ ...v, valor: e.target.value })} /></label>
        </div>
        {erro && <div className="aviso erro">{erro}</div>}
      </Modal>
      {confirma && (
        <Confirmacao titulo="Excluir provento" perigo rotulo="Excluir"
          texto={`${pv.ticker} · ${fmtData(pv.data)} · ${fmtBRL(pv.valor)}.`}
          aoFechar={() => setConfirma(false)}
          aoConfirmar={async () => { await apagarProvento(pv.id); recibo('Provento excluído.'); aoFechar() }} />
      )}
    </>
  )
}
