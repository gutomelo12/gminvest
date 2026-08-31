export const fmtBRL = n => (n == null || !isFinite(n)) ? '—'
  : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtUSD = n => (n == null || !isFinite(n)) ? '—'
  : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** Formata na moeda nativa do ativo — BRL com vírgula, USD com ponto. */
export const fmtMoeda = (n, moeda) => moeda === 'USD' ? fmtUSD(n) : fmtBRL(n)

export const fmtNum = (n, d = 2) => (n == null || !isFinite(n)) ? '—'
  : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const fmtQtd = n => (n == null || !isFinite(n)) ? '—'
  : n.toLocaleString('pt-BR', { maximumFractionDigits: 8 })

export const fmtPct = (n, d = 2) => (n == null || !isFinite(n)) ? '—'
  : (n >= 0 ? '+' : '') + n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'

export const fmtPctSimples = (n, d = 1) => (n == null || !isFinite(n)) ? '—'
  : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'

export const sinal = n => n > 0.005 ? 'pos' : (n < -0.005 ? 'neg' : 'nulo')

export const hoje = () => new Date().toISOString().slice(0, 10)

export function fmtHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function fmtData(iso) {
  if (!iso) return '—'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return (d && m && a) ? `${d}/${m}/${a}` : iso
}

export const semAcento = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Aceita "1.234,56", "R$ 1.234,56", "1234.56", "3.850" (milhar) ou número. */
export function paraNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  if (v == null) return 0
  let s = String(v).trim().replace(/R\$|\s|\u00A0/g, '')
  if (!s || s === '-' || s === '--') return 0
  const neg = /^\(.*\)$/.test(s)
  if (neg) s = s.slice(1, -1)
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = parseFloat(s)
  return isFinite(n) ? (neg ? -n : n) : 0
}

/** Aceita "dd/mm/aaaa", Date, serial do Excel ou ISO. Devolve "aaaa-mm-dd". */
export function paraISO(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v))
    return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 20000 && v < 80000)
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
  const s = String(v).trim()
  let m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? m[0] : ''
}

export const CLASSES = {
  'Ação':           '#1C3F94',
  'FII':            '#0B6E4F',
  'ETFs':           '#B87615',
  'BDR':            '#6B4E9E',
  'Tesouro Direto': '#2C7A8C',
  'Renda Fixa':     '#8A6E3F',
  'Fundo':          '#9E2B2B',
  'Cripto':         '#C25E00',
  'ETFs Intern.':   '#3D6B4A',
  'Caixa':          '#7A8A80',
  'Outro':          '#5A6C63',
}
export const LISTA_CLASSES = Object.keys(CLASSES)

/**
 * Segmentos sugeridos por classe — um ponto de partida, não uma
 * obrigação. O campo de segmento continua sendo texto livre; isto só
 * pré-preenche a lista de sugestões com um vocabulário comum, para
 * padronizar o nome que diferentes pessoas dão ao mesmo tipo de negócio.
 */
export const SEGMENTOS_SUGERIDOS = {
  'Ação': [
    'Bancos e Serviços Financeiros',
    'Energia Elétrica',
    'Petróleo, Gás e Combustíveis',
    'Mineração e Siderurgia',
    'Construção e Imobiliário',
    'Varejo e Consumo',
    'Alimentos e Bebidas',
    'Indústria e Bens de Capital',
    'Tecnologia e Software',
    'Telecomunicações e Mídia',
    'Saúde e Farmacêutico',
    'Transportes e Logística',
    'Agronegócio e Papel & Celulose',
    'Utilidades e Serviços Públicos',
    'Diversificado / Holding',
  ],
  'FII': [
    'Logística',
    'Shopping Centers',
    'Lajes Corporativas',
    'Varejo',
    'Híbrido',
    'Renda Urbana',
    'Residencial',
    'Hotel',
    'Agências Bancárias',
    'Educacional',
    'Hospitalar',
    'Industrial',
    'CRI / Recebíveis',
    'Fundo de Fundos (FOF)',
    'Agronegócio / Fiagro',
  ],
}
export const corClasse = c => CLASSES[c] || CLASSES['Outro']

/** Cor efetiva de uma classe — a que a pessoa escolheu em Ajustes, ou a de fábrica. */
export const corClasseEfetiva = (c, overrides) => (overrides && overrides[c]) || corClasse(c)

/** Classes onde faz sentido calcular preço teto por dividendos. */
export const CLASSES_TETO = ['Ação', 'FII', 'BDR']

/**
 * Classes que têm preço de mercado buscável — B3 ou bolsa estrangeira.
 * Fonte única, para não desalinhar entre a busca automática e o botão
 * manual, que antes usavam listas separadas.
 */
export const CLASSES_COM_COTACAO = ['Ação', 'FII', 'ETFs', 'BDR', 'ETFs Intern.']

/**
 * Classes cotadas fora do Brasil — a linha do ativo fica na moeda nativa
 * (dólar), e só entra convertida para real nos totais da carteira.
 * Hoje só cobre dólar; um ativo europeu cairia aqui como se fosse USD.
 */
export const CLASSES_MOEDA_ESTRANGEIRA = ['ETFs Intern.']

