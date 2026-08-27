/**
 * gminvest — cotações e fundamentos
 *
 * Roda no servidor do Supabase, não no navegador. Existe por dois motivos:
 * o Yahoo não libera chamadas de outra origem, e assim nenhuma credencial
 * precisa viajar até a máquina de quem usa o app.
 *
 * Só responde a quem está autenticado: o Supabase valida o token antes de
 * chegar aqui, desde que a função seja publicada sem --no-verify-jwt.
 *
 * Publicar:
 *   npx supabase functions deploy cotacoes
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// o Yahoo recusa requisição sem cara de navegador
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/**
 * PETR4 → PETR4.SA. VOO (bolsa americana) → VOO, sem sufixo. Só o que não
 * bate com nenhum dos dois padrões é descartado.
 *
 * O sufixo F é do mercado fracionário e não existe como cotação própria:
 * VALE3F é o mesmo papel de VALE3, negociado em lote menor. O F cai aqui
 * para que a busca encontre o preço.
 */
function paraYahoo(ticker: string): string | null {
  let t = String(ticker || '').trim().toUpperCase()
  // pseudo-ticker interno do app para a cotação do dólar — não é um ativo
  if (t === 'USDBRL') return 'BRL=X'
  const frac = t.match(/^([A-Z]{4}\d{1,2})F$/)
  if (frac) t = frac[1]
  if (/^[A-Z]{4}\d{1,2}$/.test(t)) return `${t}.SA`
  // ticker de bolsa americana: só letras (e ponto de classe de ação, como BRK.B)
  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(t)) return t
  return null
}

/**
 * Preço pelo endpoint de gráfico. É o único do Yahoo que continua aberto
 * sem cookie e sem crumb, então é ele que sustenta a parte que não pode falhar.
 */
async function preco(simbolo: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=1d`
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!r.ok) throw new Error(`chart ${r.status}`)
  const j = await r.json()
  const meta = j?.chart?.result?.[0]?.meta
  if (!meta) throw new Error('resposta sem dados')
  const p = meta.regularMarketPrice
  if (typeof p !== 'number' || !isFinite(p) || p <= 0) throw new Error('sem preço')
  const anterior = meta.chartPreviousClose ?? meta.previousClose ?? null
  return {
    preco: p,
    fechamentoAnterior: typeof anterior === 'number' ? anterior : null,
    moeda: meta.currency ?? null,
    nome: meta.longName ?? meta.shortName ?? null,
    // ETF, EQUITY, MUTUALFUND... serve para separar fundo de índice de ação.
    // A fonte não distingue FII de ação, então só é usado como pista.
    tipo: meta.instrumentType ?? null,
  }
}

/**
 * Fundamentos exigem cookie e crumb desde 2023. É uma sequência frágil e
 * não oficial, por isso vive isolada: se falhar, as cotações seguem inteiras.
 */
let credencial: { cookie: string; crumb: string; em: number } | null = null

async function obterCrumb() {
  if (credencial && Date.now() - credencial.em < 30 * 60_000) return credencial
  const r1 = await fetch('https://fc.yahoo.com', { headers: { 'user-agent': UA }, redirect: 'manual' })
  const cookie = (r1.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) throw new Error('sem cookie')
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'user-agent': UA, cookie, accept: 'text/plain' },
  })
  const crumb = (await r2.text()).trim()
  if (!crumb || crumb.length > 32 || crumb.includes('<')) throw new Error('sem crumb')
  credencial = { cookie, crumb, em: Date.now() }
  return credencial
}

async function fundamentos(simbolo: string) {
  const { cookie, crumb } = await obterCrumb()
  const modulos = 'defaultKeyStatistics,summaryDetail,financialData'
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(simbolo)}`
    + `?modules=${modulos}&crumb=${encodeURIComponent(crumb)}`
  const r = await fetch(url, { headers: { 'user-agent': UA, cookie, accept: 'application/json' } })
  if (!r.ok) throw new Error(`quoteSummary ${r.status}`)
  const j = await r.json()
  const res = j?.quoteSummary?.result?.[0]
  if (!res) throw new Error('resposta sem dados')

  const cru = (v: unknown) => {
    if (v == null) return null
    if (typeof v === 'number') return isFinite(v) ? v : null
    const raw = (v as { raw?: unknown }).raw
    return typeof raw === 'number' && isFinite(raw) ? raw : null
  }
  const est = res.defaultKeyStatistics ?? {}
  const det = res.summaryDetail ?? {}
  const fin = res.financialData ?? {}

  return {
    // dividendo por ação nos últimos doze meses
    dpa: cru(det.trailingAnnualDividendRate) ?? cru(det.dividendRate),
    // lucro por ação dos últimos doze meses
    lpa: cru(est.trailingEps) ?? cru(fin.revenuePerShare),
    // valor patrimonial por ação ou por cota
    vpa: cru(est.bookValue),
    dividendYield: cru(det.dividendYield),
    precoLucro: cru(det.trailingPE),
    precoVP: cru(est.priceToBook),
  }
}

