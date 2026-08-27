import { sb, mensagemDeErroDaFuncao } from './supabase'

/**
 * Fonte principal: a Edge Function `cotacoes`, que busca no Yahoo pelo
 * servidor do Supabase. Traz preço e, quando pedido, dividendo, lucro e
 * patrimônio por ação.
 *
 * Reserva: brapi.dev, chamada direto do navegador. Fica aqui de propósito —
 * o Yahoo não é fonte oficial e pode mudar sem aviso, então convém ter
 * para onde correr sem depender de eu publicar código novo.
 */

export async function buscarNoServidor(tickers, { comFundamentos = false } = {}) {
  const { data, error } = await sb.functions.invoke('cotacoes', {
    body: { tickers, comFundamentos },
  })
  if (error) throw new Error(await mensagemDeErroDaFuncao(error, 'cotacoes'))
  if (data?.erro) throw new Error(data.erro)
  return {
    precos: Object.fromEntries(Object.entries(data.cotacoes || {}).map(([t, v]) => [t, v.preco])),
    detalhes: data.cotacoes || {},
    tipos: Object.fromEntries(Object.entries(data.cotacoes || {})
      .filter(([, v]) => v.tipo).map(([t, v]) => [t, v.tipo])),
    fundamentos: data.fundamentos || {},
    falhas: data.falhas || [],
    ignorados: data.ignorados || [],
    avisoFundamentos: data.avisoFundamentos || null,
  }
}

/* ---------------- reserva ---------------- */

const BRAPI = 'https://brapi.dev/api/quote/'

export async function buscarNaBrapi(tickers, token) {
  const saida = {}
  for (let i = 0; i < tickers.length; i += 20) {
    const lote = tickers.slice(i, i + 20)
    const r = await fetch(BRAPI + encodeURIComponent(lote.join(',')), {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
    if (r.status === 401 || r.status === 403) throw new Error('Token da brapi recusado.')
    if (r.status === 429) throw new Error('Limite de requisições da brapi atingido.')
    if (!r.ok) throw new Error('A brapi respondeu com erro ' + r.status + '.')
    const j = await r.json()
    ;(j.results || []).forEach(x => {
      if (x?.symbol && x.regularMarketPrice != null)
        saida[String(x.symbol).toUpperCase()] = Number(x.regularMarketPrice)
    })
  }
  return saida
}

export const CHAVE_TOKEN = 'gminvest.brapi.token'
export const lerToken = () => { try { return localStorage.getItem(CHAVE_TOKEN) || '' } catch { return '' } }
export const salvarToken = t => { try { localStorage.setItem(CHAVE_TOKEN, t) } catch { /* ignora */ } }
