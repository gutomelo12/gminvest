import { useRef, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Modal, useRecibo } from '../comp/base'
import { lerPlanilha, extrair } from '../lib/b3'
import { extrairTextoDoPdf, parseNomad, digitalNomad } from '../lib/nomad'
import { fmtBRL, fmtMoeda, fmtNum, fmtQtd, fmtData, paraNumero, hoje } from '../lib/formato'

export default function ImportarB3({ ir }) {
  const [aba, setAba] = useState('b3')
  return (
    <>
      <div className="abas">
        <button className={aba === 'b3' ? 'ativo' : ''} onClick={() => setAba('b3')}>B3 (Excel)</button>
        <button className={aba === 'nomad' ? 'ativo' : ''} onClick={() => setAba('nomad')}>Nomad (PDF)</button>
      </div>
      {aba === 'b3' ? <TabB3 ir={ir} /> : <TabNomad ir={ir} />}
    </>
  )
}

function TabB3({ ir }) {
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

      <Painel titulo="Como trazer os dados da B3" aoLado="três minutos, uma vez por mês">
        <div style={{ fontSize: 13, lineHeight: 1.65 }}>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <li>Entre em <a href="https://www.investidor.b3.com.br" target="_blank" rel="noopener noreferrer">investidor.b3.com.br</a> com CPF e senha.</li>
            <li>Em <strong>Extratos → Negociação</strong>, escolha o período e baixe em Excel. É daqui que saem as compras e vendas.</li>
            <li>Em <strong>Extratos → Movimentação</strong>, baixe o mesmo período. É daqui que saem os dividendos, JCP, rendimentos e desdobros.</li>
            <li>Para conferir, vá em <strong>Minha carteira → Ir para posição</strong> — é outro menu, não fica
              junto dos extratos. Escolha a data e use o <strong>botão amarelo no canto inferior direito</strong>
              para baixar em Excel. Dependendo da versão do site, o caminho aparece como
              <em>Minhas Carteiras → Investimentos → Posição</em>.</li>
            <li>Solte os arquivos acima. Você revisa tudo antes de gravar.</li>
          </ol>
          <div className="aviso atencao" style={{ marginTop: 14 }}>
            <strong>Os dois relatórios descrevem os mesmos negócios.</strong> A Movimentação registra cada
            compra como “Transferência - Liquidação”, na data em que o dinheiro saiu — dois dias depois da
            data do negócio. Se as duas versões entrarem, a carteira dobra de tamanho. Por isso, quando
            você solta os dois arquivos juntos, as compras e vendas vindas da Movimentação chegam
            desmarcadas e só os proventos vêm de lá.
          </div>
          <div className="aviso info" style={{ marginTop: 10 }}>
            O período máximo por download costuma ser de 12 meses. Para uma carteira antiga, baixe ano a
            ano. Solte os arquivos de todos os anos de uma vez, ou um por um — tanto faz.
            <br /><br />
            <strong>Reimportar um arquivo já processado é seguro.</strong> Cada linha carrega uma
            impressão digital: o que já está gravado é reconhecido e ignorado, e entra só o que faltava.
            Uma ordem executada em partes conta como várias linhas, e todas entram.
          </div>
        </div>
      </Painel>

      {revisao && (
        <Revisao {...revisao} temOps={operacoes.length > 0} podeEscrever={podeEscrever}
          aoFechar={() => setRevisao(null)}
          aoGravar={async (sel, aplicarPrecos, saldoInicial) => {
            const ops = sel.filter(x => x.destino === 'operacao').map(x => ({
              data: x.data, tipo: x.tipo, ticker: x.ticker, classe: x.classe,
              quantidade: x.quantidade, preco: x.preco, taxas: 0,
              corretora: x.corretora || null, nota: x.nota || null,
              fonte: x.fonte || null, digital: x._d,
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
                // preço zero não é cotação: é papel que a B3 não precifica,
                // como recibo de subscrição. Gravar zero apagaria o valor do ativo.
                Object.entries(revisao.precos).forEach(([t, p]) => { if (p.preco > 0) mapa[t] = p.preco })
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

/**
 * Compara a quantidade que o app calculou com a que está no relatório de
 * posição da B3. É o único jeito de saber se a importação ficou correta —
 * o patrimônio pode bater por acaso, a quantidade ativo a ativo não.
 */
function Conferencia({ precos }) {
  const { calc, operacoes, inserirLote, podeEscrever } = useDados()
  const recibo = useRecibo()
  const [escolhas, setEscolhas] = useState({})
  const [gravando, setGravando] = useState(false)

  /**
   * A B3 é a verdade sobre o que você tem hoje. A carteira é a verdade sobre
   * como você chegou lá. Quando divergem, é a carteira que está incompleta.
   */
  const linhas = []
  Object.entries(precos).forEach(([ticker, b3]) => {
    const pos = calc.abertas.find(p => p.ticker === ticker)
    const noApp = pos ? pos.qtd : 0
    const naB3 = b3.quantidade || 0
    const dif = noApp - naB3
    if (Math.abs(dif) > 1e-6) linhas.push({ ticker, noApp, naB3, dif, preco: b3.preco, classe: b3.classe })
  })
  calc.abertas.forEach(p => {
    if (precos[p.ticker]) return
    linhas.push({ ticker: p.ticker, noApp: p.qtd, naB3: 0, dif: p.qtd, preco: p.precoAtual, classe: p.classe })
  })
  linhas.sort((a, b) => Math.abs(b.dif * b.preco) - Math.abs(a.dif * a.preco))

  if (!linhas.length) return (
    <div className="aviso ok">
      <strong>Tudo confere.</strong> As quantidades do app batem com a custódia da B3.
    </div>
  )

  const primeiraData = ticker => {
    const doAtivo = operacoes.filter(o => o.ticker === ticker).map(o => o.data).sort()
    const todas = operacoes.map(o => o.data).sort()
    const base = doAtivo[0] || todas[0] || hoje()
    const d = new Date(base + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  const marcadas = linhas.filter(l => escolhas[l.ticker])

  async function aplicar() {
    setGravando(true)
    const novas = marcadas.map(l => {
      if (l.dif < 0) {
        // falta na carteira: entra um lote de abertura pelo preço da posição
        return {
          data: primeiraData(l.ticker), tipo: 'compra', ticker: l.ticker, classe: l.classe,
          quantidade: Math.abs(l.dif), preco: l.preco, taxas: 0,
          nota: 'lote de abertura criado pela conferência',
          digital: `conf|abertura|${l.ticker}|${Math.abs(l.dif)}`,
        }
      }
      // sobra na carteira: baixa sem inventar preço de venda
      return {
        data: hoje(), tipo: 'ajuste', ticker: l.ticker, classe: l.classe,
        quantidade: -l.dif, preco: 0, taxas: 0,
        nota: 'baixa por conferência com a custódia',
        digital: `conf|baixa|${l.ticker}|${l.dif}`,
      }
    })
    try {
      const n = await inserirLote('operacoes', novas)
      setEscolhas({})
      recibo(`${n} ajuste${n === 1 ? '' : 's'} gravado${n === 1 ? '' : 's'}.`, 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setGravando(false) }
  }

  const faltando = linhas.filter(l => l.dif < 0).length
  const sobrando = linhas.filter(l => l.dif > 0).length

  return (
    <>
      <div className="aviso erro" style={{ marginBottom: 14 }}>
        <strong>{linhas.length} ativo{linhas.length === 1 ? '' : 's'} diverge{linhas.length === 1 ? '' : 'm'} da custódia.</strong>
        {faltando > 0 && <> {faltando} com quantidade <em>menor</em> no app — compra anterior ao período que
          você importou, ou arquivo que ficou de fora.</>}
        {sobrando > 0 && <> {sobrando} com quantidade <em>maior</em> — a venda não entrou na carteira.</>}
      </div>

      <div className="rolagem" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
        <table>
          <thead><tr>
            <th style={{ width: 40 }}>Corrigir</th><th>Ativo</th><th>No app</th><th>Na B3</th>
            <th>Diferença</th><th>O que será feito</th>
          </tr></thead>
          <tbody>{linhas.map(l => (
            <tr key={l.ticker}>
              <td><input type="checkbox" checked={Boolean(escolhas[l.ticker])}
                onChange={e => setEscolhas(x => ({ ...x, [l.ticker]: e.target.checked }))}
                style={{ accentColor: 'var(--verde)' }} /></td>
              <td><span className="ticker">{l.ticker}</span><span className="classe">{l.classe}</span></td>
              <td className="n">{fmtQtd(l.noApp)}</td>
              <td className="n">{fmtQtd(l.naB3)}</td>
              <td className={'n ' + (l.dif > 0 ? 'neg' : 'pos')}>
                {(l.dif > 0 ? '+' : '') + fmtQtd(l.dif)}
              </td>
              <td style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--tinta-3)' }}>
                {l.dif < 0
                  ? `compra de ${fmtQtd(Math.abs(l.dif))} a ${fmtBRL(l.preco)}, datada de ${fmtData(primeiraData(l.ticker))}`
                  : `baixa de ${fmtQtd(l.dif)} cotas, sem resultado apurado`}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="aviso atencao" style={{ marginBottom: 14, lineHeight: 1.65 }}>
        <strong>Isto é remendo, não conserto.</strong> O lote de abertura entra pelo preço de hoje, então o
        preço médio do ativo fica aproximado — corrija depois em Operações se souber o valor real da compra.
        A baixa remove as cotas sem apurar lucro, porque o app não sabe por quanto você vendeu; se o
        resultado dessa venda importa para o seu imposto, lance a venda à mão em vez de marcar aqui.
        <br /><br />
        Antes de remendar, vale tentar a origem: baixe da B3 o período que faltou e importe.
      </div>

      <button className="btn verde" disabled={gravando || !podeEscrever || !marcadas.length} onClick={aplicar}>
        {gravando ? 'Gravando…' : `Corrigir ${marcadas.length} ativo${marcadas.length === 1 ? '' : 's'}`}
      </button>
    </>
  )
}

function Revisao({ itens, precos, blocos, falhas, aoFechar, aoGravar, podeEscrever }) {
  const ops = itens.filter(x => x.destino === 'operacao' && !x.liquidacao)
  const pvs = itens.filter(x => x.destino === 'provento')
  const ign = itens.filter(x => x.destino === 'ignorado')
  const nPrecos = Object.keys(precos).length

  // As compras e vendas do extrato de Movimentação são as mesmas da Negociação,
  // vistas na liquidação, dois dias depois. Ficam sempre desmarcadas — marcá-las
  // junto dobra a carteira. Só valem se você não tiver a Negociação do período,
  // inclusive quando os relatórios são importados em levas separadas.
  const liquidacoes = itens.filter(x => x.liquidacao)
  const idsSobrepostos = new Set(liquidacoes.map(x => x._i))

  const [sel, setSel] = useState(() => new Set(
    itens.filter(x => x.destino !== 'ignorado' && !idsSobrepostos.has(x._i)).map(x => x._i)))
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
    arr.forEach(x => {
      if (valor && idsSobrepostos.has(x._i)) return   // sobreposta continua fora
      valor ? n.add(x._i) : n.delete(x._i)
    })
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
      <td style={{ textAlign: 'left', fontSize: 11, color: 'var(--tinta-3)' }}>
        {idsSobrepostos.has(x._i)
          ? <span style={{ color: 'var(--ambar)' }}>já veio da Negociação</span>
          : (x.nota || x.origem || '')}
      </td>
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

      {liquidacoes.length > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 14 }}>
          <strong>{liquidacoes.length} compra{liquidacoes.length === 1 ? '' : 's'} e venda{liquidacoes.length === 1 ? '' : 's'} da Movimentação ficaram desmarcadas.</strong>{' '}
          São os mesmos negócios que já vieram da Negociação, registrados na data da liquidação em vez da
          data do negócio. Marcar as duas versões dobraria a carteira. Os proventos da Movimentação seguem
          marcados normalmente.
        </div>
      )}
      <div className="aviso info" style={{ marginBottom: 14 }}>
        Cada linha carrega uma impressão digital gravada no banco. Reimportar o mesmo período não
        duplica nada — o banco recusa as linhas idênticas.
      </div>

      <div className="abas">
        <button className={aba === 'ops' ? 'ativo' : ''} onClick={() => setAba('ops')}>Operações ({ops.length})</button>
        <button className={aba === 'pvs' ? 'ativo' : ''} onClick={() => setAba('pvs')}>Proventos ({pvs.length})</button>
        {liquidacoes.length > 0 && (
          <button className={aba === 'liq' ? 'ativo' : ''} onClick={() => setAba('liq')}>
            Liquidações ({liquidacoes.length})
          </button>
        )}
        {nPrecos > 0 && (
          <button className={aba === 'conf' ? 'ativo' : ''} onClick={() => setAba('conf')}>Conferência</button>
        )}
        <button className={aba === 'ign' ? 'ativo' : ''} onClick={() => setAba('ign')}>Ignoradas ({ign.length})</button>
        <button className={aba === 'src' ? 'ativo' : ''} onClick={() => setAba('src')}>Origem</button>
      </div>

      {aba === 'ops' && <Tabela arr={ops} vazio="Nenhuma compra ou venda neste arquivo." />}
      {aba === 'pvs' && <Tabela arr={pvs} vazio="Nenhum provento aqui. Ele vem no extrato de movimentação." />}
      {aba === 'liq' && (
        <>
          <div className="aviso atencao" style={{ marginBottom: 14 }}>
            <strong>Estas linhas já estão no relatório de Negociação.</strong> O extrato de Movimentação
            mostra a liquidação do negócio, que acontece dois dias depois — mesma compra, outra data.
            Por isso vêm desmarcadas: marcá-las junto com a Negociação dobra a sua carteira.
            <br /><br />
            Só marque se você <em>não</em> tiver o relatório de Negociação daquele período.
          </div>
          <Tabela arr={liquidacoes} vazio="Nenhuma." />
        </>
      )}
      {aba === 'conf' && <Conferencia precos={precos} />}
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
            Aplicar os {Object.values(precos).filter(p => p.preco > 0).length} preços do relatório de posição às cotações
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

/* ================================================================
   NOMAD — nota de corretagem em PDF
   O PDF.js lê o texto do arquivo inteiro no navegador, sem mandar o
   arquivo pra lugar nenhum. Cada linha "You Bought"/"You Sold" vira uma
   operação; o Trade# de cada negócio garante que reimportar a mesma
   nota nunca duplica.
   ================================================================ */
function TabNomad({ ir }) {
  const { inserirLote, podeEscrever } = useDados()
  const recibo = useRecibo()
  const arq = useRef(null)
  const [sobre, setSobre] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [revisao, setRevisao] = useState(null)

  async function processar(arquivos) {
    setLendo(true)
    const todos = [], falhas = []
    for (const f of arquivos) {
      try {
        const linhas = await extrairTextoDoPdf(f)
        const itens = parseNomad(linhas)
        if (!itens.length) falhas.push(f.name)
        itens.forEach((x, i) => { x._i = todos.length + i; x._d = digitalNomad(x); x.arquivo = f.name })
        todos.push(...itens)
      } catch (e) { falhas.push(f.name) }
    }
    setLendo(false)
    if (!todos.length) {
      recibo('Nenhuma negociação reconhecida no PDF. É uma nota de corretagem da Nomad, no formato de texto (não escaneada)?', 'erro')
      return
    }
    setRevisao({ itens: todos, falhas })
  }

  return (
    <>
      <Painel>
        <div className={'solta' + (sobre ? ' sobre' : '')} tabIndex={0} role="button"
          onClick={() => arq.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arq.current?.click() } }}
          onDragEnter={e => { e.preventDefault(); setSobre(true) }}
          onDragOver={e => { e.preventDefault(); setSobre(true) }}
          onDragLeave={e => { e.preventDefault(); setSobre(false) }}
          onDrop={e => { e.preventDefault(); setSobre(false); processar([...(e.dataTransfer.files || [])]) }}>
          <strong>{lendo ? 'Lendo o PDF…' : 'Solte as notas aqui'}</strong>
          <span>ou clique para escolher · .pdf · vários de uma vez</span>
        </div>
        <input type="file" ref={arq} accept=".pdf" multiple hidden
          onChange={e => { if (e.target.files.length) processar([...e.target.files]); e.target.value = '' }} />
        {!podeEscrever && (
          <div className="aviso atencao" style={{ marginTop: 14 }}>
            Você tem acesso de leitura nesta carteira. Dá para conferir a importação, mas não gravar.
          </div>
        )}
      </Painel>

      {revisao && (
        <RevisaoNomad {...revisao} podeEscrever={podeEscrever}
          aoFechar={() => setRevisao(null)}
          aoGravar={async sel => {
            const linhas = sel.map(x => ({
              data: x.data, tipo: x.tipo, ticker: x.ticker, classe: x.classe,
              quantidade: x.quantidade, preco: x.preco, taxas: x.taxas,
              corretora: 'NOMAD', nota: x.descricao || null, digital: x._d,
            }))
            try {
              const n = await inserirLote('operacoes', linhas)
              recibo(n ? `${n} operaç${n === 1 ? 'ão' : 'ões'} gravada${n === 1 ? '' : 's'}.` : 'Nada novo para gravar — já estava tudo importado.', n ? 'ok' : '')
              setRevisao(null)
              if (n) ir('resumo')
            } catch (e) { recibo('Falhou ao gravar: ' + e.message, 'erro') }
          }} />
      )}

      <Painel titulo="Como trazer os dados da Nomad" aoLado="um PDF por nota, ou vários de uma vez">
        <div style={{ fontSize: 13, lineHeight: 1.65 }}>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <li>No app da Nomad, clique em <strong>Perfil</strong>.</li>
            <li>Acesse <strong>Documentos</strong>.</li>
            <li>Acesse <strong>Investimentos</strong>.</li>
            <li>Acesse <strong>Investimentos</strong> para agosto/25 em diante, ou{' '}
              <strong>Ações, ETFs e REITs</strong> para períodos antes de agosto/25 — a Nomad renomeou a
              seção no meio do caminho.</li>
            <li>Acesse <strong>Notas de Corretagem</strong>.</li>
            <li>Escolha o mês e faça o download.</li>
            <li>Solte os arquivos acima. Você revisa tudo antes de gravar.</li>
          </ol>
          <p style={{ marginTop: 14 }}>
            Todo ativo importado daqui entra como <strong>ETFs Intern.</strong>, já que é exatamente o
            que a Nomad negocia — ETFs listados nos EUA, cotados em dólar.
          </p>
          <div className="aviso atencao" style={{ marginTop: 14 }}>
            Testado contra o formato usado nas notas da Apex Clearing (que processa as negociações da
            Nomad) em agosto de 2026. Se a Nomad mudar o layout da nota no futuro, ou se você usar uma
            corretora diferente que também limpa pela Apex, a leitura pode não reconhecer as linhas —
            nesse caso, nada é importado errado, a nota simplesmente aparece como não reconhecida.
          </div>
        </div>
      </Painel>
    </>
  )
}

function RevisaoNomad({ itens, falhas, aoFechar, aoGravar, podeEscrever }) {
  const [sel, setSel] = useState(() => new Set(itens.map(x => x._i)))
  const [gravando, setGravando] = useState(false)

  const alternar = i => setSel(s => {
    const n = new Set(s)
    n.has(i) ? n.delete(i) : n.add(i)
    return n
  })

  const total = itens.filter(x => sel.has(x._i))
    .reduce((s, x) => s + (x.tipo === 'venda' ? -1 : 1) * x.quantidade * x.preco, 0)

  return (
    <Modal titulo="Revisar antes de gravar" largo aoFechar={aoFechar} pe={<>
      <span className="rotulo" style={{ marginRight: 'auto', alignSelf: 'center' }}>
        {sel.size} de {itens.length} selecionada{itens.length === 1 ? '' : 's'}
      </span>
      <button className="btn vazio" onClick={aoFechar}>Cancelar</button>
      <button className="btn verde" disabled={gravando || !podeEscrever || !sel.size}
        onClick={async () => { setGravando(true); await aoGravar(itens.filter(x => sel.has(x._i))); setGravando(false) }}>
        {gravando ? 'Gravando…' : 'Gravar selecionadas'}
      </button>
    </>}>
      {falhas.length > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 14 }}>
          Não reconhecido em: {falhas.join(', ')}
        </div>
      )}
      <div className="aviso info" style={{ marginBottom: 14 }}>
        Cada linha carrega o número da negociação (Trade#) da própria nota como impressão digital —
        reimportar a mesma nota, ou uma nota que se sobreponha a outra já importada, não duplica nada.
      </div>
      <div className="rolagem" style={{ maxHeight: 380, overflowY: 'auto' }}>
        <table>
          <thead><tr>
            <th style={{ width: 34 }} /><th>Data</th><th>Tipo</th><th>Ativo</th>
            <th>Quant.</th><th>Preço</th><th>Total</th><th>Descrição</th>
          </tr></thead>
          <tbody>{itens.map(x => (
            <tr key={x._i}>
              <td><input type="checkbox" checked={sel.has(x._i)} onChange={() => alternar(x._i)}
                style={{ accentColor: 'var(--verde)' }} /></td>
              <td className="n">{fmtData(x.data)}</td>
              <td><span className="tag" style={{
                color: x.tipo === 'venda' ? 'var(--vermelho)' : 'var(--azul)',
                borderColor: x.tipo === 'venda' ? 'var(--vermelho)' : 'var(--azul)' }}>
                {x.tipo === 'venda' ? 'Venda' : 'Compra'}</span></td>
              <td><span className="ticker">{x.ticker}</span><span className="classe">{x.classe}</span></td>
              <td className="n">{fmtQtd(x.quantidade)}</td>
              <td className="n">{fmtMoeda(x.preco, 'USD')}</td>
              <td className="n">{fmtMoeda(x.quantidade * x.preco, 'USD')}</td>
              <td style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--tinta-3)' }}>{x.descricao}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={6}>Total das selecionadas</td><td colSpan={2} className="n">{fmtMoeda(total, 'USD')}</td></tr></tfoot>
        </table>
      </div>
    </Modal>
  )
}
