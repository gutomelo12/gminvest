import { paraNumero, CLASSES_SEM_COTACAO_ESPERADA, CLASSES_MOEDA_ESTRANGEIRA } from './formato'

/**
 * Posições a partir das operações da carteira.
 * Preço médio por custo: cada venda baixa o custo proporcional das cotas
 * vendidas e o que sobra da receita vira resultado realizado.
 *
 * Moeda: um ativo de "ETFs Intern." (ETF americano, por exemplo) é lançado e
 * cotado em dólar — preço médio, cotação, custo e valor de cada LINHA
 * ficam na moeda original, sem conversão, para bater com a nota de
 * corretagem. A conversão para real só acontece nos TOTAIS (patrimônio,
 * alocação por classe, % da carteira), que precisam de uma moeda comum
 * para fazer sentido somados.
 */
export function calcular(operacoes = [], proventos = [], cotacoes = {}, classeDoAtivo = {}, taxasCambio = {}) {
  const ops = [...operacoes].sort((a, b) =>
    String(a.data).localeCompare(String(b.data)) || String(a.id).localeCompare(String(b.id)))
  const pos = {}

  // a classe definida à mão vence qualquer dedução
  const abrir = (ticker, classeDoLancamento) => {
    const classe = classeDoAtivo[ticker] || classeDoLancamento
    if (!pos[ticker]) pos[ticker] = {
      ticker, classe: classe || 'Outro',
      qtd: 0, custo: 0, custoVendido: 0, realizado: 0, proventos: 0,
      taxas: 0, primeira: null, ultima: null, corretoras: new Set(),
    }
    if (classeDoAtivo[ticker]) pos[ticker].classe = classeDoAtivo[ticker]
    else if (classe && classe !== 'Outro' && pos[ticker].classe === 'Outro') pos[ticker].classe = classe
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

    // moeda nativa do ativo. Hoje só distingue BRL de USD — o suficiente
    // para o caso real (ETFs americanos via Nomad), mas um ativo europeu
    // em euro, por exemplo, ainda cairia aqui como se fosse dólar.
    const moeda = CLASSES_MOEDA_ESTRANGEIRA.includes(p.classe) ? 'USD' : 'BRL'
    const taxa = moeda === 'BRL' ? 1 : (taxasCambio[moeda] || null)
    const temTaxa = taxa != null
    const paraBRL = v => (temTaxa ? v * taxa : null)

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
      // usado só para o aviso "sem cotação" — o preço de mercado em si
      // (precoAtual acima) já cai para o preço médio de qualquer jeito
      esperaCotacao: !CLASSES_SEM_COTACAO_ESPERADA.includes(p.classe),
      // moeda nativa (para exibir a linha) e o equivalente em real (para
      // somar nos totais). semTaxa avisa quando ainda não há câmbio buscado.
      moeda, taxaCambio: taxa, temTaxa,
      valorAtualBRL: paraBRL(valorAtual),
      custoBRL: paraBRL(p.custo),
      naoRealizadoBRL: paraBRL(naoRealizado),
      realizadoBRL: paraBRL(p.realizado),
      proventosBRL: paraBRL(p.proventos),
    }
  })

  const abertas = lista.filter(p => p.qtd > 0).sort((a, b) => (b.valorAtualBRL ?? b.valorAtual) - (a.valorAtualBRL ?? a.valorAtual))
  const soma = (arr, f) => arr.reduce((s, x) => s + (f(x) ?? 0), 0)

  const total = {
    valor: soma(abertas, p => p.valorAtualBRL),
    custo: soma(abertas, p => p.custoBRL),
    naoRealizado: soma(abertas, p => p.naoRealizadoBRL),
    realizado: soma(lista, p => p.realizadoBRL),
    proventos: soma(lista, p => p.proventosBRL),
    taxas: soma(lista, p => p.taxas),
    ativos: abertas.length,
    semCotacao: abertas.filter(p => !p.temCotacao && p.esperaCotacao).length,
    semTaxaCambio: abertas.filter(p => !p.temTaxa).length,
  }
  total.naoRealizadoPct = total.custo > 0 ? total.naoRealizado / total.custo * 100 : null
  total.retorno = total.naoRealizado + total.realizado + total.proventos
  total.retornoPct = total.custo > 0 ? total.retorno / total.custo * 100 : null

  abertas.forEach(p => { p.fatia = total.valor > 0 ? (p.valorAtualBRL ?? 0) / total.valor * 100 : 0 })

  const mapa = {}
  abertas.forEach(p => {
    if (!mapa[p.classe]) mapa[p.classe] = { classe: p.classe, valor: 0, custo: 0, proventos: 0, n: 0 }
    mapa[p.classe].valor += p.valorAtualBRL ?? 0
    mapa[p.classe].custo += p.custoBRL ?? 0
    mapa[p.classe].proventos += p.proventosBRL ?? 0
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

/**
 * Aportes por mês — soma das compras, sempre em real. Um ativo em dólar
 * (ETFs Intern.) entra convertido pela taxa de câmbio atual; sem taxa
 * cadastrada, fica de fora da soma daquele mês em vez de somar o número
 * em dólar como se fosse real — o mesmo cuidado usado no resto do app.
 * Bonificação, desdobro e ajuste não são aporte: não há dinheiro saindo
 * do seu bolso nessas operações, só a venda teria efeito contrário.
 */
export function aportesPorMes(operacoes = [], taxasCambio = {}, classeDoAtivo = {}, meses = 12) {
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
  operacoes.forEach(o => {
    if (o.tipo !== 'compra') return
    const m = saida.find(x => x.ym === String(o.data).slice(0, 7))
    if (!m) return
    const classe = classeDoAtivo[o.ticker] || o.classe
    const nativo = Math.abs(paraNumero(o.quantidade)) * paraNumero(o.preco) + paraNumero(o.taxas)
    if (!CLASSES_MOEDA_ESTRANGEIRA.includes(classe)) { m.valor += nativo; return }
    const taxa = taxasCambio.USD
    if (taxa) m.valor += nativo * taxa
    // sem taxa de câmbio: este mês fica subcontado até você cadastrar uma,
    // em vez de somar dólar como se fosse real
  })
  return saida
}

/**
 * Uma fotografia por mês, dos últimos N — a mais recente registrada dentro
 * de cada mês. Mês sem nenhuma fotografia fica com valor nulo (não zero):
 * a carteira não deixou de valer algo, só não estava sendo acompanhada
 * ainda. Espera `historico` ordenado por data crescente.
 */
export function patrimonioPorMes(historico = [], meses = 12) {
  const ref = new Date()
  const saida = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    saida.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()],
      valor: null, custo: null,
    })
  }
  historico.forEach(h => {
    const m = saida.find(x => x.ym === String(h.data).slice(0, 7))
    if (m) { m.valor = paraNumero(h.valor); m.custo = paraNumero(h.custo) }
  })
  return saida
}

