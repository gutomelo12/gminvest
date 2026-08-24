export const fmtBRL = n => (n == null || !isFinite(n)) ? '—'
  : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
  'ETF':            '#B87615',
  'BDR':            '#6B4E9E',
  'Tesouro Direto': '#2C7A8C',
  'Renda Fixa':     '#8A6E3F',
  'Fundo':          '#9E2B2B',
  'Cripto':         '#C25E00',
  'Exterior':       '#3D6B4A',
  'Caixa':          '#7A8A80',
  'Outro':          '#5A6C63',
}
export const LISTA_CLASSES = Object.keys(CLASSES)
export const corClasse = c => CLASSES[c] || CLASSES['Outro']

/** Classes onde faz sentido calcular preço teto por dividendos. */
export const CLASSES_TETO = ['Ação', 'FII', 'BDR']

const ETFS_11 = new Set(['BOVA11','IVVB11','SMAL11','BOVV11','SMAC11','DIVO11','HASH11','QBTC11',
  'XINA11','NASD11','EURP11','GOLD11','IMAB11','IRFM11','B5P211','FIXA11','SPXI11','BOVB11',
  'ACWI11','WRLD11','QQQI11','JPMS11','TECK11','PIBB11','XFIX11'])

export function inferirClasse(ticker, produto) {
  const t = String(ticker || '').toUpperCase().trim()
  const p = semAcento(produto || '')
  if (p.includes('tesouro')) return 'Tesouro Direto'
  if (/\b(cdb|lci|lca|lig|debenture|cra|cri|cdca|coe|letra financeira)\b/.test(p)) return 'Renda Fixa'
  if (/^[A-Z]{4}1[12]$/.test(t)) return ETFS_11.has(t) ? 'ETF' : 'FII'
  if (/^[A-Z]{4}(3[2459]|33|34|35)$/.test(t)) return 'BDR'
  if (/^[A-Z]{4}(3|4|5|6|8)$/.test(t)) return 'Ação'
  if (/^(BTC|ETH|SOL|XRP|ADA|USDT|USDC|BNB|DOGE|LTC)/.test(t)) return 'Cripto'
  return 'Outro'
}