/** Roda em blocos para não estourar o tempo da função nem irritar a fonte. */
async function emBlocos<T>(itens: string[], tamanho: number, f: (s: string) => Promise<T>) {
  const saida: { simbolo: string; ok: boolean; dado?: T; erro?: string }[] = []
  for (let i = 0; i < itens.length; i += tamanho) {
    const bloco = itens.slice(i, i + tamanho)
    const rs = await Promise.all(bloco.map(async s => {
      try { return { simbolo: s, ok: true, dado: await f(s) } }
      catch (e) { return { simbolo: s, ok: false, erro: (e as Error).message } }
    }))
    saida.push(...rs)
  }
  return saida
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  try {
    const { tickers = [], comFundamentos = false } = await req.json()
    if (!Array.isArray(tickers) || !tickers.length)
      return responder({ erro: 'Envie uma lista de tickers.' }, 400)
    if (tickers.length > 120)
      return responder({ erro: 'No máximo 120 ativos por chamada.' }, 400)

    // símbolo do Yahoo → códigos que o app enviou. VALE3 e VALE3F caem no
    // mesmo símbolo, e cada um recebe o preço de volta com o nome que mandou.
    const mapa = new Map<string, string[]>()
    for (const t of tickers) {
      const s = paraYahoo(t)
      if (!s) continue
      const original = String(t).trim().toUpperCase()
      const atual = mapa.get(s) ?? []
      if (!atual.includes(original)) atual.push(original)
      mapa.set(s, atual)
    }
    const simbolos = [...mapa.keys()]
    if (!simbolos.length)
      return responder({
        cotacoes: {}, fundamentos: {},
        ignorados: tickers,
        aviso: 'Nenhum dos ativos enviados tem código negociado na B3.',
      })

    const cot = await emBlocos(simbolos, 8, preco)
    const cotacoes: Record<string, unknown> = {}
    const falhas: string[] = []
    for (const r of cot) {
      for (const t of mapa.get(r.simbolo)!) {
        if (r.ok) cotacoes[t] = r.dado
        else falhas.push(t)
      }
    }

    let fund: Record<string, unknown> = {}
    let avisoFund: string | null = null
    if (comFundamentos) {
      try {
        const fs = await emBlocos(simbolos, 5, fundamentos)
        for (const r of fs) if (r.ok) for (const t of mapa.get(r.simbolo)!) fund[t] = r.dado
        if (!Object.keys(fund).length)
          avisoFund = 'A fonte não devolveu fundamentos desta vez. As cotações vieram normalmente.'
      } catch (e) {
        credencial = null
        fund = {}
        avisoFund = 'Não foi possível autenticar na fonte de fundamentos. As cotações vieram normalmente.'
      }
    }

    return responder({
      cotacoes,
      fundamentos: fund,
      falhas,
      ignorados: tickers.filter((t: string) => !paraYahoo(t)),
      avisoFundamentos: avisoFund,
      em: new Date().toISOString(),
    })
  } catch (e) {
    return responder({ erro: (e as Error).message }, 500)
  }
})
