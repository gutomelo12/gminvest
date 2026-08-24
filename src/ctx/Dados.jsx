import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/supabase'
import { useSessao } from './Sessao'
import { calcular } from '../lib/calculo'

const Ctx = createContext(null)
export const useDados = () => useContext(Ctx)

const CHAVE_ULTIMA = 'gminvest.carteira'

export function ProvedorDados({ children }) {
  const { usuario } = useSessao()
  const [carteiras, setCarteiras] = useState([])
  const [carteiraId, setCarteiraId] = useState(() => {
    try { return localStorage.getItem(CHAVE_ULTIMA) } catch { return null }
  })
  const [conteudo, setConteudo] = useState({ operacoes: [], proventos: [], cotacoes: [], alvos: [], premissas: [] })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  /* --- lista de carteiras a que a pessoa tem acesso --- */
  const recarregarCarteiras = useCallback(async () => {
    if (!usuario) { setCarteiras([]); return [] }
    const { data, error } = await sb
      .from('acessos')
      .select('papel, carteira:carteiras(id, nome, cor, criada_por, criada_em)')
      .order('criado_em', { ascending: true })
    if (error) { setErro(error.message); return [] }
    const lista = (data || [])
      .filter(a => a.carteira)
      .map(a => ({ ...a.carteira, papel: a.papel }))
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
  const recarregar = useCallback(async () => {
    if (!carteiraId) { setConteudo({ operacoes: [], proventos: [], cotacoes: [], alvos: [], premissas: [] }); setCarregando(false); return }
    setCarregando(true); setErro(null)
    const eq = t => sb.from(t).select('*').eq('carteira_id', carteiraId)
    const [ops, pvs, cots, alvs, prems] = await Promise.all([
      eq('operacoes'), eq('proventos'), eq('cotacoes'), eq('alocacao_alvo'), eq('premissas_teto'),
    ])
    const falha = [ops, pvs, cots, alvs, prems].find(r => r.error)
    if (falha) setErro(falha.error.message)
    setConteudo({
      operacoes: ops.data || [],
      proventos: pvs.data || [],
      cotacoes: cots.data || [],
      alvos: alvs.data || [],
      premissas: prems.data || [],
    })
    setCarregando(false)
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

  const calc = useMemo(
    () => calcular(conteudo.operacoes, conteudo.proventos, mapaCotacoes),
    [conteudo.operacoes, conteudo.proventos, mapaCotacoes])

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
    async salvarOperacao(op) {
      const linha = comCarteira(op)
      const { error } = op.id
        ? await sb.from('operacoes').update(linha).eq('id', op.id)
        : await sb.from('operacoes').insert(linha)
      if (error) throw error
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
      const validas = linhas.filter(l => l.percentual > 0).map(comCarteira)
      if (validas.length) {
        const { error } = await sb.from('alocacao_alvo').insert(validas)
        if (error) throw error
      }
      await recarregar()
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
  }

  const valor = {
    carteiras, carteira, carteiraId, trocarCarteira, recarregarCarteiras,
    ...conteudo, mapaCotacoes, calc, carregando, erro, recarregar,
    podeEscrever, eDono, ...api,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
