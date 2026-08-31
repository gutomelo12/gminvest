import { paraNumero } from './formato'

/**
 * Modelos de preço teto.
 * Cada um devolve { valor, ok, motivo } — quando não dá para calcular,
 * o motivo explica qual premissa está faltando, em vez de mostrar zero.
 */

/**
 * Gordon Ajustado — monta a taxa exigida do Gordon a partir de uma taxa
 * livre de risco (o rendimento de um Tesouro de referência) mais um
 * prêmio de risco, em vez de pedir um número solto. O resultado ainda
 * alimenta o mesmo `gordon()` de sempre — só a forma de chegar em K muda.
 *
 * Tijolo usa o Tesouro IPCA+ (uma taxa real: aluguel reajusta com
 * inflação, então o crescimento do dividendo também é pensado em termos
 * reais). Papel, FOF e Fiagro usam o Tesouro Prefixado, porque a renda
 * desses fundos já embute a inflação dentro do próprio dividendo — somar
 * uma taxa real a um fluxo que já é nominal dá conta errada.
 *
 * IR é descontado da taxa livre por padrão: dividendo de FII não paga
 * imposto para pessoa física, então comparar com um Tesouro líquido de
 * IR é a comparação justa.
 */
export function taxaGordonAjustado({ taxa_livre_risco, premio_risco, ajustar_ir, aliquota_ir }) {
  const livre = paraNumero(taxa_livre_risco)
  const premio = paraNumero(premio_risco)
  const aliquota = ajustar_ir ? paraNumero(aliquota_ir) / 100 : 0
  return livre * (1 - aliquota) + premio
}

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
    // a constante 22,5 vem de múltiplos típicos de ação (P/L 15 × P/VP 1,5);
    // FII não tem "lucro por cota" no sentido de uma empresa, então esse
    // número não representa nada ali — por isso fica fora do padrão de FII.
    naoRecomendadoPara: ['FII'],
  },
  gordon: {
    nome: 'Gordon',
    resumo: 'Dividendos futuros trazidos a valor presente, assumindo crescimento perpétuo.',
    formula: 'DPA × (1 + g) ÷ (k − g)',
    precisa: ['dpa', 'taxa_exigida', 'crescimento'],
  },
  vp_teto: {
    nome: 'P/VP máximo',
    resumo: 'Teto pelo patrimônio — não pagar acima de um múltiplo do valor patrimonial por cota.',
    formula: 'VPA × P/VP máximo',
    precisa: ['vpa', 'pvp_maximo'],
  },
}

/** Modelos usados por padrão quando ainda não há premissa salva, por classe. */
export const MODELOS_PADRAO_POR_CLASSE = {
  FII: ['bazin', 'gordon', 'vp_teto'],
}
export const MODELOS_PADRAO = ['bazin', 'graham', 'gordon']

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

export function vp_teto({ vpa, pvp_maximo }) {
  const v = paraNumero(vpa), m = paraNumero(pvp_maximo)
  if (v <= 0) return { ok: false, motivo: 'Informe o valor patrimonial por cota (VPA).' }
  if (m <= 0) return { ok: false, motivo: 'O P/VP máximo precisa ser maior que zero.' }
  return { ok: true, valor: v * m }
}

const FUNCOES = { bazin, graham, gordon, vp_teto }

/**
 * Roda os modelos escolhidos e resume numa faixa.
 * A margem de segurança desconta do teto — ela é o quanto você quer
 * errar e ainda estar certo.
 *
 * `classe` só decide o PADRÃO de modelos quando a premissa ainda não
 * escolheu nenhum de propósito — uma vez que a pessoa marca ou desmarca
 * um modelo à mão, essa escolha manda, não a classe.
 */
export function avaliar(premissas, precoAtual, classe) {
  const p = premissas || {}
  const padrao = MODELOS_PADRAO_POR_CLASSE[classe] || MODELOS_PADRAO
  const metodos = (p.metodos && p.metodos.length) ? p.metodos : padrao
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