/**
 * Classes sem preço de mercado por natureza, não por falta de dado.
 * Um CDB não tem cotação para buscar — ele é marcado a custo mesmo,
 * então não faz sentido avisar "sem cotação" para ele.
 */
export const CLASSES_SEM_COTACAO_ESPERADA = ['Renda Fixa', 'Tesouro Direto']

/**
 * O sufixo F marca o mercado fracionário, que permite comprar menos de um
 * lote. O ativo é exatamente o mesmo: VALE3 e VALE3F dividem custódia,
 * proventos e preço médio. Aqui os dois viram um só.
 */
export function normalizarTicker(bruto) {
  const t = String(bruto || '').trim().toUpperCase().replace(/\s+/g, '')
  const m = t.match(/^([A-Z]{4}\d{1,2})F$/)
  return m ? m[1] : t
}

/** Verdadeiro quando o código é a versão fracionária de outro. */
export const eFracionario = bruto =>
  /^[A-Z]{4}\d{1,2}F$/.test(String(bruto || '').trim().toUpperCase())

/**
 * Units terminam em 11 sem serem fundo imobiliário: são pacotes de ações
 * ordinárias e preferenciais da mesma empresa. Sem esta lista, TAEE11 e
 * ALUP11 entrariam como FII e a alocação por classe sairia errada.
 * A lista não tem como ser completa — a classe é editável no lançamento.
 */
const UNITS_11 = new Set(['TAEE11','ALUP11','KLBN11','SANB11','BPAC11','ENGI11','SAPR11',
  'BRBI11','IGTI11','CPLE11','RNEW11','PPLA11','MODL11','PSVM11','TIET11','SULA11','BIDI11',
  'PINE11','AZEV11','ENAT11'])

/** Fundos de índice de renda variável: ações, índices, câmbio, cripto. */
const ETFS_RV = new Set([
  'BOVA11','IVVB11','SMAL11','BOVV11','SMAC11','DIVO11','SPXI11','BOVB11','ACWI11','WRLD11',
  'QQQI11','JPMS11','TECK11','PIBB11','XFIX11','XINA11','NASD11','EURP11','GOLD11','HASH11','QBTC11',
])

/**
 * Fundos de índice lastreados em títulos de renda fixa. Negociam em bolsa
 * como ETF, mas o risco é de juros, não de bolsa — e a tributação é de 15%
 * fixos, sem come-cotas. Misturá-los com ETF de ações distorce a alocação.
 */
const ETFS_RF = new Set([
  'AUPO11','LFTB11','LFTS11','IMAB11','IRFM11','B5P211','FIXA11','IB5M11','IMBB11','DEBB11','JURO11',
])

export const eETFRendaFixa = t => ETFS_RF.has(String(t || '').toUpperCase().trim())

export function inferirClasse(ticker, produto) {
  const t = normalizarTicker(ticker)
  const p = semAcento(produto || '')

  /**
   * O código negociado manda. O nome do produto só entra quando não há
   * código de bolsa — senão um fundo imobiliário de papel como
   * "AF INVEST CRI FII" cairia em Renda Fixa por causa da palavra CRI.
   */
  const temCodigoDeBolsa = /^[A-Z]{4}\d{1,2}$/.test(t)
  if (!temCodigoDeBolsa) {
    if (p.includes('tesouro')) return 'Tesouro Direto'
    if (/\b(cdb|lci|lca|lig|debenture|cra|cri|cdca|coe|letra financeira)\b/.test(p)) return 'Renda Fixa'
  }

  if (/^[A-Z]{4}1[12]$/.test(t)) {
    if (ETFS_RF.has(t) || ETFS_RV.has(t)) return 'ETFs'
    if (UNITS_11.has(t)) return 'Ação'
    return 'FII'
  }
  if (/^[A-Z]{4}(3[2459]|33|34|35)$/.test(t)) return 'BDR'
  if (/^[A-Z]{4}(3|4|5|6|8)$/.test(t)) return 'Ação'
  if (/^(BTC|ETH|SOL|XRP|ADA|USDT|USDC|BNB|DOGE|LTC)/.test(t)) return 'Cripto'
  return 'Outro'
}

/**
 * CDB, LCI, LCA e afins não têm código de bolsa. O ticker sintético
 * identifica "este título, deste emissor, com este vencimento" — para
 * que uma segunda aplicação no mesmo CDB caia na mesma posição, e um
 * CDB diferente (outro emissor ou outro vencimento) vire outra.
 */
export function gerarTickerRendaFixa(emissor, subtipo, vencimento) {
  const slug = semAcento(emissor || 'EMISSOR')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12) || 'EMISSOR'
  const venc = String(vencimento || '').replace(/-/g, '')
  const aaMM = venc.length === 8 ? venc.slice(2, 4) + venc.slice(4, 6) : ''
  const sigla = semAcento(subtipo || 'RF').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4) || 'RF'
  return [sigla, slug, aaMM].filter(Boolean).join('-')
}

export const SUBTIPOS_RF = ['CDB', 'LCI', 'LCA', 'CRI', 'CRA', 'Debênture', 'Letra Financeira', 'COE', 'Outro']
export const INDEXADORES_RF = ['CDI', 'IPCA', 'Selic', 'Prefixado']
export const FORMAS_RF = ['Pós-fixado', 'Prefixado', 'Híbrido']
