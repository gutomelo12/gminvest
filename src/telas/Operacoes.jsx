import { useMemo, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Modal, Confirmacao, useRecibo } from '../comp/base'
import {
  fmtBRL, fmtMoeda, fmtNum, fmtQtd, fmtData, hoje, semAcento, paraNumero,
  LISTA_CLASSES, inferirClasse, normalizarTicker, gerarTickerRendaFixa,
  SUBTIPOS_RF, INDEXADORES_RF, FORMAS_RF, CLASSES_MOEDA_ESTRANGEIRA,
} from '../lib/formato'

export const TIPOS = [
  ['compra', 'Compra'], ['venda', 'Venda'], ['bonificacao', 'Bonificação'],
  ['desdobramento', 'Desdobramento'], ['grupamento', 'Grupamento'], ['ajuste', 'Ajuste de cotas'],
]
const SEM_PRECO = ['desdobramento', 'grupamento']
const rotuloTipo = t => (TIPOS.find(x => x[0] === t) || [, t])[1]

export default function Operacoes({ ir, editando, setEditando }) {
  const { operacoes, mapaDetalhesRF, podeEscrever } = useDados()
  const [f, setF] = useState({ texto: '', tipo: '', ano: '' })
  const [pagina, setPagina] = useState(0)
  const POR_PAGINA = 30

  const ops = useMemo(() => [...operacoes].sort((a, b) =>
    b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em))), [operacoes])
  const anos = useMemo(() => [...new Set(ops.map(o => o.data.slice(0, 4)))].sort().reverse(), [ops])

  const filtradas = ops.filter(o => {
    const t = semAcento(f.texto)
    return (!t || semAcento(o.ticker).includes(t) || semAcento(o.corretora || '').includes(t))
      && (!f.tipo || o.tipo === f.tipo)
      && (!f.ano || o.data.startsWith(f.ano))
  })
  // se o filtro encolheu a lista e a página guardada não existe mais,
  // volta pra última válida sozinho, sem precisar de um efeito à parte
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const paginadas = filtradas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)
  const mudarFiltro = novo => { setF(f2 => ({ ...f2, ...novo })); setPagina(0) }

  return (
    <>
      <Painel corpo={false} titulo={null} aoLado={null}>
        <div className="painel-cab">
          <div className="filtros">
            <input placeholder="Buscar ativo ou corretora" value={f.texto} style={{ width: 210 }}
              onChange={e => mudarFiltro({ texto: e.target.value })} />
            <select value={f.tipo} onChange={e => mudarFiltro({ tipo: e.target.value })}>
              <option value="">Todos os tipos</option>
              {TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <select value={f.ano} onChange={e => mudarFiltro({ ano: e.target.value })}>
              <option value="">Todos os anos</option>
              {anos.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <span className="rotulo">{filtradas.length} de {ops.length}</span>
        </div>
        {filtradas.length ? (
          <>
            <div className="rolagem">
              <table>
                <thead><tr>
                  <th>Data</th><th>Ativo</th><th>Tipo</th><th>Qtd.</th><th>Preço</th>
                  <th>Taxas</th><th>Total</th><th style={{ textAlign: 'center' }}>Corretora</th><th /></tr></thead>
                <tbody>{paginadas.map(o => {
                  const cor = o.tipo === 'venda' ? 'var(--vermelho)' : o.tipo === 'compra' ? 'var(--azul)' : 'var(--ambar)'
                  const semPreco = SEM_PRECO.includes(o.tipo)
                  const det = mapaDetalhesRF[o.id]
                  return (
                    <tr key={o.id}>
                      <td className="n">{fmtData(o.data)}</td>
                      <td>
                        <span className="ticker">{o.ticker}</span>
                        <span className="classe">{det ? `${det.subtipo} · ${det.emissor}` : o.classe}</span>
                      </td>
                      <td><span className="tag" style={{ color: cor, borderColor: cor }}>{rotuloTipo(o.tipo)}</span></td>
                      <td className="n">{fmtQtd(o.quantidade)}</td>
                      <td className="n">{semPreco ? '—' : fmtNum(o.preco, 4)}</td>
                      <td className={'n ' + (paraNumero(o.taxas) ? '' : 'nulo')}>{paraNumero(o.taxas) ? fmtNum(o.taxas) : '—'}</td>
                      <td className="n">{semPreco ? '—' : fmtBRL(Math.abs(o.quantidade) * o.preco)}</td>
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--tinta-3)' }}>{o.corretora || '—'}</td>
                      <td>{podeEscrever && <button className="btn mini vazio" onClick={() => setEditando(o)}>Editar</button>}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
            {totalPaginas > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '14px 16px' }}>
                <button className="btn mini vazio" disabled={paginaAtual === 0} onClick={() => setPagina(paginaAtual - 1)}>
                  ‹ Anterior
                </button>
                <span className="rotulo">Página {paginaAtual + 1} de {totalPaginas}</span>
                <button className="btn mini vazio" disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina(paginaAtual + 1)}>
                  Próxima ›
                </button>
              </div>
            )}
          </>
        ) : (
          <Vazio>
            <p>{ops.length ? 'Nenhum lançamento com esses filtros.'
              : 'A carteira está vazia. Importe o extrato da B3 ou lance a primeira operação.'}</p>
            {!ops.length && <button className="btn verde" onClick={() => ir('b3')}>Importar extratos</button>}
          </Vazio>
        )}
      </Painel>
      {editando && <FormOperacao op={editando} aoFechar={() => setEditando(null)} />}
    </>
  )
}

