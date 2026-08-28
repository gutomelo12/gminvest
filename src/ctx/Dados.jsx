import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '../lib/supabase'
import { useSessao } from './Sessao'
import { calcular } from '../lib/calculo'
import { buscarNoServidor } from '../lib/cotacoes'
import { eFracionario, normalizarTicker, inferirClasse, paraNumero, CLASSES_COM_COTACAO } from '../lib/formato'

const Ctx = createContext(null)
export const useDados = () => useContext(Ctx)

const CHAVE_ULTIMA = 'gminvest.carteira'

export function ProvedorDados({ children }) {
  const { usuario } = useSessao()
  const [carteiras, setCarteiras] = useState([])
  const [carteiraId, setCarteiraId] = useState(() => {
    try { return localStorage.getItem(CHAVE_ULTIMA) } catch { return null }
  })
  const [conteudo, setConteudo] = useState({
    operacoes: [], proventos: [], cotacoes: [], alvos: [], premissas: [],
    classificacao: [], historico: [], segmentos: [], reserva: null, detalhesRF: [], coresClasse: [],
  })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [statusAuto, setStatusAuto] = useState('ocioso')   // ocioso | buscando | ok | erro

  /* --- lista de carteiras a que a pessoa tem acesso --- */
  const recarregarCarteiras = useCallback(async () => {
    if (!usuario) { setCarteiras([]); return [] }
    // a política de segurança de "acessos" deixa ver a linha de qualquer
    // pessoa que também acesse a mesma carteira (por causa da tela "Quem
    // acessa esta carteira", que precisa listar todo mundo) — sem este
    // filtro, a linha de acesso da OUTRA pessoa também virava uma entrada
    // na SUA lista de carteiras, fazendo a mesma carteira aparecer em
    // dobro assim que ela passava a ser compartilhada.
    const { data, error } = await sb
      .from('acessos')
      .select('papel, carteira:carteiras(id, nome, cor, criada_por, criada_em)')
      .eq('usuario_id', usuario.id)
      .order('criado_em', { ascending: true })
    if (error) { setErro(error.message); return [] }
    let lista = (data || [])
      .filter(a => a.carteira)
      .map(a => ({ ...a.carteira, papel: a.papel }))

    // carteira de outra pessoa pode ter o mesmo nome da sua — sem saber de
    // quem é, duas entradas iguais na lista ficam impossíveis de distinguir
    const idsDonos = [...new Set(lista.filter(c => c.papel !== 'dono').map(c => c.criada_por).filter(Boolean))]
    if (idsDonos.length) {
      const { data: perfis } = await sb.from('perfis').select('id, email, nome').in('id', idsDonos)
      const mapaPerfis = Object.fromEntries((perfis || []).map(p => [p.id, p]))
      lista = lista.map(c => c.papel !== 'dono' ? { ...c, dono: mapaPerfis[c.criada_por] || null } : c)
    }
    setCarteiras(lista)
    return lista
  }, [usuario])

  useEffect(() => { recarregarCarteiras() }, [recarregarCarteiras])

  // se a carteira guardada sumiu, escolhe a primeira disponível
  useEffect(() => {
    if (!carteiras.length) return
    if (!carteiraId || !carteiras.some(c => c.id === carteiraId)) trocarCarteira(carteiras[0].id)
  }, [carteiras])

  function trocarCarteira(id) {
    setCarteiraId(id)
    try { localStorage.setItem(CHAVE_ULTIMA, id) } catch { /* ignora */ }
  }

  /* --- conteúdo da carteira selecionada --- */
  // guarda qual carteira já teve a primeira carga concluída, para não
  // bloquear a tela toda de novo só porque uma ação qualquer salvou algo
  // e pediu os dados atualizados — só a primeira vez precisa do "Carregando…"
  const carregouUmaVez = useRef(null)

  const recarregar = useCallback(async () => {
    if (!carteiraId) {
      setConteudo({
        operacoes: [], proventos: [], cotacoes: [], alvos: [], premissas: [],
        classificacao: [], historico: [], segmentos: [], reserva: null, detalhesRF: [], coresClasse: [],
      })
      setCarregando(false); return
    }
    const primeiraCarga = carregouUmaVez.current !== carteiraId
    if (primeiraCarga) setCarregando(true)
    setErro(null)
    const eq = t => sb.from(t).select('*').eq('carteira_id', carteiraId)
    const [ops, pvs, cots, alvs, prems, clas, hist, segs, res, cores] = await Promise.all([
      eq('operacoes'), eq('proventos'), eq('cotacoes'), eq('alocacao_alvo'), eq('premissas_teto'),
      eq('classificacao'), eq('patrimonio_historico').order('data'), eq('segmentos'),
      eq('reserva_emergencia').maybeSingle(), eq('cores_classe'),
    ])
    const idsOperacoes = (ops.data || []).map(o => o.id)
    const detRF = idsOperacoes.length
      ? await sb.from('detalhes_renda_fixa').select('*').in('operacao_id', idsOperacoes)
      : { data: [] }
    const falha = [ops, pvs, cots, alvs, prems, clas, hist, segs, res, detRF, cores].find(r => r.error)
    if (falha) setErro(falha.error.message)
    setConteudo({
      operacoes: ops.data || [],
      proventos: pvs.data || [],
      cotacoes: cots.data || [],
      alvos: alvs.data || [],
      premissas: prems.data || [],
      classificacao: clas.data || [],
      historico: hist.data || [],
      segmentos: segs.data || [],
      reserva: res.data || null,
      detalhesRF: detRF.data || [],
      coresClasse: cores.data || [],
    })
    carregouUmaVez.current = carteiraId
    if (primeiraCarga) setCarregando(false)
  }, [carteiraId])

  useEffect(() => { recarregar() }, [recarregar])

  const carteira = carteiras.find(c => c.id === carteiraId) || null
  const podeEscrever = carteira && carteira.papel !== 'leitura'
  const eDono = carteira && carteira.papel === 'dono'

  const mapaCotacoes = useMemo(() => {
    const m = {}
    conteudo.cotacoes.forEach(c => { m[c.ticker] = c })
    return m
  }, [conteudo.cotacoes])

  /**
   * Taxa de câmbio, guardada como uma cotação comum sob o ticker sintético
   * "USDBRL" — reaproveita a mesma tabela e o mesmo botão de buscar preços,
   * em vez de criar uma tabela só para isso.
   */
  const taxasCambio = useMemo(() => ({
    USD: paraNumero(mapaCotacoes['USDBRL']?.preco) || null,
  }), [mapaCotacoes])

  /** Classes definidas à mão, por ativo. Vencem qualquer dedução automática. */
  const mapaClasses = useMemo(() => {
    const m = {}
    conteudo.classificacao.forEach(c => { m[c.ticker] = c.classe })
    return m
  }, [conteudo.classificacao])

  /** Segmento (Bancos, Energia, Shoppings…) definido à mão, por ativo. */
  const mapaSegmentos = useMemo(() => {
    const m = {}
    conteudo.segmentos.forEach(s => { m[s.ticker] = s.segmento })
    return m
  }, [conteudo.segmentos])

  /** Detalhes de renda fixa, por id da operação — indexador, taxa, vencimento… */
  const mapaDetalhesRF = useMemo(() => {
    const m = {}
    conteudo.detalhesRF.forEach(d => { m[d.operacao_id] = d })
    return m
  }, [conteudo.detalhesRF])

  /** Cor escolhida por você para cada classe, sobrepondo a cor de fábrica. */
  const mapaCoresClasse = useMemo(() => {
    const m = {}
    conteudo.coresClasse.forEach(c => { m[c.classe] = c.cor })
    return m
  }, [conteudo.coresClasse])

  const calc = useMemo(
    () => calcular(conteudo.operacoes, conteudo.proventos, mapaCotacoes, mapaClasses, taxasCambio),
    [conteudo.operacoes, conteudo.proventos, mapaCotacoes, mapaClasses, taxasCambio])

  const ultimaAtualizacaoCotacoes = useMemo(() => {
    const datas = conteudo.cotacoes.map(c => c.atualizado).filter(Boolean)
    return datas.length ? datas.sort().at(-1) : null
  }, [conteudo.cotacoes])

  // true quando existe algo que a busca automática de cotações precisaria
  // atualizar — usado para saber quando é seguro fotografar o patrimônio
  // do dia sem pegar um preço de ontem.
  const precisaCotar = useMemo(
    () => calc.abertas.some(p => CLASSES_COM_COTACAO.includes(p.classe)),
    [calc.abertas])

  /* --- escrita --- */
  const comCarteira = obj => ({ ...obj, carteira_id: carteiraId })

  const api = {
    async criarCarteira(nome, cor) {
      const { data, error } = await sb.rpc('criar_carteira', { p_nome: nome, p_cor: cor })
      if (error) throw error
      const lista = await recarregarCarteiras()
      trocarCarteira(data)
      return lista.find(c => c.id === data)
    },
    async renomearCarteira(id, nome, cor) {
      const { error } = await sb.from('carteiras').update({ nome, cor }).eq('id', id)
      if (error) throw error
      await recarregarCarteiras()
    },
    async apagarCarteira(id) {
      const { error } = await sb.from('carteiras').delete().eq('id', id)
      if (error) throw error
      try { localStorage.removeItem(CHAVE_ULTIMA) } catch { /* ignora */ }
      setCarteiraId(null)
      await recarregarCarteiras()
    },
    async salvarOperacao(op, detalhesRF) {
      const id = op.id || crypto.randomUUID()
      const linha = comCarteira({ ...op, id })
      const { error } = op.id
        ? await sb.from('operacoes').update(linha).eq('id', op.id)
        : await sb.from('operacoes').insert(linha)
      if (error) throw error
      if (detalhesRF) {
        const { error: e2 } = await sb.from('detalhes_renda_fixa')
          .upsert({ operacao_id: id, ...detalhesRF }, { onConflict: 'operacao_id' })
        if (e2) throw e2
      } else if (op.id) {
        // deixou de ser renda fixa numa edição: não deixa detalhe órfão
        await sb.from('detalhes_renda_fixa').delete().eq('operacao_id', id)
      }
      await recarregar()
    },
    async apagarOperacao(id) {
      const { error } = await sb.from('operacoes').delete().eq('id', id)
      if (error) throw error
      await recarregar()
    },
    async salvarProvento(pv) {
      const linha = comCarteira(pv)
      const { error } = pv.id
        ? await sb.from('proventos').update(linha).eq('id', pv.id)
        : await sb.from('proventos').insert(linha)
      if (error) throw error
      await recarregar()
    },
    async apagarOperacoes(ids) {
      if (!ids.length) return 0
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from('operacoes').delete()
          .eq('carteira_id', carteiraId).in('id', ids.slice(i, i + 200))
        if (error) throw error
      }
      await recarregar()
      return ids.length
    },
    async apagarProvento(id) {
      const { error } = await sb.from('proventos').delete().eq('id', id)
      if (error) throw error
      await recarregar()
    },
    async inserirLote(tabela, linhas) {
      if (!linhas.length) return 0
      let gravadas = 0
      for (let i = 0; i < linhas.length; i += 400) {
        const { data, error } = await sb.from(tabela)
          .upsert(linhas.slice(i, i + 400).map(comCarteira),
                  { onConflict: 'carteira_id,digital', ignoreDuplicates: true })
          .select('id')
        if (error) throw error
        gravadas += (data || []).length
      }
      await recarregar()
      return gravadas
    },
    async salvarCotacoes(mapa, origem = 'manual') {
      const linhas = Object.entries(mapa).map(([ticker, preco]) =>
        comCarteira({ ticker, preco, origem, atualizado: new Date().toISOString() }))
      if (!linhas.length) return
      const { error } = await sb.from('cotacoes').upsert(linhas, { onConflict: 'carteira_id,ticker' })
      if (error) throw error
      await recarregar()
    },
    async apagarCotacao(ticker) {
      const { error } = await sb.from('cotacoes').delete().eq('carteira_id', carteiraId).eq('ticker', ticker)
      if (error) throw error
      await recarregar()
    },
    async salvarAlvos(linhas) {
      const { error: e1 } = await sb.from('alocacao_alvo').delete().eq('carteira_id', carteiraId)
      if (e1) throw e1
      // linhas vindas do banco trazem "id"; linhas recém-criadas na tela não.
      // Misturar as duas no mesmo insert faz o PostgREST mandar NULL explícito
      // para quem não tem id, batendo na constraint. Como a tabela inteira já
      // foi apagada acima, ninguém precisa do id antigo — todo mundo entra
      // sem id e ganha um novo, de forma consistente.
      const validas = linhas.filter(l => l.percentual > 0)
        .map(({ id, ...resto }) => comCarteira(resto))
      if (validas.length) {
        const { error } = await sb.from('alocacao_alvo').insert(validas)
        if (error) throw error
      }
      await recarregar()
    },
    /** Grava premissas de vários ativos de uma vez, preservando o que já existia. */
    /**
     * Levanta os códigos do mercado fracionário que ainda estão separados
     * do lote padrão. Não altera nada — serve para você conferir antes.
     */
    /**
     * Procura a mesma operação lançada duas vezes.
     * O caso comum: o relatório de Negociação registra a data do pregão e o
     * de Movimentação registra a liquidação, dois dias depois. Mesmo papel,
     * mesma quantidade, mesmo preço — e a carteira dobra.
     */
    /** Define a classe de um ativo. Vale para tudo: posições, alocação e preço teto. */
    async definirClasse(ticker, classe) {
      const { error } = await sb.from('classificacao')
        .upsert(comCarteira({ ticker, classe, atualizado: new Date().toISOString() }),
          { onConflict: 'carteira_id,ticker' })
      if (error) throw error
      await recarregar()
    },
    async definirClasses(lista) {
      if (!lista.length) return 0
      const linhas = lista.map(x => comCarteira({ ...x, atualizado: new Date().toISOString() }))
      const { error } = await sb.from('classificacao')
        .upsert(linhas, { onConflict: 'carteira_id,ticker' })
      if (error) throw error
      await recarregar()
      return linhas.length
    },
    async limparClasse(ticker) {
      const { error } = await sb.from('classificacao').delete()
        .eq('carteira_id', carteiraId).eq('ticker', ticker)
      if (error) throw error
      await recarregar()
    },

    /**
     * Apaga operações e proventos, preservando cotações, alvos, premissas e
     * classificação. Serve quando a carteira acumulou correções demais e a
     * fonte original (os arquivos da B3) é mais confiável do que o remendo.
     */
    async recomecarCarteira() {
      for (const tabela of ['operacoes', 'proventos']) {
        const { error } = await sb.from(tabela).delete().eq('carteira_id', carteiraId)
        if (error) throw error
      }
      await recarregar()
    },

    /**
     * Busca cotações sem pedir confirmação — chamada uma vez ao abrir a
     * carteira. Silenciosa de propósito: uma falha aqui não deve interromper
     * quem só queria ver o resumo. O horário mostrado na tela é a prova de
     * que funcionou, ou de que ainda não rodou.
     */
    async atualizarCotacoesSilenciosamente() {
      const alvos = calc.abertas
        .filter(p => CLASSES_COM_COTACAO.includes(p.classe))
        .map(p => p.ticker)
      // tem ativo em dólar: busca o câmbio junto, com o mesmo clique
      if (calc.abertas.some(p => p.moeda === 'USD')) alvos.push('USDBRL')
      if (!alvos.length) return
      setStatusAuto('buscando')
      try {
        const r = await buscarNoServidor(alvos)
        const linhas = Object.entries(r.precos).map(([ticker, preco]) =>
          comCarteira({ ticker, preco, origem: 'yahoo', atualizado: new Date().toISOString() }))
        if (linhas.length) {
          const { error } = await sb.from('cotacoes').upsert(linhas, { onConflict: 'carteira_id,ticker' })
          if (error) throw error
          await recarregar()
        }
        setStatusAuto('ok')
      } catch {
        // sem toast: é automático, não deve incomodar. A tela mostra a
        // ausência de horário recente, que já é o aviso.
        setStatusAuto('erro')
      }
    },

    /**
     * Registra a fotografia de hoje do patrimônio, se ainda não existir uma.
     * É a base do gráfico "Evolução do Patrimônio" — sem preço histórico dos
     * ativos, não há como reconstruir o passado, então o histórico só cresce
     * a partir do dia em que a carteira passa a rodar nesta versão do app.
     */
    async registrarSnapshotSilenciosamente() {
      const hoje = new Date().toISOString().slice(0, 10)
      if (conteudo.historico.some(h => h.data === hoje)) return
      if (calc.total.valor <= 0 && calc.total.custo <= 0) return
      try {
        const { error } = await sb.from('patrimonio_historico')
          .upsert(comCarteira({ data: hoje, valor: calc.total.valor, custo: calc.total.custo }),
            { onConflict: 'carteira_id,data' })
        if (error) throw error
        await recarregar()
      } catch { /* silencioso — não é crítico perder um dia de histórico */ }
    },

    previewDuplicatas() {
      const DIAS = 6
      const dia = d => Math.floor(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') / 86400000)
      const ops = conteudo.operacoes
        .filter(o => o.tipo === 'compra' || o.tipo === 'venda')
        .slice().sort((a, b) => String(a.data).localeCompare(String(b.data)))

      const usados = new Set()
      const pares = []
      for (let i = 0; i < ops.length; i++) {
        const a = ops[i]
        if (usados.has(a.id)) continue
        for (let j = i + 1; j < ops.length; j++) {
          const b = ops[j]
          if (usados.has(b.id)) continue
          const dd = dia(b.data) - dia(a.data)
          if (dd > DIAS) break
          // No mesmo dia não é repetição: é a mesma ordem executada em partes,
          // que a B3 informa em várias linhas. A liquidação cai sempre em D+2.
          if (dd < 1) continue
          // Duas linhas vindas do relatório de Negociação são dois negócios
          // de verdade, não a mesma coisa contada duas vezes.
          if (a.fonte === 'negociacao' && b.fonte === 'negociacao') continue
          if (a.ticker !== b.ticker || a.tipo !== b.tipo) continue
          if (Math.abs(Number(a.quantidade) - Number(b.quantidade)) > 1e-6) continue
          const pa = Number(a.preco), pb = Number(b.preco)
          if (pa > 0 && Math.abs(pa - pb) / pa > 0.005) continue
          // fica o da Negociação, que traz a data real do negócio
          const sai = b.fonte === 'movimentacao' ? b : (a.fonte === 'movimentacao' ? a : b)
          const fica = sai === b ? a : b
          usados.add(a.id); usados.add(b.id)
          pares.push({ fica, sai, diasEntre: dd })
          break
        }
      }
      return pares
    },

    previewFracionarios() {
      const mapa = new Map()
      const juntar = (ticker, campo) => {
        if (!eFracionario(ticker)) return
        const base = normalizarTicker(ticker)
        if (!mapa.has(ticker)) mapa.set(ticker, { de: ticker, para: base, operacoes: 0, proventos: 0, premissas: false, alvo: false })
        const x = mapa.get(ticker)
        if (campo === 'op') x.operacoes++
        if (campo === 'pv') x.proventos++
        if (campo === 'pr') x.premissas = true
        if (campo === 'al') x.alvo = true
      }
      conteudo.operacoes.forEach(o => juntar(o.ticker, 'op'))
      conteudo.proventos.forEach(o => juntar(o.ticker, 'pv'))
      conteudo.premissas.forEach(o => juntar(o.ticker, 'pr'))
      conteudo.alvos.filter(a => a.nivel === 'ativo').forEach(a => juntar(a.chave, 'al'))

      const existentes = new Set([
        ...conteudo.operacoes.map(o => o.ticker),
        ...conteudo.proventos.map(o => o.ticker),
      ])
      return [...mapa.values()].map(x => ({ ...x, jaExiste: existentes.has(x.para) }))
    },

    /**
     * Aplica a consolidação. Operações e proventos passam a apontar para o
     * código do lote padrão; cotação, premissas e alvo do código fracionário
     * são descartados quando o padrão já tem os seus, para não duplicar.
     */
    async consolidarFracionarios(pares) {
      let movidos = 0
      for (const { de, para } of pares) {
        const classe = inferirClasse(para, '')
        for (const tabela of ['operacoes', 'proventos']) {
          const { data, error } = await sb.from(tabela)
            .update({ ticker: para, classe })
            .eq('carteira_id', carteiraId).eq('ticker', de)
            .select('id')
          if (error) throw error
          movidos += (data || []).length
        }
        // a cotação do fracionário some: o preço é o mesmo do lote padrão
        await sb.from('cotacoes').delete().eq('carteira_id', carteiraId).eq('ticker', de)

        const temPremissa = conteudo.premissas.some(x => x.ticker === para)
        if (temPremissa) await sb.from('premissas_teto').delete().eq('carteira_id', carteiraId).eq('ticker', de)
        else await sb.from('premissas_teto').update({ ticker: para }).eq('carteira_id', carteiraId).eq('ticker', de)

        const temAlvo = conteudo.alvos.some(a => a.nivel === 'ativo' && a.chave === para)
        if (temAlvo) await sb.from('alocacao_alvo').delete().eq('carteira_id', carteiraId).eq('nivel', 'ativo').eq('chave', de)
        else await sb.from('alocacao_alvo').update({ chave: para, classe_pai: classe })
          .eq('carteira_id', carteiraId).eq('nivel', 'ativo').eq('chave', de)

        const temSegmento = conteudo.segmentos.some(s => s.ticker === para)
        if (temSegmento) await sb.from('segmentos').delete().eq('carteira_id', carteiraId).eq('ticker', de)
        else await sb.from('segmentos').update({ ticker: para }).eq('carteira_id', carteiraId).eq('ticker', de)
      }
      await recarregar()
      return movidos
    },

    /** Ativos cuja classe difere da que o app deduziria, ignorando o que você já definiu. */
    previewClasses() {
      const definidos = new Set(conteudo.classificacao.map(c => c.ticker))
      return calc.abertas
        .filter(p => !definidos.has(p.ticker))
        .map(p => ({ ticker: p.ticker, atual: p.classe, sugerida: inferirClasse(p.ticker, '') }))
        .filter(x => x.sugerida !== 'Outro' && x.sugerida !== x.atual)
    },

    async aplicarClasses(itens) {
      for (const x of itens) {
        for (const tabela of ['operacoes', 'proventos']) {
          const { error } = await sb.from(tabela).update({ classe: x.sugerida })
            .eq('carteira_id', carteiraId).eq('ticker', x.ticker)
          if (error) throw error
        }
      }
      await recarregar()
      return itens.length
    },

    async salvarPremissasLote(lista) {
      if (!lista.length) return 0
      const linhas = lista.map(p => comCarteira({ ...p, atualizado: new Date().toISOString() }))
      const { error } = await sb.from('premissas_teto')
        .upsert(linhas, { onConflict: 'carteira_id,ticker' })
      if (error) throw error
      await recarregar()
      return linhas.length
    },
    async salvarPremissas(p) {
      const { error } = await sb.from('premissas_teto')
        .upsert(comCarteira({ ...p, atualizado: new Date().toISOString() }), { onConflict: 'carteira_id,ticker' })
      if (error) throw error
      await recarregar()
    },
    async apagarPremissas(ticker) {
      const { error } = await sb.from('premissas_teto').delete().eq('carteira_id', carteiraId).eq('ticker', ticker)
      if (error) throw error
      await recarregar()
    },

    /** Define o segmento de um ativo (Bancos, Energia…), dentro da classe dele. */
    async salvarSegmento(ticker, segmento) {
      const { error } = await sb.from('segmentos')
        .upsert(comCarteira({ ticker, segmento, atualizado: new Date().toISOString() }),
          { onConflict: 'carteira_id,ticker' })
      if (error) throw error
      await recarregar()
    },
    async limparSegmento(ticker) {
      const { error } = await sb.from('segmentos').delete()
        .eq('carteira_id', carteiraId).eq('ticker', ticker)
      if (error) throw error
      await recarregar()
    },

    /** Guarda a meta e o valor atual da reserva de emergência. Um número por vez, digitado por você. */
    async salvarReserva(meta, atual) {
      const { error } = await sb.from('reserva_emergencia')
        .upsert(comCarteira({ meta, atual, atualizado: new Date().toISOString() }), { onConflict: 'carteira_id' })
      if (error) throw error
      await recarregar()
    },

    /** Define a cor de uma classe, substituindo a de fábrica. */
    async salvarCorClasse(classe, cor) {
      const { error } = await sb.from('cores_classe')
        .upsert(comCarteira({ classe, cor, atualizado: new Date().toISOString() }), { onConflict: 'carteira_id,classe' })
      if (error) throw error
      await recarregar()
    },
    async restaurarCorClasse(classe) {
      const { error } = await sb.from('cores_classe').delete()
        .eq('carteira_id', carteiraId).eq('classe', classe)
      if (error) throw error
      await recarregar()
    },
  }

  const valor = {
    carteiras, carteira, carteiraId, trocarCarteira, recarregarCarteiras,
    ...conteudo, mapaCotacoes, mapaClasses, mapaSegmentos, mapaDetalhesRF, mapaCoresClasse, taxasCambio, calc, carregando, erro, recarregar,
    ultimaAtualizacaoCotacoes, statusAuto, precisaCotar,
    podeEscrever, eDono, ...api,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
