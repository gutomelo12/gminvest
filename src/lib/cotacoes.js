/**
 * Cotações pela brapi.dev — a B3 não publica preços em API aberta.
 * Sem token só PETR4, VALE3, MGLU3 e ITUB4 respondem.
 */
const BASE = 'https://brapi.dev/api/quote/'

export async function buscar(tickers, token) {
  const saida = {}
  for (let i = 0; i < tickers.length; i += 20) {
    const lote = tickers.slice(i, i + 20)
    const r = await fetch(BASE + encodeURIComponent(lote.join(',')), {
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

export const CHAVE_TOKEN = 'gfin.brapi.token'
export const lerToken = () => { try { return localStorage.getItem(CHAVE_TOKEN) || '' } catch { return '' } }
export const salvarToken = t => { try { localStorage.setItem(CHAVE_TOKEN, t) } catch { /* ignora */ } }
