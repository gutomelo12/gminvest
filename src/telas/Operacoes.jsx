import { useMemo, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Modal, Confirmacao, useRecibo } from '../comp/base'
import { fmtBRL, fmtNum, fmtQtd, fmtData, hoje, semAcento, paraNumero, LISTA_CLASSES, inferirClasse } from '../lib/formato'

export const TIPOS = [
  ['compra', 'Compra'], ['venda', 'Venda'], ['bonificacao', 'Bonificação'],
  ['desdobramento', 'Desdobramento'], ['grupamento', 'Grupamento'], ['ajuste', 'Ajuste de cotas'],
]
const SEM_PRECO = ['desdobramento', 'grupamento']
const rotuloTipo = t => (TIPOS.find(x => x[0] === t) || [, t])[1]

export default function Operacoes({ ir, editando, setEditando }) {
  const { operacoes, podeEscrever } = useDados()
  const [f, setF] = useState({ texto: '', tipo: '', ano: '' })

  const ops = useMemo(() => [...operacoes].sort((a, b) =>
    b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em))), [operacoes])
  const anos = useMemo(() => [...new Set(ops.map(o => o.data.slice(0, 4)))].sort().reverse(), [ops])

  const filtradas = ops.filter(o => {
    const t = semAcento(f.texto)
    return (!t || semAcento(o.ticker).includes(t) || semAcento(o.corretora || '').includes(t))
      && (!f.tipo || o.tipo === f.tipo)
      && (!f.ano || o.data.startsWith(f.ano))
  })

  return (
    <>
      <Painel corpo={false} titulo={null} aoLado={null}>
        <div className="painel-cab">
          <div className="filtros">
            <input placeholder="Buscar ativo ou corretora" value={f.texto} style={{ width: 210 }}
              onChange={e => setF({ ...f, texto: e.target.value })} />
            <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
              <option value="">Todos os tipos</option>
              {TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <select value={f.ano} onChange={e => setF({ ...f, ano: e.target.value })}>
              <option value="">Todos os anos</option>
              {anos.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <span className="rotulo">{filtradas.length} de {ops.length}</span>
        </div>
        {filtradas.length ? (
          <div className="rolagem">
            <table>
              <thead><tr>
                <th>Data</th><th>Ativo</th><th>Tipo</th><th>Qtd.</th><th>Preço</th>
                <th>Taxas</th><th>Total</th><th>Corretora</th><th /></tr></thead>
              <tbody>{filtradas.map(o => {
                const cor = o.tipo === 'venda' ? 'var(--vermelho)' : o.tipo === 'compra' ? 'var(--azul)' : 'var(--ambar)'
                const semPreco = SEM_PRECO.includes(o.tipo)
                return (
                  <tr key={o.id}>
                    <td className="n">{fmtData(o.data)}</td>
                    <td><span className="ticker">{o.ticker}</span><span className="classe">{o.classe}</span></td>
                    <td><span className="tag" style={{ color: cor, borderColor: cor }}>{rotuloTipo(o.tipo)}</span></td>
                    <td className="n">{fmtQtd(o.quantidade)}</td>
                    <td className="n">{semPreco ? '—' : fmtNum(o.preco, 4)}</td>
                    <td className={'n ' + (paraNumero(o.taxas) ? '' : 'nulo')}>{paraNumero(o.taxas) ? fmtNum(o.taxas) : '—'}</td>
                    <td className="n">{semPreco ? '—' : fmtBRL(Math.abs(o.quantidade) * o.preco)}</td>
                    <td style={{ textAlign: 'left', fontSize: 12, color: 'var(--tinta-3)' }}>{o.corretora || '—'}</td>
                    <td>{podeEscrever && <button className="btn mini vazio" onClick={() => setEditando(o)}>Editar</button>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        ) : (
          <Vazio>
            <p>{ops.length ? 'Nenhum lançamento com esses filtros.'
              : 'O livro está vazio. Importe o extrato da B3 ou lance a primeira operação.'}</p>
            {!ops.length && <button className="btn verde" onClick={() => ir('b3')}>Importar extrato da B3</button>}
          </Vazio>
        )}
      </Painel>
      {editando && <FormOperacao op={editando} aoFechar={() => setEditando(null)} />}
    </>
  )
}

export function FormOperacao({ op, aoFechar }) {
  const { salvarOperacao, apagarOperacao } = useDados()
  const recibo = useRecibo()
  const [v, setV] = useState({
    data: op?.data || hoje(), tipo: op?.tipo || 'compra',
    ticker: op?.ticker || '', classe: op?.classe || 'Ação',
    quantidade: op?.quantidade ?? '', preco: op?.preco ?? '', taxas: op?.taxas ?? '',
    corretora: op?.corretora || '',
  })
  const [erro, setErro] = useState(null)
  const [confirma, setConfirma] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const novo = !op?.id
  const fator = SEM_PRECO.includes(v.tipo)
  const q = paraNumero(v.quantidade), pr = paraNumero(v.preco), tx = paraNumero(v.taxas)

  const campo = (k, valor) => {
    const prox = { ...v, [k]: valor }
    if (k === 'ticker') {
      prox.ticker = valor.toUpperCase().replace(/\s/g, '')
      if (novo) prox.classe = inferirClasse(prox.ticker, '')
    }
    setV(prox)
  }

  async function salvar() {
    setErro(null)
    if (!v.data) return setErro('Informe a data.')
    if (!v.ticker) return setErro('Informe o ativo.')
    if (q === 0) return setErro('A quantidade não pode ser zero.')
    setOcupado(true)
    try {
      await salvarOperacao({
        id: op?.id, data: v.data, tipo: v.tipo, ticker: v.ticker, classe: v.classe,
        quantidade: v.tipo === 'ajuste' ? q : Math.abs(q),
        preco: fator ? 0 : pr, taxas: fator ? 0 : tx, corretora: v.corretora || null,
      })
      recibo(novo ? 'Operação lançada.' : 'Operação salva.', 'ok')
      aoFechar()
    } catch (e) { setErro(e.message) } finally { setOcupado(false) }
  }

  return (
    <>
      <Modal titulo={novo ? 'Nova operação' : 'Editar operação'} aoFechar={aoFechar} pe={<>
        {!novo && <button className="btn perigo mini" style={{ marginRight: 'auto' }}
          onClick={() => setConfirma(true)}>Excluir</button>}
        <button className="btn vazio" onClick={aoFechar}>Cancelar</button>
        <button className="btn verde" onClick={salvar} disabled={ocupado}>{novo ? 'Lançar' : 'Salvar'}</button>
      </>}>
        <div className="grade">
          <label className="campo"><span className="rotulo">Data</span>
            <input type="date" value={v.data} max={hoje()} onChange={e => campo('data', e.target.value)} /></label>
          <label className="campo"><span className="rotulo">Tipo</span>
            <select value={v.tipo} onChange={e => campo('tipo', e.target.value)}>
              {TIPOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select></label>
        </div>
        <div className="grade">
          <label className="campo"><span className="rotulo">Ativo</span>
            <input value={v.ticker} placeholder="PETR4" style={{ textTransform: 'uppercase' }}
              onChange={e => campo('ticker', e.target.value)} /></label>
          <label className="campo"><span className="rotulo">Classe</span>
            <select value={v.classe} onChange={e => campo('classe', e.target.value)}>
              {LISTA_CLASSES.map(k => <option key={k}>{k}</option>)}
            </select></label>
        </div>
        <div className="grade">
          <label className="campo"><span className="rotulo">
            {fator ? (v.tipo === 'desdobramento' ? 'Fator (2 = 1 vira 2)' : 'Fator (10 = 10 viram 1)') : 'Quantidade'}
          </span>
            <input type="number" step="any" value={v.quantidade} onChange={e => campo('quantidade', e.target.value)} /></label>
          {!fator && <label className="campo"><span className="rotulo">Preço unitário</span>
            <input type="number" step="any" min="0" value={v.preco} onChange={e => campo('preco', e.target.value)} /></label>}
          {!fator && <label className="campo"><span className="rotulo">Taxas</span>
            <input type="number" step="any" min="0" value={v.taxas} placeholder="0,00"
              onChange={e => campo('taxas', e.target.value)} /></label>}
        </div>
        <label className="campo"><span className="rotulo">Corretora</span>
          <input value={v.corretora} placeholder="opcional" onChange={e => campo('corretora', e.target.value)} /></label>

        <div className="aviso info">
          {fator
            ? `A quantidade em carteira é ${v.tipo === 'desdobramento' ? 'multiplicada' : 'dividida'} pelo fator. O custo total não muda.`
            : v.tipo === 'ajuste'
              ? 'Entrada ou saída de cotas sem contrapartida de caixa. Use quantidade negativa para saída.'
              : <>Financeiro: <strong>{fmtBRL(Math.abs(q) * pr + (v.tipo === 'venda' ? -tx : tx))}</strong>
                {tx > 0 && ` (${fmtBRL(Math.abs(q) * pr)} ${v.tipo === 'venda' ? '−' : '+'} ${fmtBRL(tx)} de taxas)`}</>}
        </div>
        {erro && <div className="aviso erro" style={{ marginTop: 10 }}>{erro}</div>}
      </Modal>
      {confirma && (
        <Confirmacao titulo="Excluir operação" perigo rotulo="Excluir"
          texto={`${op.ticker} · ${fmtData(op.data)} · ${rotuloTipo(op.tipo)}. Isso recalcula o preço médio do ativo.`}
          aoFechar={() => setConfirma(false)}
          aoConfirmar={async () => { await apagarOperacao(op.id); recibo('Operação excluída.'); aoFechar() }} />
      )}
    </>
  )
}
