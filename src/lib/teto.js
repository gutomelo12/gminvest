import { paraNumero } from './formato'

/**
 * Modelos de preço teto.
 * Cada um devolve { valor, ok, motivo } — quando não dá para calcular,
 * o motivo explica qual premissa está faltando, em vez de mostrar zero.
 */

export const MODELOS = {
  bazin: {
    nome: 'Bazin',
    resumo: 'Quanto pagar para que o dividendo entregue o rendimento que você exige.',
    formula: 'DPA ÷ yield exigido',
    precisa: ['dpa', 'yield_exigido'],
  },
  graham: {
    nome: 'Graham',
    resumo: 'Valor intrínseco a partir de lucro e patrimônio, no limite clássico de P/L 15 e P/VP 1,5.',
    formula: '√(22,5 × LPA × VPA)',
    precisa: ['lpa', 'vpa'],
  },
  gordon: {
    nome: 'Gordon',
    resumo: 'Dividendos futuros trazidos a valor presente, assumindo crescimento perpétuo.',
    formula: 'DPA × (1 + g) ÷ (k − g)',
    precisa: ['dpa', 'taxa_exigida', 'crescimento'],
  },
}

export function bazin({ dpa, yield_exigido }) {
  const d = paraNumero(dpa), y = paraNumero(yield_exigido) / 100
  if (d <= 0) return { ok: false, motivo: 'Informe o dividendo por ação (DPA).' }
  if (y <= 0) return { ok: false, motivo: 'O yield exigido precisa ser maior que zero.' }
  return { ok: true, valor: d / y }
}

export function graham({ lpa, vpa }) {
  const l = paraNumero(lpa), v = paraNumero(vpa)
  if (l <= 0) return { ok: false, motivo: 'Graham não se aplica com lucro por ação zero ou negativo.' }
  if (v <= 0) return { ok: false, motivo: 'Informe o valor patrimonial por ação (VPA).' }
  return { ok: true, valor: Math.sqrt(22.5 * l * v) }
}

export function gordon({ dpa, taxa_exigida, crescimento }) {
  const d = paraNumero(dpa), k = paraNumero(taxa_exigida) / 100, g = paraNumero(crescimento) / 100
  if (d <= 0) return { ok: false, motivo: 'Informe o dividendo por ação (DPA).' }
  if (k <= g) return { ok: false, motivo: 'A taxa exigida precisa ser maior que o crescimento, senão o modelo explode.' }
  return { ok: true, valor: d * (1 + g) / (k - g) }
}

const FUNCOES = { bazin, graham, gordon }

/**
 * Roda os modelos escolhidos e resume numa faixa.
 * A margem de segurança desconta do teto — ela é o quanto você quer
 * errar e ainda estar certo.
 */
export function avaliar(premissas, precoAtual) {
  const p = premissas || {}
  const metodos = (p.metodos && p.metodos.length) ? p.metodos : ['bazin', 'graham', 'gordon']
  const margem = paraNumero(p.margem) / 100

  const resultados = metodos.map(m => {
    const r = FUNCOES[m] ? FUNCOES[m](p) : { ok: false, motivo: 'Modelo desconhecido.' }
    return {
      metodo: m,
      nome: MODELOS[m]?.nome || m,
      ...r,
      comMargem: r.ok ? r.valor * (1 - margem) : null,
    }
  })

  const validos = resultados.filter(r => r.ok).map(r => r.comMargem)
  if (!validos.length) return { resultados, faixa: null, teto: null, situacao: 'sem-dados' }

  const min = Math.min(...validos)
  const max = Math.max(...validos)
  const media = validos.reduce((s, v) => s + v, 0) / validos.length
  const teto = min                                  // o mais conservador manda

  let situacao = 'sem-preco'
  let desconto = null
  if (precoAtual > 0) {
    desconto = (teto / precoAtual - 1) * 100
    situacao = precoAtual <= min ? 'abaixo' : (precoAtual <= max ? 'na-faixa' : 'acima')
  }
  return { resultados, faixa: { min, max, media }, teto, situacao, desconto }
}

export const ROTULO_SITUACAO = {
  'abaixo':    { texto: 'Abaixo do teto',      cor: 'var(--verde)' },
  'na-faixa':  { texto: 'Dentro da faixa',     cor: 'var(--ambar)' },
  'acima':     { texto: 'Acima do teto',       cor: 'var(--vermelho)' },
  'sem-preco': { texto: 'Sem cotação',         cor: 'var(--tinta-4)' },
  'sem-dados': { texto: 'Faltam premissas',    cor: 'var(--tinta-4)' },
}

/**
 * Estima o DPA a partir dos proventos já lançados, dividido pela
 * quantidade em carteira. É uma aproximação: serve de ponto de partida,
 * não substitui o número do balanço.
 */
export function dpaPelosProventos(proventos, ticker, quantidade, meses = 12) {
  if (!quantidade || quantidade <= 0) return null
  const corte = new Date()
  corte.setMonth(corte.getMonth() - meses)
  const limite = corte.toISOString().slice(0, 10)
  const soma = proventos
    .filter(p => p.ticker === ticker && String(p.data) >= limite)
    .reduce((s, p) => s + paraNumero(p.valor), 0)
  return soma > 0 ? soma / quantidade : null
}
