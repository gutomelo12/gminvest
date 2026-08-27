import * as XLSX from 'xlsx'
import { paraNumero, paraISO, semAcento, inferirClasse, normalizarTicker } from './formato'

/**
 * Leitura dos relatórios da Área do Investidor da B3.
 * As colunas são localizadas pelo nome, não pela posição — a B3 muda
 * a ordem entre exportações.
 */
const COL = {
  dataNeg:  ['data do negocio', 'data negocio'],
  tipoMov:  ['tipo de movimentacao'],
  codNeg:   ['codigo de negociacao', 'codigo negociacao', 'ticker'],
  qtd:      ['quantidade'],
  preco:    ['preco'],
  precoUni: ['preco unitario'],
  valorOp:  ['valor da operacao', 'valor operacao', 'valor'],
  entSai:   ['entrada/saida', 'entradasaida', 'entrada saida'],
  data:     ['data'],
  mov:      ['movimentacao'],
  produto:  ['produto'],
  inst:     ['instituicao'],
  valorAtu: ['valor atualizado', 'valor bruto', 'valor liquido'],
  precoFec: ['preco de fechamento', 'preco fechamento', 'ultimo preco', 'preco'],
}
const acharCol = (cabs, nomes) => cabs.findIndex(h => nomes.some(n => h === n || h.startsWith(n)))

export function lerPlanilha(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false })
  const blocos = []
  wb.SheetNames.forEach(nome => {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, blankrows: false, defval: '' })
    if (linhas.length < 2) return
    let iCab = -1
    const marcas = ['quantidade', 'produto', 'codigo de negociacao', 'movimentacao', 'data do negocio', 'instituicao']
    for (let i = 0; i < Math.min(12, linhas.length); i++) {
      const c = linhas[i].map(semAcento)
      if (marcas.filter(m => c.some(h => h.startsWith(m))).length >= 2) { iCab = i; break }
    }
    if (iCab < 0) return
    const cabs = linhas[iCab].map(semAcento)
    const corpo = linhas.slice(iCab + 1).filter(l => l.some(v => String(v).trim() !== ''))
    let tipo = null
    if (acharCol(cabs, COL.tipoMov) >= 0 && acharCol(cabs, COL.codNeg) >= 0) tipo = 'negociacao'
    else if (acharCol(cabs, COL.mov) >= 0 && acharCol(cabs, COL.entSai) >= 0) tipo = 'movimentacao'
    else if (acharCol(cabs, COL.qtd) >= 0 && (acharCol(cabs, COL.codNeg) >= 0 || acharCol(cabs, COL.produto) >= 0)) tipo = 'posicao'
    if (tipo) blocos.push({ aba: nome, tipo, cabs, corpo })
  })
  return blocos
}

export function limparTicker(v) {
  let s = String(v || '').trim().toUpperCase().split(' - ')[0].trim().replace(/\s+/g, ' ')
  if (/^[A-Z0-9]{4,7}$/.test(s.replace(/\s/g, ''))) {
    // o fracionário entra na carteira junto com o lote padrão
    return normalizarTicker(s.replace(/\s/g, ''))
  }
  return s.slice(0, 40)
}

function traduzir(mov, entSai, qtd, precoU, valor, produto, data, inst) {
  const m = semAcento(mov)
  const credito = semAcento(entSai).startsWith('credito')
  const ticker = limparTicker(produto)
  const classe = inferirClasse(ticker, produto)
  const base = { data, ticker, classe, corretora: inst, origem: mov, fonte: 'movimentacao' }

  if (m.includes('juros sobre capital')) return { destino: 'provento', ...base, tipo: 'JCP', valor }
  if (m.includes('dividendo'))           return { destino: 'provento', ...base, tipo: 'Dividendo', valor }
  if (m.includes('rendimento'))          return { destino: 'provento', ...base, tipo: 'Rendimento', valor }
  if (m.includes('amortizacao'))         return { destino: 'provento', ...base, tipo: 'Amortização', valor }
  if (m.includes('leilao de fracao'))    return { destino: 'provento', ...base, tipo: 'Restituição', valor }
  if (m === 'juros' || m.startsWith('juros ')) return { destino: 'provento', ...base, tipo: 'Juros', valor }

  const pu = () => precoU > 0 ? precoU : (qtd > 0 ? valor / qtd : 0)

  // Estas linhas são a liquidação de negócios que o relatório de Negociação
  // já traz — mesma operação, vista dois dias depois. Ficam marcadas para
  // não entrarem junto e dobrarem a carteira.
  if (m.includes('liquidacao') || m.includes('compra / venda') || m.includes('compra/venda'))
    return { destino: 'operacao', liquidacao: true, ...base, tipo: credito ? 'compra' : 'venda', quantidade: qtd, preco: pu(), taxas: 0 }
  if (m === 'compra' || m === 'venda' || m.startsWith('compra ') || m.startsWith('venda '))
    return { destino: 'operacao', liquidacao: true, ...base, tipo: m.startsWith('venda') ? 'venda' : 'compra', quantidade: qtd, preco: pu(), taxas: 0 }
  if (m.includes('resgate'))
    return { destino: 'operacao', ...base, tipo: 'venda', quantidade: qtd, preco: pu(), taxas: 0 }
  if (m.includes('bonificacao'))
    return { destino: 'operacao', ...base, tipo: 'bonificacao', quantidade: qtd, preco: precoU || 0, taxas: 0 }
  if (m.includes('desdobro') || m.includes('grupamento') || m.includes('fracao em ativos')
      || m.includes('cisao') || m.includes('incorporacao'))
    return { destino: 'operacao', ...base, tipo: 'ajuste', quantidade: credito ? qtd : -qtd, preco: 0, taxas: 0 }
  if (m.includes('transferencia'))
    return { destino: 'operacao', ...base, tipo: 'ajuste', quantidade: credito ? qtd : -qtd, preco: precoU || 0, taxas: 0,
             nota: 'Transferência de custódia — confira o preço médio depois de importar.' }

  return { destino: 'ignorado', ...base, motivo: mov, valor, quantidade: qtd }
}

