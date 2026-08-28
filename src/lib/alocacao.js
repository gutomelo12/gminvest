import { paraNumero } from './formato'
import { avaliar } from './teto'

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

/**
 * Distribui o alvo de um segmento (Bancos, Energia…) entre os ativos que
 * pertencem a ele, proporcional ao peso atual de cada um dentro do
 * segmento. Sem posição em nenhum ainda, divide igual. O resultado vira o
 * ponto de partida do alvo por ativo — editável depois, um por um.
 */
/**
 * Reparte o alvo de um segmento entre os ativos que o compõem, em partes
 * iguais — cada ativo do segmento recebe o mesmo peso alvo, independente
 * de quanto você já tem hoje de cada um. Isso é uma escolha deliberada,
 * não a única possível: a alternativa (repartir proporcional ao que você
 * já tem hoje) tende a simplesmente confirmar a posição que já está maior,
 * em vez de apontar pra onde faltaria aportar dentro do segmento.
 */
export function cascatearSegmento(ativos, pctAlvoSegmento) {
  if (!ativos.length) return []
  const cada = pctAlvoSegmento / ativos.length
  return ativos.map(a => ({ ticker: a.ticker, percentual: cada }))
}

/**
 * Envolve distribuirAporte com a reserva de emergência na frente. Enquanto
 * ela não estiver completa, uma fração do aporte é desviada para lá antes
 * de qualquer coisa — nunca mais do que falta para completá-la. Sem meta
 * definida, o comportamento é idêntico ao de sempre: tudo vai para a
 * distribuição entre classes.
 */
export function distribuirAporteComReserva(linhas, totalAtual, aporte, reserva, pctReserva = 100) {
  const A = paraNumero(aporte)
  const meta = reserva ? paraNumero(reserva.meta) : 0
  const atual = reserva ? paraNumero(reserva.atual) : 0
  const falta = Math.max(0, meta - atual)

  if (!reserva || meta <= 0 || falta <= 0) {
    return {
      reservaCompleta: true, faltaReserva: 0, paraReserva: 0, paraInvestir: A,
      ...distribuirAporte(linhas, totalAtual, A),
    }
  }

  const fracao = Math.max(0, Math.min(100, paraNumero(pctReserva))) / 100
  const paraReserva = Math.min(A * fracao, falta)
  const paraInvestir = A - paraReserva

  return {
    reservaCompleta: false, faltaReserva: falta - paraReserva, paraReserva, paraInvestir,
    ...distribuirAporte(linhas, totalAtual, paraInvestir),
  }
}

/**
 * Ordena os ativos de uma classe por prioridade de compra, usando só o que
 * você já declarou: o preço teto (Bazin, Graham, Gordon) e o alvo por
 * ativo. Não é opinião sobre qual ativo é melhor — é aritmética sobre os
 * critérios que você mesmo configurou, organizada para decidir mais rápido.
 */
/**
 * Ranqueia ativos de UMA classe por desconto no teto e desvio do alvo
 * individual. Espera receber `ativos` já filtrados para uma única classe —
 * o alvo por ativo agora é percentual dentro da classe, não da carteira
 * inteira, então a fatia de comparação também precisa ser calculada só
 * dentro deste grupo, não com o `fatia` de calculo.js (que é sempre
 * relativo à carteira toda).
 */
export function melhoresAtivosDaClasse(ativos, premissas, alvosPorAtivo) {
  const mapaAlvo = {}
  alvosPorAtivo.forEach(a => { if (a.nivel === 'ativo') mapaAlvo[a.chave] = paraNumero(a.percentual) })
  const totalClasse = ativos.reduce((s, p) => s + p.valorAtual, 0)

  return ativos.map(p => {
    const prem = premissas.find(x => x.ticker === p.ticker)
    const av = avaliar(prem, p.precoAtual)
    const alvoPct = mapaAlvo[p.ticker]
    const fatiaNaClasse = totalClasse > 0 ? p.valorAtual / totalClasse * 100 : 0
    // positivo = está abaixo do próprio alvo individual, ou seja, merece aporte
    const desvioAlvo = alvoPct != null ? alvoPct - fatiaNaClasse : null

    let pontos = 0
    if (av.desconto != null) pontos += Math.max(0, av.desconto) * 2
    if (desvioAlvo != null) pontos += Math.max(0, desvioAlvo) * 3

    return {
      ticker: p.ticker, situacao: av.situacao, teto: av.teto, desconto: av.desconto,
      alvoPct, desvioAlvo, pontos, temSinal: av.desconto != null || desvioAlvo != null,
    }
  }).sort((a, b) => b.pontos - a.pontos)
}
