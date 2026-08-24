import { useRef, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Modal, useRecibo } from '../comp/base'
import { lerPlanilha, extrair } from '../lib/b3'
import { fmtBRL, fmtNum, fmtQtd, fmtData, paraNumero, hoje } from '../lib/formato'

export default function ImportarB3({ ir }) {
  const { inserirLote, salvarCotacoes, operacoes, podeEscrever } = useDados()
  const recibo = useRecibo()
  const arq = useRef(null)
  const [sobre, setSobre] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [revisao, setRevisao] = useState(null)

  async function processar(arquivos) {
    setLendo(true)
    const blocos = [], falhas = []
    for (const f of arquivos) {
      try {
        const bs = lerPlanilha(new Uint8Array(await f.arrayBuffer()))
        if (!bs.length) falhas.push(f.name)
        bs.forEach(b => { b.arquivo = f.name; blocos.push(b) })
      } catch { falhas.push(f.name) }
    }
    setLendo(false)
    if (!blocos.length) {
      recibo('Nenhum extrato reconhecido nos arquivos.', 'erro')
      return
    }
    const { itens, precos } = extrair(blocos)
    setRevisao({ itens, precos, blocos, falhas })
  }

  return (
    <>
      <Painel titulo="Como trazer os dados da B3" aoLado="três minutos, uma vez por mês">
        <div style={{ fontSize: 13, lineHeight: 1.65 }}>
          <p style={{ marginBottom: 12 }}>
            A B3 tem APIs de posição, movimentação e negociação, mas o acesso é vendido por licença a
            fintechs e instituições financeiras — <strong>não há credencial para pessoa física</strong>.
            O caminho aberto a você é a exportação dos relatórios, que traz exatamente os mesmos campos.
          </p>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <li>Entre em <a href="https://www.investidor.b3.com.br" target="_blank" rel="noopener noreferrer">investidor.b3.com.br</a> com CPF e senha.</li>
            <li>Em <strong>Extratos → Negociação</strong>, escolha o período e baixe em Excel. Traz todas as compras e vendas.</li>
            <li>Em <strong>Extratos → Movimentação</strong>, baixe o mesmo período. Traz dividendos, JCP, rendimentos, desdobros e transferências.</li>
            <li>Em <strong>Posição</strong>, baixe o relatório atual. Serve para preencher os preços de renda fixa e Tesouro.</li>
            <li>Solte os arquivos abaixo. Você revisa tudo antes de gravar.</li>
          </ol>
          <div className="aviso info" style={{ marginTop: 14 }}>
            O período máximo por download costuma ser de 12 meses. Para uma carteira antiga, baixe ano a
            ano e importe um de cada vez — linhas repetidas são detectadas pelo banco e não entram duas vezes.
          </div>
        </div>
      </Painel>

      <Painel>
        <div className={'solta' + (sobre ? ' sobre' : '')} tabIndex={0} role="button"
          onClick={() => arq.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arq.current?.click() } }}
          onDragEnter={e => { e.preventDefault(); setSobre(true) }}
          onDragOver={e => { e.preventDefault(); setSobre(true) }}
          onDragLeave={e => { e.preventDefault(); setSobre(false) }}
          onDrop={e => { e.preventDefault(); setSobre(false); processar([...(e.dataTransfer.files || [])]) }}>
          <strong>{lendo ? 'Lendo…' : 'Solte os arquivos aqui'}</strong>
          <span>ou clique para escolher · .xlsx, .xls e .csv · vários de uma vez</span>
        </div>
        <input type="file" ref={arq} accept=".xlsx,.xls,.csv" multiple hidden
          onChange={e => { if (e.target.files.length) processar([...e.target.files]); e.target.value = '' }} />
        {!podeEscrever && (
          <div className="aviso atencao" style={{ marginTop: 14 }}>
            Você tem acesso de leitura nesta carteira. Dá para conferir a importação, mas não gravar.
          </div>
        )}
      </Painel>

      {revisao && (
        <Revisao {...revisao} temOps={operacoes.length > 0} podeEscrever={podeEscrever}
          aoFechar={() => setRevisao(null)}
          aoGravar={async (sel, aplicarPrecos, saldoInicial) => {
            const ops = sel.filter(x => x.destino === 'operacao').map(x => ({
              data: x.data, tipo: x.tipo, ticker: x.ticker, classe: x.classe,
              quantidade: x.quantidade, preco: x.preco, taxas: 0,
              corretora: x.corretora || null, nota: x.nota || null, digital: x._d,
            }))
            const pvs = sel.filter(x => x.destino === 'provento').map(x => ({
              data: x.data, ticker: x.ticker, classe: x.classe, tipo: x.tipo,
              valor: paraNumero(x.valor), digital: x._d,
            }))
            let nOp = 0, nPv = 0, nPr = 0, nSi = 0
            try {
              if (saldoInicial) {
                const jaTem = new Set([...operacoes.map(o => o.ticker), ...ops.map(o => o.ticker)])
                Object.entries(revisao.precos).forEach(([t, p]) => {
                  if (!jaTem.has(t) && p.quantidade > 0) {
                    ops.push({
                      data: hoje(), tipo: 'compra', ticker: t, classe: p.classe,
                      quantidade: p.quantidade, preco: p.preco, taxas: 0,
                      corretora: null, nota: 'saldo inicial', digital: `si|${t}|${p.quantidade}`,
                    })
                    nSi++
                  }
                })
              }
              nOp = await inserirLote('operacoes', ops)
              nPv = await inserirLote('proventos', pvs)
              if (aplicarPrecos) {
                const mapa = {}
                Object.entries(revisao.precos).forEach(([t, p]) => { mapa[t] = p.preco })
                nPr = Object.keys(mapa).length
                if (nPr) await salvarCotacoes(mapa, 'b3-posicao')
              }
              const partes = []
              if (nOp) partes.push(`${nOp - nSi} operações`)
              if (nSi) partes.push(`${nSi} saldos iniciais`)
              if (nPv) partes.push(`${nPv} proventos`)
              if (nPr) partes.push(`${nPr} preços`)
              recibo(partes.length ? 'Gravado: ' + partes.join(', ') + '.' : 'Nada novo para gravar.',
                partes.length ? 'ok' : '')
              setRevisao(null)
              if (partes.length) ir('resumo')
            } catch (e) { recibo('Falhou ao gravar: ' + e.message, 'erro') }
          }} />
      )}
    </>
  )
}