export const digital = x => x.destino === 'provento'
  ? `pv|${x.data}|${x.ticker}|${semAcento(x.tipo)}|${paraNumero(x.valor).toFixed(2)}`
  : `op|${x.data}|${x.ticker}|${x.tipo}|${paraNumero(x.quantidade).toFixed(6)}|${paraNumero(x.preco).toFixed(6)}`

export function extrair(blocos) {
  const itens = [], precos = {}
  blocos.forEach(b => {
    const i = n => acharCol(b.cabs, n)
    if (b.tipo === 'negociacao') {
      const cD = i(COL.dataNeg), cT = i(COL.tipoMov), cC = i(COL.codNeg),
            cQ = i(COL.qtd), cP = i(COL.preco), cI = i(COL.inst)
      b.corpo.forEach(l => {
        const data = paraISO(l[cD]); if (!data) return
        const ticker = limparTicker(l[cC]); if (!ticker) return
        itens.push({
          destino: 'operacao', data, ticker,
          classe: inferirClasse(ticker, ticker),
          tipo: semAcento(l[cT]).startsWith('v') ? 'venda' : 'compra',
          quantidade: paraNumero(l[cQ]),
          preco: paraNumero(l[cP]),
          taxas: 0,
          corretora: cI >= 0 ? String(l[cI] || '').trim() : '',
          origem: 'Negociação', fonte: 'negociacao',
        })
      })
    } else if (b.tipo === 'movimentacao') {
      const cE = i(COL.entSai), cD = i(COL.data), cM = i(COL.mov), cPr = i(COL.produto),
            cI = i(COL.inst), cQ = i(COL.qtd), cPU = i(COL.precoUni), cV = i(COL.valorOp)
      b.corpo.forEach(l => {
        const data = paraISO(l[cD]); if (!data) return
        const x = traduzir(String(l[cM] || ''), String(l[cE] || ''),
          paraNumero(l[cQ]), paraNumero(l[cPU]), paraNumero(l[cV]),
          String(l[cPr] || ''), data, cI >= 0 ? String(l[cI] || '').trim() : '')
        if (x.ticker) itens.push({ ...x, fonte: 'movimentacao' })
      })
    } else if (b.tipo === 'posicao') {
      const cC = i(COL.codNeg), cPr = i(COL.produto), cQ = i(COL.qtd),
            cF = i(COL.precoFec), cVA = i(COL.valorAtu)
      b.corpo.forEach(l => {
        const ticker = limparTicker(cC >= 0 ? l[cC] : l[cPr]); if (!ticker) return
        const q = paraNumero(l[cQ])
        let preco = cF >= 0 ? paraNumero(l[cF]) : 0
        if (!preco && cVA >= 0 && q > 0) preco = paraNumero(l[cVA]) / q
        if (preco > 0 || q > 0) precos[ticker] = {
          preco, quantidade: q, classe: inferirClasse(ticker, String(l[cPr] || '')), aba: b.aba,
        }
      })
    }
  })
  itens.sort((a, b) => a.data.localeCompare(b.data))

  /**
   * A B3 quebra uma ordem em várias linhas quando ela executa em partes:
   * vender 300 cotas pode sair como três execuções idênticas de 100. Sem um
   * contador, as três teriam a mesma impressão digital e o banco recusaria
   * duas como repetição — e a venda entraria pela terça parte.
   *
   * A primeira ocorrência fica sem sufixo de propósito: assim, reimportar um
   * arquivo já processado reconhece o que está gravado e acrescenta só o que
   * faltou, em vez de duplicar tudo.
   */
  const vezes = new Map()
  itens.forEach((x, n) => {
    x._i = n
    if (x.destino === 'ignorado') return
    const base = digital(x)
    const k = (vezes.get(base) || 0) + 1
    vezes.set(base, k)
    x._d = k === 1 ? base : `${base}#${k}`
  })
  return { itens, precos }
}