export function FormOperacao({ op, aoFechar }) {
  const { salvarOperacao, apagarOperacao, calc, mapaDetalhesRF } = useDados()
  const recibo = useRecibo()
  const detExistente = op?.id ? mapaDetalhesRF[op.id] : null
  const novo = !op?.id

  const [v, setV] = useState({
    data: op?.data || hoje(), tipo: op?.tipo || 'compra',
    ticker: op?.ticker || '', classe: op?.classe || 'Ação',
    quantidade: op?.quantidade ?? '', preco: op?.preco ?? '', taxas: op?.taxas ?? '',
    corretora: op?.corretora || '',
  })
  const [rf, setRf] = useState({
    emissor: detExistente?.emissor || '',
    subtipo: detExistente?.subtipo || SUBTIPOS_RF[0],
    indexador: detExistente?.indexador || INDEXADORES_RF[0],
    taxa: detExistente?.taxa != null ? String(detExistente.taxa).replace('.', ',') : '',
    forma: detExistente?.forma || FORMAS_RF[0],
    liquidezDiaria: detExistente?.liquidez_diaria ?? false,
    vencimento: detExistente?.vencimento || '',
    // quantidade de renda fixa é sempre 1 por construção — o preço já É o valor aplicado
    valor: !novo && op.classe === 'Renda Fixa' ? String(op.preco).replace('.', ',') : '',
  })

  const [erro, setErro] = useState(null)
  const [confirma, setConfirma] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  // enquanto a pessoa não mexe no seletor de classe, digitar o ativo pode
  // sugerir uma classe automaticamente. No instante em que ela escolhe a
  // classe na mão, a sugestão para de mexer — sem isso, cada letra digitada
  // no ticker sobrescrevia a escolha manual (ex.: VOO nunca bate com nenhum
  // padrão da B3, então virava "Outro" a cada tecla).
  const [classeTocada, setClasseTocada] = useState(false)
  const fator = SEM_PRECO.includes(v.tipo)
  const ehRendaFixaCompra = v.classe === 'Renda Fixa' && v.tipo === 'compra'
  const q = paraNumero(v.quantidade), pr = paraNumero(v.preco), tx = paraNumero(v.taxas)
  const moedaForm = CLASSES_MOEDA_ESTRANGEIRA.includes(v.classe) ? 'USD' : 'BRL'

  const campo = (k, valor) => {
    const prox = { ...v, [k]: valor }
    if (k === 'ticker') {
      prox.ticker = normalizarTicker(valor)
      if (novo && !classeTocada) prox.classe = inferirClasse(prox.ticker, '')
    }
    if (k === 'classe') setClasseTocada(true)
    if (k === 'corretora') prox.corretora = valor.toUpperCase()
    setV(prox)
  }
  const campoRf = (k, valor) => setRf(r => ({ ...r, [k]: valor }))

  const rfExistentes = calc.abertas.filter(p => p.classe === 'Renda Fixa')
  const rotuloTaxa = rf.indexador === 'Prefixado' ? 'Taxa contratada' : `Taxa do ${rf.indexador}`

  async function salvar() {
    setErro(null)
    if (!v.data) return setErro('Informe a data.')

    if (ehRendaFixaCompra) {
      if (!rf.emissor.trim()) return setErro('Informe o emissor.')
      const valorAplicado = paraNumero(rf.valor)
      if (valorAplicado <= 0) return setErro('Informe o valor aplicado.')
      if (rf.vencimento && rf.vencimento <= v.data)
        return setErro('O vencimento precisa ser depois da data da transação.')
      const ticker = gerarTickerRendaFixa(rf.emissor, rf.subtipo, rf.vencimento)
      setOcupado(true)
      try {
        await salvarOperacao({
          id: op?.id, data: v.data, tipo: 'compra', ticker, classe: 'Renda Fixa',
          quantidade: 1, preco: valorAplicado, taxas: 0, corretora: v.corretora || null,
        }, {
          emissor: rf.emissor.trim(), subtipo: rf.subtipo, indexador: rf.indexador,
          taxa: paraNumero(rf.taxa) || null, forma: rf.forma,
          liquidez_diaria: !!rf.liquidezDiaria, vencimento: rf.vencimento || null,
        })
        recibo(novo ? 'Aplicação lançada.' : 'Aplicação salva.', 'ok')
        aoFechar()
      } catch (e) { setErro(e.message) } finally { setOcupado(false) }
      return
    }

    if (!v.ticker) return setErro('Informe o ativo.')
    if (q === 0) return setErro('A quantidade não pode ser zero.')

    // resgate de renda fixa: a pessoa digita o valor total que recebeu de
    // volta, não um preço por unidade — a quantidade "1" da aplicação não
    // tem um significado próprio para dividir por ela. Convertemos aqui
    // para a fração da posição que esse valor representa, usando o preço
    // médio atual, e assim o resto do sistema (custo, realizado) continua
    // funcionando exatamente como para qualquer outra venda.
    if (v.tipo === 'venda' && v.classe === 'Renda Fixa') {
      const posicao = rfExistentes.find(p => p.ticker === v.ticker)
      if (!posicao) return setErro('Escolha o título que está sendo resgatado.')
      if (posicao.precoMedio <= 0) return setErro('Não foi possível calcular o preço médio deste título.')
      const fracao = pr / posicao.precoMedio
      if (fracao > posicao.qtd + 1e-9) return setErro('O valor resgatado é maior do que a posição atual.')
      setOcupado(true)
      try {
        await salvarOperacao({
          id: op?.id, data: v.data, tipo: 'venda', ticker: v.ticker, classe: 'Renda Fixa',
          quantidade: fracao, preco: posicao.precoMedio, taxas: 0, corretora: v.corretora || null,
        }, null)
        recibo(novo ? 'Resgate lançado.' : 'Resgate salvo.', 'ok')
        aoFechar()
      } catch (e) { setErro(e.message) } finally { setOcupado(false) }
      return
    }

    setOcupado(true)
    try {
      await salvarOperacao({
        id: op?.id, data: v.data, tipo: v.tipo, ticker: v.ticker, classe: v.classe,
        quantidade: v.tipo === 'ajuste' ? q : Math.abs(q),
        preco: fator ? 0 : pr, taxas: fator ? 0 : tx, corretora: v.corretora || null,
      }, null)
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

        <label className="campo"><span className="rotulo">Tipo de ativo</span>
          <select value={v.classe} onChange={e => campo('classe', e.target.value)}>
            {LISTA_CLASSES.map(k => <option key={k}>{k}</option>)}
          </select></label>

        {ehRendaFixaCompra ? (
          <>
            <div className="grade">
              <label className="campo"><span className="rotulo">Emissor</span>
                <input value={rf.emissor} placeholder="ex.: Banco Inter"
                  onChange={e => campoRf('emissor', e.target.value)} /></label>
              <label className="campo"><span className="rotulo">Tipo de título</span>
                <select value={rf.subtipo} onChange={e => campoRf('subtipo', e.target.value)}>
                  {SUBTIPOS_RF.map(s => <option key={s}>{s}</option>)}
                </select></label>
            </div>
            <div className="grade">
              <label className="campo"><span className="rotulo">Indexador</span>
                <select value={rf.indexador} onChange={e => campoRf('indexador', e.target.value)}>
                  {INDEXADORES_RF.map(i => <option key={i}>{i}</option>)}
                </select></label>
              <label className="campo"><span className="rotulo">{rotuloTaxa}</span>
                <input type="number" step="any" min="0" value={rf.taxa} placeholder="0,00"
                  onChange={e => campoRf('taxa', e.target.value)} /></label>
            </div>
            <div className="grade">
              <label className="campo"><span className="rotulo">Forma <span style={{ fontWeight: 400 }}>(opcional)</span></span>
                <select value={rf.forma} onChange={e => campoRf('forma', e.target.value)}>
                  {FORMAS_RF.map(f => <option key={f}>{f}</option>)}
                </select></label>
              <label className="campo"><span className="rotulo">Valor aplicado</span>
                <input type="number" step="any" min="0" value={rf.valor} placeholder="0,00"
                  onChange={e => campoRf('valor', e.target.value)} /></label>
            </div>
            <label className="linha-cheque" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={rf.liquidezDiaria}
                onChange={e => campoRf('liquidezDiaria', e.target.checked)} />
              Liquidez diária
            </label>
            <label className="campo"><span className="rotulo">Data de vencimento <span style={{ fontWeight: 400 }}>(opcional)</span></span>
              <input type="date" value={rf.vencimento} min={v.data}
                onChange={e => campoRf('vencimento', e.target.value)} />
              <span className="dica">Deixe em branco para algo sem prazo, como uma caixinha de liquidez diária.</span>
            </label>

            <div className="aviso info">
              Valor total: <strong>{fmtBRL(paraNumero(rf.valor))}</strong>
              {rf.taxa && ` · ${rf.indexador === 'Prefixado'
                ? `${rf.taxa}% ao ano`
                : `${rf.taxa}% do ${rf.indexador}`}`}
            </div>
          </>
        ) : (
          <>
            <div className="grade">
              <label className="campo"><span className="rotulo">Ativo</span>
                {v.tipo === 'venda' && v.classe === 'Renda Fixa' && rfExistentes.length > 0 ? (
                  <select value={v.ticker} onChange={e => campo('ticker', e.target.value)}>
                    <option value="">Escolha o título</option>
                    {rfExistentes.map(p => <option key={p.ticker} value={p.ticker}>{p.ticker}</option>)}
                  </select>
                ) : (
                  <input value={v.ticker} placeholder="PETR4" style={{ textTransform: 'uppercase' }}
                    onChange={e => campo('ticker', e.target.value)} />
                )}
              </label>
            </div>
            <div className="grade">
              {!(v.tipo === 'venda' && v.classe === 'Renda Fixa') && (
                <label className="campo"><span className="rotulo">
                  {fator ? (v.tipo === 'desdobramento' ? 'Fator (2 = 1 vira 2)' : 'Fator (10 = 10 viram 1)') : 'Quantidade'}
                </span>
                  <input type="number" step="any" value={v.quantidade} onChange={e => campo('quantidade', e.target.value)} /></label>
              )}
              {!fator && <label className="campo"><span className="rotulo">
                {v.tipo === 'venda' && v.classe === 'Renda Fixa' ? 'Valor resgatado' : 'Preço unitário'}
                {moedaForm === 'USD' && ' (US$)'}
              </span>
                <input type="number" step="any" min="0" value={v.preco} onChange={e => campo('preco', e.target.value)} /></label>}
              {!fator && v.classe !== 'Renda Fixa' && <label className="campo"><span className="rotulo">
                Taxas{moedaForm === 'USD' && ' (US$)'}
              </span>
                <input type="number" step="any" min="0" value={v.taxas} placeholder="0,00"
                  onChange={e => campo('taxas', e.target.value)} /></label>}
            </div>
            <label className="campo"><span className="rotulo">Corretora</span>
              <input value={v.corretora} placeholder="opcional" style={{ textTransform: 'uppercase' }}
                onChange={e => campo('corretora', e.target.value)} /></label>

            <div className="aviso info">
              {fator
                ? `A quantidade em carteira é ${v.tipo === 'desdobramento' ? 'multiplicada' : 'dividida'} pelo fator. O custo total não muda.`
                : v.tipo === 'ajuste'
                  ? 'Entrada ou saída de cotas sem contrapartida de caixa. Use quantidade negativa para saída.'
                  : v.tipo === 'venda' && v.classe === 'Renda Fixa'
                    ? <>Valor resgatado: <strong>{fmtBRL(pr)}</strong></>
                    : <>Financeiro: <strong>{fmtMoeda(Math.abs(q) * pr + (v.tipo === 'venda' ? -tx : tx), moedaForm)}</strong>
                      {tx > 0 && ` (${fmtMoeda(Math.abs(q) * pr, moedaForm)} ${v.tipo === 'venda' ? '−' : '+'} ${fmtMoeda(tx, moedaForm)} de taxas)`}</>}
            </div>
          </>
        )}
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
