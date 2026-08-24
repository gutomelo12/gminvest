import { paraNumero } from './formato'

/**
 * Posições a partir do livro de operações.
 * Preço médio por custo: cada venda baixa o custo proporcional das cotas
 * vendidas e o que sobra da receita vira resultado realizado.
 */
export function calcular(operacoes = [], proventos = [], cotacoes = {}) {
  const ops = [...operacoes].sort((a, b) =>
    String(a.data).localeCompare(String(b.data)) || String(a.id).localeCompare(String(b.id)))
  const pos = {}

  const abrir = (ticker, classe) => {
    if (!pos[ticker]) pos[ticker] = {
      ticker, classe: classe || 'Outro',
      qtd: 0, custo: 0, custoVendido: 0, realizado: 0, proventos: 0,
      taxas: 0, primeira: null, ultima: null, corretoras: new Set(),
    }
    if (classe && classe !== 'Outro' && pos[ticker].classe === 'Outro') pos[ticker].classe = classe
    return pos[ticker]
  }

  for (const o of ops) {
    const p = abrir(o.ticker, o.classe)
    const qs = paraNumero(o.quantidade)
    const q = Math.abs(qs)
    const pr = paraNumero(o.preco)
    const tx = paraNumero(o.taxas)
    p.taxas += tx
    if (!p.primeira || o.data < p.primeira) p.primeira = o.data
    if (!p.ultima || o.data > p.ultima) p.ultima = o.data
    if (o.corretora) p.corretoras.add(o.corretora)

    if (o.tipo === 'compra') {
      p.qtd += q
      p.custo += q * pr + tx
    } else if (o.tipo === 'venda') {
      const pm = p.qtd > 0 ? p.custo / p.qtd : pr
      const qv = Math.min(q, p.qtd)
      const baixa = pm * qv
      p.realizado += (qv * pr - tx) - baixa
      p.custo -= baixa
      p.custoVendido += baixa
      p.qtd -= qv
      if (p.qtd < 1e-9) { p.qtd = 0; p.custo = 0 }
    } else if (o.tipo === 'bonificacao') {
      p.qtd += q
      p.custo += q * pr
    } else if (o.tipo === 'desdobramento') {
      if (q > 0) p.qtd *= q
    } else if (o.tipo === 'grupamento') {
      if (q > 0) p.qtd /= q
    } else if (o.tipo === 'ajuste') {
      p.qtd += qs
      p.custo += qs * pr
      if (p.qtd < 1e-9) { p.qtd = 0; p.custo = 0 }
    }
  }

  for (const pv of proventos) {
    const p = abrir(pv.ticker, pv.classe)
    p.proventos += paraNumero(pv.valor)
  }

  const lista = Object.values(pos).map(p => {
    const cot = cotacoes[p.ticker]
    const pm = p.qtd > 0 ? p.custo / p.qtd : 0
    const temCotacao = Boolean(cot && paraNumero(cot.preco) > 0)
    const precoAtual = temCotacao ? paraNumero(cot.preco) : (p.qtd > 0 ? pm : 0)
    const valorAtual = p.qtd * precoAtual
    const naoRealizado = p.qtd > 0 ? valorAtual - p.custo : 0
    const base = p.custo + p.custoVendido
    const retornoTotal = naoRealizado + p.realizado + p.proventos
    return {
      ...p,
      corretoras: [...p.corretoras],
      precoMedio: pm, precoAtual, temCotacao,
      cotadoEm: cot ? cot.atualizado : null,
      origemPreco: cot ? cot.origem : null,
      valorAtual, naoRealizado,
      naoRealizadoPct: p.custo > 0 ? naoRealizado / p.custo * 100 : null,
      retornoTotal,
      retornoPct: base > 0 ? retornoTotal / base * 100 : null,
      yieldCusto: base > 0 ? p.proventos / base * 100 : null,
      encerrada: p.qtd === 0,
    }
  })

  const abertas = lista.filter(p => p.qtd > 0).sort((a, b) => b.valorAtual - a.valorAtual)
  const soma = (arr, f) => arr.reduce((s, x) => s + f(x), 0)

  const total = {
    valor: soma(abertas, p => p.valorAtual),
    custo: soma(abertas, p => p.custo),
    naoRealizado: soma(abertas, p => p.naoRealizado),
    realizado: soma(lista, p => p.realizado),
    proventos: soma(lista, p => p.proventos),
    taxas: soma(lista, p => p.taxas),
    ativos: abertas.length,
    semCotacao: abertas.filter(p => !p.temCotacao).length,
  }
  total.naoRealizadoPct = total.custo > 0 ? total.naoRealizado / total.custo * 100 : null
  total.retorno = total.naoRealizado + total.realizado + total.proventos

  abertas.forEach(p => { p.fatia = total.valor > 0 ? p.valorAtual / total.valor * 100 : 0 })

  const mapa = {}
  abertas.forEach(p => {
    if (!mapa[p.classe]) mapa[p.classe] = { classe: p.classe, valor: 0, custo: 0, n: 0 }
    mapa[p.classe].valor += p.valorAtual
    mapa[p.classe].custo += p.custo
    mapa[p.classe].n++
  })
  const classes = Object.values(mapa).sort((a, b) => b.valor - a.valor)
  classes.forEach(c => { c.fatia = total.valor > 0 ? c.valor / total.valor * 100 : 0 })

  return { lista, abertas, encerradas: lista.filter(p => p.encerrada), total, classes }
}

/** Proventos agrupados por mês, dos últimos N meses. */
export function proventosPorMes(proventos = [], meses = 12) {
  const ref = new Date()
  const saida = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    saida.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()],
      valor: 0,
    })
  }
  proventos.forEach(p => {
    const m = saida.find(x => x.ym === String(p.data).slice(0, 7))
    if (m) m.valor += paraNumero(p.valor)
  })
  return saida
}