function Revisao({ itens, precos, blocos, falhas, aoFechar, aoGravar, podeEscrever }) {
  const ops = itens.filter(x => x.destino === 'operacao')
  const pvs = itens.filter(x => x.destino === 'provento')
  const ign = itens.filter(x => x.destino === 'ignorado')
  const nPrecos = Object.keys(precos).length

  const [sel, setSel] = useState(() => new Set(itens.filter(x => x.destino !== 'ignorado').map(x => x._i)))
  const [aba, setAba] = useState('ops')
  const [aplicarPrecos, setAplicarPrecos] = useState(true)
  const [saldoInicial, setSaldoInicial] = useState(false)
  const [gravando, setGravando] = useState(false)

  const alternar = i => setSel(s => {
    const n = new Set(s)
    n.has(i) ? n.delete(i) : n.add(i)
    return n
  })
  const marcarTodos = (arr, valor) => setSel(s => {
    const n = new Set(s)
    arr.forEach(x => valor ? n.add(x._i) : n.delete(x._i))
    return n
  })

  const Linha = ({ x }) => (
    <tr>
      <td><input type="checkbox" checked={sel.has(x._i)} onChange={() => alternar(x._i)}
        style={{ accentColor: 'var(--verde)' }} /></td>
      <td className="n">{fmtData(x.data)}</td>
      <td><span className="ticker">{x.ticker}</span><span className="classe">{x.classe}</span></td>
      <td>{x.tipo}</td>
      <td className="n">{x.destino === 'provento' ? '—' : fmtQtd(x.quantidade)}</td>
      <td className="n">{x.destino === 'provento' ? '—' : fmtNum(x.preco, 4)}</td>
      <td className="n">{x.destino === 'provento'
        ? <span className="pos">{fmtBRL(x.valor)}</span>
        : fmtBRL(Math.abs(paraNumero(x.quantidade)) * paraNumero(x.preco))}</td>
      <td style={{ textAlign: 'left', fontSize: 11, color: 'var(--tinta-3)' }}>{x.nota || x.origem || ''}</td>
    </tr>
  )

  const Tabela = ({ arr, vazio }) => arr.length ? (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <button className="btn mini vazio" onClick={() => marcarTodos(arr, true)}>Marcar todos</button>
        <button className="btn mini vazio" onClick={() => marcarTodos(arr, false)}>Desmarcar todos</button>
      </div>
      <div className="rolagem" style={{ maxHeight: 330, overflowY: 'auto' }}>
        <table>
          <thead><tr>
            <th style={{ width: 34 }} /><th>Data</th><th>Ativo</th><th>Tipo</th>
            <th>Qtd.</th><th>Preço</th><th>Valor</th><th>Nota</th>
          </tr></thead>
          <tbody>{arr.map(x => <Linha key={x._i} x={x} />)}</tbody>
        </table>
      </div>
    </>
  ) : <div className="vazio-estado" style={{ padding: 26 }}><p>{vazio}</p></div>

  return (
    <Modal titulo="Revisar antes de gravar" largo aoFechar={aoFechar} pe={<>
      <span className="rotulo" style={{ marginRight: 'auto', alignSelf: 'center' }}>
        {sel.size} lançamento{sel.size === 1 ? '' : 's'} selecionado{sel.size === 1 ? '' : 's'}
      </span>
      <button className="btn vazio" onClick={aoFechar}>Cancelar</button>
      <button className="btn verde" disabled={gravando || !podeEscrever}
        onClick={async () => {
          setGravando(true)
          await aoGravar(itens.filter(x => sel.has(x._i)), aplicarPrecos && nPrecos > 0, saldoInicial)
          setGravando(false)
        }}>{gravando ? 'Gravando…' : 'Gravar selecionados'}</button>
    </>}>
      <div className="cartoes" style={{ marginBottom: 16 }}>
        <div className="cartao"><div className="rotulo">Operações</div><div className="v">{ops.length}</div></div>
        <div className="cartao"><div className="rotulo">Proventos</div><div className="v">{pvs.length}</div></div>
        <div className="cartao"><div className="rotulo">Preços de posição</div><div className="v">{nPrecos}</div></div>
        <div className="cartao"><div className="rotulo">Não reconhecidas</div><div className="v">{ign.length}</div>
          <div className="p">ficam de fora</div></div>
      </div>

      {falhas.length > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 14 }}>
          Sem extrato reconhecível em: {falhas.join(', ')}
        </div>
      )}

      <div className="aviso info" style={{ marginBottom: 14 }}>
        Cada linha carrega uma impressão digital gravada no banco. Se você importar o mesmo período de
        novo, o banco recusa as repetidas sozinho — pode marcar tudo sem medo.
      </div>

      <div className="abas">
        <button className={aba === 'ops' ? 'ativo' : ''} onClick={() => setAba('ops')}>Operações ({ops.length})</button>
        <button className={aba === 'pvs' ? 'ativo' : ''} onClick={() => setAba('pvs')}>Proventos ({pvs.length})</button>
        <button className={aba === 'ign' ? 'ativo' : ''} onClick={() => setAba('ign')}>Ignoradas ({ign.length})</button>
        <button className={aba === 'src' ? 'ativo' : ''} onClick={() => setAba('src')}>Origem</button>
      </div>

      {aba === 'ops' && <Tabela arr={ops} vazio="Nenhuma compra ou venda neste arquivo." />}
      {aba === 'pvs' && <Tabela arr={pvs} vazio="Nenhum provento aqui. Ele vem no extrato de movimentação." />}
      {aba === 'ign' && (ign.length ? (
        <>
          <div className="rolagem" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Data</th><th>Ativo</th><th>Linha do extrato</th><th>Qtd.</th><th>Valor</th></tr></thead>
              <tbody>{ign.map(x => (
                <tr key={x._i}>
                  <td className="n">{fmtData(x.data)}</td><td>{x.ticker}</td>
                  <td style={{ textAlign: 'left' }}>{x.motivo}</td>
                  <td className="n">{fmtQtd(x.quantidade)}</td><td className="n">{fmtBRL(x.valor)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="aviso atencao" style={{ marginTop: 12 }}>
            Essas linhas não viram lançamento sozinhas — em geral são subscrições, empréstimos ou
            atualizações informativas, que dependem do seu julgamento. Lance à mão o que fizer sentido.
          </div>
        </>
      ) : <div className="vazio-estado" style={{ padding: 26 }}><p>Todas as linhas foram reconhecidas.</p></div>)}
      {aba === 'src' && (
        <div className="aviso info" style={{ lineHeight: 1.8 }}>
          {blocos.map((b, i) => <div key={i}>{b.arquivo} → {b.aba} ({b.tipo})</div>)}
        </div>
      )}

      {nPrecos > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="linha-cheque">
            <input type="checkbox" checked={aplicarPrecos} onChange={e => setAplicarPrecos(e.target.checked)} />
            Aplicar os {nPrecos} preços do relatório de posição às cotações
          </label>
          <label className="linha-cheque">
            <input type="checkbox" checked={saldoInicial} onChange={e => setSaldoInicial(e.target.checked)} />
            Criar saldo inicial para ativos que aparecem na posição mas não têm nenhuma operação registrada
          </label>
        </div>
      )}
    </Modal>
  )
}
