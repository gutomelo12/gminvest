import { paraNumero } from './formato'

/**
 * Encontra operações que entraram duas vezes no livro.
 *
 * O caso comum vem da B3: o extrato de Negociação registra a compra na
 * data do negócio, e o de Movimentação registra a mesma compra como
 * "Transferência - Liquidação" na data da liquidação, dois dias depois.
 * Mesma quantidade, mesmo preço, datas próximas — dois lançamentos para
 * um negócio só.
 *
 * O casamento exige ticker, tipo, quantidade e preço idênticos. A data é
 * o único campo que pode divergir, dentro da janela de liquidação.
 */
export function encontrarDuplicatas(operacoes, janelaDias = 7) {
  const chave = o => [
    o.ticker,
    o.tipo,
    paraNumero(o.quantidade).toFixed(6),
    paraNumero(o.preco).toFixed(6),
  ].join('|')

  const grupos = new Map()
  for (const o of operacoes) {
    if (paraNumero(o.preco) <= 0) continue      // eventos sem preço não entram
    const k = chave(o)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(o)
  }

  const dias = (a, b) =>
    Math.abs(new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000

  const pares = []
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue
    const ord = [...lista].sort((a, b) => String(a.data).localeCompare(String(b.data)))
    const usados = new Set()
    for (let i = 0; i < ord.length; i++) {
      if (usados.has(ord[i].id)) continue
      for (let j = i + 1; j < ord.length; j++) {
        if (usados.has(ord[j].id)) continue
        const d = dias(ord[i].data, ord[j].data)
        if (d > janelaDias) break
        // o mais antigo é a data do negócio; o mais novo, a da liquidação
        pares.push({
          manter: ord[i],
          remover: ord[j],
          diasEntre: d,
          mesmoDia: d === 0,
        })
        usados.add(ord[i].id)
        usados.add(ord[j].id)
        break
      }
    }
  }
  return pares.sort((a, b) => String(a.manter.data).localeCompare(String(b.manter.data)))
}

/** Soma o impacto financeiro do que seria removido. */
export function impacto(pares) {
  let compras = 0, vendas = 0
  for (const p of pares) {
    const v = paraNumero(p.remover.quantidade) * paraNumero(p.remover.preco)
    if (p.remover.tipo === 'compra') compras += v
    else if (p.remover.tipo === 'venda') vendas += v
  }
  return { compras, vendas, total: compras - vendas, n: pares.length }
}