/**
 * Capital aportado acumulado até o fim de cada mês — não é valor de
 * mercado, é só quanto entrou de dinheiro (compra menos venda, líquido),
 * reconstruído a partir das próprias operações. Serve para preencher os
 * meses anteriores a qualquer fotografia de patrimônio, quando não existe
 * preço histórico disponível de graça para saber quanto a carteira valia
 * de verdade naquela época — não é o mesmo dado, e por isso o gráfico
 * precisa desenhar isso de um jeito visualmente diferente do valor real.
 *
 * Reaproveita o mesmo `calcular()` de sempre, rodado com o corte de data
 * de cada mês — não é uma fórmula nova, é o motor de sempre, olhando só
 * até uma certa data.
 */
export function custoAcumuladoPorMes(operacoes = [], classeDoAtivo = {}, taxasCambio = {}, meses = 12) {
  const ref = new Date()
  const saida = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    const fimDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const fimStr = `${fimDoMes.getFullYear()}-${String(fimDoMes.getMonth() + 1).padStart(2, '0')}-${String(fimDoMes.getDate()).padStart(2, '0')}`
    const ateAqui = operacoes.filter(o => String(o.data) <= fimStr)
    const parcial = calcular(ateAqui, [], {}, classeDoAtivo, taxasCambio)
    saida.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()],
      valor: parcial.total.custo,
    })
  }
  return saida
}
