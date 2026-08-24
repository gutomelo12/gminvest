import { paraNumero } from './formato'

/**
 * Compara alocação alvo com a realizada e distribui um aporte.
 * Só compra: nunca sugere venda, porque rebalancear vendendo gera
 * imposto e a maioria dos aportes resolve o desvio sozinho.
 */
export function comparar(classes, alvos, totalCarteira) {
  const mapaAlvo = {}
  alvos.filter(a => a.nivel === 'classe').forEach(a => { mapaAlvo[a.chave] = paraNumero(a.percentual) })

  const chaves = new Set([...classes.map(c => c.classe), ...Object.keys(mapaAlvo)])
  const linhas = [...chaves].map(chave => {
    const atual = classes.find(c => c.classe === chave)
    const valor = atual ? atual.valor : 0
    const pctAtual = totalCarteira > 0 ? valor / totalCarteira * 100 : 0
    const pctAlvo = mapaAlvo[chave] ?? 0
    const valorAlvo = totalCarteira * pctAlvo / 100
    return {
      chave, valor, pctAtual, pctAlvo,
      desvioPp: pctAtual - pctAlvo,
      desvioRS: valor - valorAlvo,
      semAlvo: mapaAlvo[chave] === undefined,
    }
  }).sort((a, b) => b.pctAlvo - a.pctAlvo || b.valor - a.valor)

  const somaAlvo = Object.values(mapaAlvo).reduce((s, v) => s + v, 0)
  return { linhas, somaAlvo, fechado: Math.abs(somaAlvo - 100) < 0.01 }
}

/**
 * Distribui um aporte priorizando quem está mais longe do alvo por baixo.
 * Resolve exatamente: procura o patrimônio final e paga a diferença de
 * cada classe deficitária, sem nunca propor valor negativo.
 */
export function distribuirAporte(linhas, totalAtual, aporte) {
  const A = paraNumero(aporte)
  if (A <= 0) return { destinos: [], sobra: 0, alcancaAlvo: false }
  const total = totalAtual + A

  const alvos = linhas.filter(l => l.pctAlvo > 0)
  const faltas = alvos.map(l => ({
    chave: l.chave,
    falta: Math.max(0, total * l.pctAlvo / 100 - l.valor),
    pctAlvo: l.pctAlvo,
  }))
  const somaFalta = faltas.reduce((s, f) => s + f.falta, 0)

  let destinos
  if (somaFalta <= A + 1e-6) {
    // dá para zerar todos os déficits; o resto vai proporcional ao alvo
    const resto = A - somaFalta
    const somaPct = alvos.reduce((s, l) => s + l.pctAlvo, 0) || 1
    destinos = faltas.map(f => ({
      chave: f.chave,
      valor: f.falta + resto * f.pctAlvo / somaPct,
    }))
  } else {
    // aporte insuficiente: rateia proporcionalmente ao tamanho do déficit
    destinos = faltas.map(f => ({ chave: f.chave, valor: A * f.falta / somaFalta }))
  }

  destinos = destinos
    .filter(d => d.valor > 0.005)
    .map(d => ({ ...d, pctDoAporte: d.valor / A * 100 }))
    .sort((a, b) => b.valor - a.valor)

  const gasto = destinos.reduce((s, d) => s + d.valor, 0)
  return { destinos, sobra: A - gasto, alcancaAlvo: somaFalta <= A + 1e-6 }
}
