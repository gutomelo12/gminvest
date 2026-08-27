import { paraNumero } from './formato'

/**
 * Reconstrói linhas de texto a partir dos itens posicionados que o PDF.js
 * devolve — cada item já vem com a posição Y da linha em que está. Itens
 * na mesma linha (Y parecido) são unidos na ordem horizontal (X), porque
 * o PDF.js entrega fragmentos de texto soltos, não linhas prontas.
 */
export function linhasDoPdf(items, tolerancia = 2) {
  const grupos = []
  for (const it of items) {
    const y = it.transform[5]
    let grupo = grupos.find(g => Math.abs(g.y - y) <= tolerancia)
    if (!grupo) { grupo = { y, itens: [] }; grupos.push(grupo) }
    grupo.itens.push(it)
  }
  grupos.sort((a, b) => b.y - a.y) // no PDF, y cresce de baixo para cima
  return grupos.map(g =>
    g.itens.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')
      .replace(/\s+/g, ' ').trim())
}

// 2026-08-11 2026-08-12 VNQ 0.26857 96.8077 26.00 0.00 0.00 0.00 26.00
const RE_LINHA = /^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+([A-Z][A-Z.]{0,5})\s+([\d.]+)\s+([\d.]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/
// DESC: VANGUARD INDEX FDS REAL ESTATE ETF Trade#: 1AM2KAG7YCE CAP: AGENCY
const RE_DESC = /DESC:\s*(.+?)\s+Trade#:\s*(\S+)/

/**
 * Lê as linhas já reconstruídas de uma nota da Nomad. Preço já é por
 * unidade (quantidade × preço bate com o Gross Amount da nota), e o
 * Trade# vira a impressão digital — mais confiável que os heurísticos
 * usados para a B3, porque a própria nota já garante que é único.
 */
export function parseNomad(linhas) {
  const itens = []
  let secao = null
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim()
    if (/^You Bought/i.test(l)) { secao = 'compra'; continue }
    if (/^You Sold/i.test(l)) { secao = 'venda'; continue }
    const m = l.match(RE_LINHA)
    if (!m || !secao) continue
    const [, dataNeg, , simbolo, qtd, preco, , comissao, taxaTrans, addlFees] = m
    const prox = (linhas[i + 1] || '').match(RE_DESC)
    itens.push({
      data: dataNeg,
      tipo: secao,
      ticker: simbolo.toUpperCase(),
      classe: 'ETFs Intern.',
      quantidade: paraNumero(qtd),
      preco: paraNumero(preco),
      taxas: paraNumero(comissao) + paraNumero(taxaTrans) + paraNumero(addlFees),
      descricao: prox ? prox[1].trim() : '',
      tradeId: prox ? prox[2].trim() : null,
    })
  }
  return itens
}

export const digitalNomad = x => x.tradeId
  ? `nomad|${x.tradeId}`
  : `nomad|${x.data}|${x.ticker}|${x.tipo}|${x.quantidade}|${x.preco}`

/**
 * Lê o PDF inteiro e devolve o texto reconstruído, página por página.
 * O PDF.js só carrega quando esta função é chamada — a biblioteca pesa
 * uns 30MB no disco do projeto, então fica de fora do pacote principal.
 */
export async function extrairTextoDoPdf(arquivo) {
  const pdfjsLib = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const buf = await arquivo.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const linhas = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const conteudo = await pagina.getTextContent()
    linhas.push(...linhasDoPdf(conteudo.items))
  }
  return linhas
}
