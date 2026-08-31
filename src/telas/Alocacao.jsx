import { useEffect, useMemo, useRef, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Barras, Ponto, useRecibo } from '../comp/base'
import { comparar, distribuirAporteComReserva, cascatearSegmento, melhoresAtivosDaClasse } from '../lib/alocacao'
import { ROTULO_SITUACAO } from '../lib/teto'
import { fmtBRL, fmtMoeda, fmtPct, fmtPctSimples, fmtNum, paraNumero, corClasse, LISTA_CLASSES, SEGMENTOS_SUGERIDOS } from '../lib/formato'

const ABAS = [
  ['classe', 'Por classe'],
  ['segmento', 'Por segmento'],
  ['ativo', 'Por ativo'],
]

export default function Alocacao() {
  const d = useDados()
  const [aba, setAba] = useState('classe')
  return (
    <>
      <div className="abas">
        {ABAS.map(([k, r]) => (
          <button key={k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>{r}</button>
        ))}
      </div>
      {aba === 'classe' && <PorClasse d={d} />}
      {aba === 'segmento' && <PorSegmento d={d} />}
      {aba === 'ativo' && <PorAtivo d={d} />}
    </>
  )
}

/* ================================================================
   POR CLASSE
   ================================================================ */
function PorClasse({ d }) {
  const { calc, alvos, salvarAlvos, podeEscrever } = d
  const recibo = useRecibo()
  const total = calc.total.valor

  const [rascunho, setRascunho] = useState({})
  useEffect(() => {
    const m = {}
    alvos.filter(a => a.nivel === 'classe').forEach(a => { m[a.chave] = String(a.percentual).replace('.', ',') })
    setRascunho(m)
  }, [alvos])

  const [salvando, setSalvando] = useState(false)

  const alvosVivos = Object.entries(rascunho).map(([chave, v]) => ({ nivel: 'classe', chave, percentual: paraNumero(v) }))
  const soma = alvosVivos.reduce((s, a) => s + a.percentual, 0)
  const cmp = comparar(calc.classes, alvosVivos, total)

  async function salvar() {
    setSalvando(true)
    try {
      const semClasse = alvos.filter(a => a.nivel !== 'classe')
      await salvarAlvos([...semClasse, ...alvosVivos.filter(a => a.percentual > 0)])
      recibo('Alocação alvo salva.', 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setSalvando(false) }
  }

  const adicionar = c => setRascunho(r => ({ ...r, [c]: r[c] ?? '0' }))
  const remover = c => setRascunho(r => { const { [c]: _fora, ...resto } = r; return resto })
  const naoUsadas = LISTA_CLASSES.filter(c => !(c in rascunho))

  return (
    <>
      <Painel titulo="Alocação alvo" aoLado={
        <span className={Math.abs(soma - 100) < .01 ? 'pos' : 'neg'}>soma {fmtPctSimples(soma)}</span>}>
        <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 16, lineHeight: 1.6 }}>
          Defina o peso que cada classe deve ter na carteira. Não existe número certo — depende do seu
          horizonte e do quanto de oscilação você aguenta ver sem mexer.
        </p>
        <div className="rolagem">
          <table>
            <thead><tr>
              <th>Classe</th><th>Alvo</th><th>Atual</th><th>Desvio</th><th>Em reais</th><th>Valor hoje</th><th /></tr></thead>
            <tbody>{cmp.linhas.map(l => (
              <tr key={l.chave}>
                <td><Ponto classe={l.chave} />{l.chave}</td>
                <td>
                  {podeEscrever ? (
                    <input className="celula" style={{ width: 78 }} inputMode="decimal"
                      value={rascunho[l.chave] ?? ''}
                      onChange={e => setRascunho(r => ({ ...r, [l.chave]: e.target.value }))}
                      placeholder="0" />
                  ) : <span className="num">{fmtPctSimples(l.pctAlvo)}</span>}
                </td>
                <td className="n">{fmtPctSimples(l.pctAtual)}</td>
                <td className={'n ' + (Math.abs(l.desvioPp) < 1 ? 'nulo' : l.desvioPp > 0 ? 'neg' : 'pos')}>
                  {l.pctAlvo === 0 && l.pctAtual === 0 ? '—'
                    : `${l.desvioPp > 0 ? '+' : ''}${fmtNum(l.desvioPp, 1)}%`}
                </td>
                <td className={'n ' + (Math.abs(l.desvioRS) < 1 ? 'nulo' : l.desvioRS > 0 ? 'neg' : 'pos')}>
                  {l.pctAlvo === 0 ? '—' : fmtBRL(l.desvioRS)}
                </td>
                <td className="n">{fmtBRL(l.valor)}</td>
                <td>
                  {podeEscrever && l.chave in rascunho && (
                    <button className="btn mini vazio" title="Remover esta classe" onClick={() => remover(l.chave)}>×</button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        {naoUsadas.length > 0 && podeEscrever && (
          <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="rotulo">Incluir classe:</span>
            {naoUsadas.map(c => (
              <button key={c} className="btn mini vazio" onClick={() => adicionar(c)}>+ {c}</button>
            ))}
          </div>
        )}

        {podeEscrever && (
          <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn verde" onClick={salvar} disabled={salvando}>Salvar alocação alvo</button>
            {Math.abs(soma - 100) >= .01 && (
              <span style={{ fontSize: 12.5, color: 'var(--vermelho)' }}>
                Os alvos somam {fmtPctSimples(soma)}. Ajuste para 100% antes de confiar no simulador.
              </span>
            )}
          </div>
        )}
      </Painel>

      {total > 0 && cmp.linhas.some(l => l.pctAlvo > 0) && (
        <Painel titulo="Alvo contra realizado" aoLado="a barra mostra o atual, o traço mostra o alvo">
          <Barras marcador max={Math.max(...cmp.linhas.map(l => Math.max(l.pctAtual, l.pctAlvo)), 1)}
            itens={cmp.linhas.filter(l => l.pctAlvo > 0 || l.pctAtual > 0).map(l => ({
              chave: l.chave,
              rotulo: <><Ponto classe={l.chave} /><strong>{l.chave}</strong></>,
              direita: `${fmtPctSimples(l.pctAtual)} de ${fmtPctSimples(l.pctAlvo)}`,
              valor: l.pctAtual, alvo: l.pctAlvo, cor: corClasse(l.chave),
            }))} />
        </Painel>
      )}
    </>
  )
}

/* ================================================================
   POR SEGMENTO
   BBAS3 e BRBI11 são Ação, mas um é Banco, outro Serviços Financeiros.
   Aqui a pessoa etiqueta cada ativo com um segmento livre (Bancos,
   Energia, Shoppings…) e define o alvo do SEGMENTO — o app distribui
   esse alvo entre os ativos daquele segmento, proporcional ao peso
   atual de cada um. O resultado vira alvo por ativo de verdade,
   editável depois na aba ao lado.
   ================================================================ */
function PorSegmento({ d }) {
  const { calc, alvos, mapaSegmentos, segmentosPadrao, salvarSegmento, limparSegmento, salvarAlvos, podeEscrever } = d
  const recibo = useRecibo()
  const [salvando, setSalvando] = useState(false)
  const [tags, setTags] = useState({})

  useEffect(() => {
    const m = {}
    calc.abertas.forEach(p => { m[p.ticker] = mapaSegmentos[p.ticker] || '' })
    setTags(m)
  }, [calc.abertas, mapaSegmentos])

  const [rascunhoAlvo, setRascunhoAlvo] = useState({})
  // enquanto a pessoa está digitando aqui, uma etiqueta de segmento salva em
  // outro campo (que recarrega os dados sozinha, ao sair do campo) não pode
  // apagar o que ainda não foi salvo neste — por isso só resincroniza do
  // servidor quando não há edição pendente. A chave do rascunho é
  // "classe|segmento": o alvo agora é dentro da classe, então o mesmo nome
  // de segmento em duas classes precisa de duas entradas distintas.
  const rascunhoAlvoSujo = useRef(false)
  useEffect(() => {
    if (rascunhoAlvoSujo.current) return
    const m = {}
    alvos.filter(a => a.nivel === 'segmento' && a.classe_pai)
      .forEach(a => { m[a.classe_pai + '|' + a.chave] = String(a.percentual).replace('.', ',') })
    setRascunhoAlvo(m)
  }, [alvos])
  const mudarRascunhoAlvo = (chaveComposta, valor) => {
    rascunhoAlvoSujo.current = true
    setRascunhoAlvo(r => ({ ...r, [chaveComposta]: valor }))
  }

  // uma lista de sugestão por classe — os 15 segmentos comuns de Ação não
  // fazem sentido pra dentro de FII, e vice-versa. O que já foi usado
  // naquela classe entra junto, para não perder um nome customizado que
  // a pessoa já tenha digitado antes desta lista existir.
  const sugeridosPorClasse = useMemo(() => {
    const usados = {}
    calc.abertas.forEach(p => {
      const seg = mapaSegmentos[p.ticker]
      if (!seg) return
      if (!usados[p.classe]) usados[p.classe] = new Set()
      usados[p.classe].add(seg)
    })
    const classes = new Set([...Object.keys(SEGMENTOS_SUGERIDOS), ...Object.keys(usados)])
    const m = {}
    classes.forEach(c => {
      m[c] = [...new Set([...(SEGMENTOS_SUGERIDOS[c] || []), ...(usados[c] || [])])]
    })
    return m
  }, [calc.abertas, mapaSegmentos])

  const mapaClasseValor = useMemo(
    () => Object.fromEntries(calc.classes.map(c => [c.classe, c.valor])), [calc.classes])

  const porClasse = useMemo(() => {
    const m = new Map()
    calc.abertas.forEach(p => { (m.get(p.classe) || m.set(p.classe, []).get(p.classe)).push(p) })
    return [...m.entries()].sort((a, b) =>
      b[1].reduce((s, p) => s + (p.valorAtualBRL ?? 0), 0) - a[1].reduce((s, p) => s + (p.valorAtualBRL ?? 0), 0))
  }, [calc.abertas])

  // um segmento agora pertence a uma classe — dois ativos com a mesma
  // etiqueta de segmento mas classes diferentes viram dois grupos, não um.
  // A soma usa o valor já convertido para real (valorAtualBRL) — um ETF
  // Intern. cotado em dólar não pode somar direto com o resto, senão o
  // "% atual" da classe sai completamente errado.
  const porSegmento = useMemo(() => {
    const m = new Map()
    calc.abertas.forEach(p => {
      const seg = mapaSegmentos[p.ticker]
      if (!seg) return
      const chaveComposta = p.classe + '|' + seg
      if (!m.has(chaveComposta)) m.set(chaveComposta, { segmento: seg, classe: p.classe, itens: [], valor: 0 })
      const x = m.get(chaveComposta)
      x.itens.push(p); x.valor += (p.valorAtualBRL ?? 0)
    })
    return [...m.values()].sort((a, b) => b.valor - a.valor)
  }, [calc.abertas, mapaSegmentos])

  if (!calc.abertas.length) return (
    <Painel><Vazio><p>Sem posições em aberto para organizar por segmento.</p></Vazio></Painel>
  )

  const semSegmentoN = calc.abertas.filter(p => !mapaSegmentos[p.ticker]).length

  async function salvarTag(ticker, valorForcado) {
    const v = (valorForcado ?? tags[ticker] ?? '').trim()
    try {
      if (v) await salvarSegmento(ticker, v)
      else if (mapaSegmentos[ticker]) await limparSegmento(ticker)
    } catch (e) { recibo(e.message, 'erro') }
  }

  const alvosVivosSeg = Object.entries(rascunhoAlvo).map(([chaveComposta, v]) => {
    const i = chaveComposta.indexOf('|')
    return { nivel: 'segmento', classe_pai: chaveComposta.slice(0, i), chave: chaveComposta.slice(i + 1), percentual: paraNumero(v) }
  })

  // cada classe é sua própria mesa: alvo, atual e soma calculados só com o
  // que está dentro dela, sem misturar com o resto da carteira
  const porClasseComAlvo = porClasse.map(([classe]) => {
    const segmentosDaClasse = porSegmento.filter(s => s.classe === classe)
    const alvosDaClasse = alvosVivosSeg.filter(a => a.classe_pai === classe)
    // um alvo "órfão" (sem nenhum ativo etiquetado com esse nome de
    // segmento hoje — normalmente porque a etiqueta foi renomeada depois
    // de já ter um alvo salvo) não conta na soma: ele não vai virar alvo
    // de ativo nenhum, então contá-lo só infla a soma sem explicação
    const alvosValidos = alvosDaClasse.filter(a => segmentosDaClasse.some(s => s.segmento === a.chave))
    const somaClasse = alvosValidos.reduce((s, a) => s + a.percentual, 0)
    const classeTotal = mapaClasseValor[classe] || 0
    const linhas = segmentosDaClasse.map(s => {
      const alvoRow = alvosDaClasse.find(a => a.chave === s.segmento)
      const pctAlvo = alvoRow ? alvoRow.percentual : 0
      const pctAtual = classeTotal > 0 ? s.valor / classeTotal * 100 : 0
      return { ...s, pctAlvo, pctAtual, desvioPp: pctAtual - pctAlvo }
    })
    const orfaosClasse = alvosDaClasse.filter(a =>
      a.percentual > 0 && !segmentosDaClasse.some(s => s.segmento === a.chave))
    return { classe, linhas, somaClasse, orfaosClasse }
  }).filter(c => c.linhas.length > 0 || c.orfaosClasse.length > 0)

  async function salvarEAplicar() {
    setSalvando(true)
    try {
      const cascata = {}
      for (const a of alvosVivosSeg) {
        if (a.percentual <= 0) continue
        const grupo = porSegmento.find(s => s.classe === a.classe_pai && s.segmento === a.chave)
        if (!grupo || !grupo.itens.length) continue
        cascatearSegmento(grupo.itens, a.percentual).forEach(x => { cascata[x.ticker] = x.percentual })
      }
      const deClasse = alvos.filter(a => a.nivel === 'classe')
      // um alvo órfão (sem ativo etiquetado com esse segmento hoje) não é
      // salvo de novo — é assim que a sujeira de uma etiqueta renomeada
      // deixa de se arrastar de salvamento em salvamento
      const deSegmento = alvosVivosSeg.filter(a => a.percentual > 0 &&
        porSegmento.some(s => s.classe === a.classe_pai && s.segmento === a.chave))
      const tickersCascata = new Set(Object.keys(cascata))
      const deAtivoPreservado = alvos.filter(a => a.nivel === 'ativo' && !tickersCascata.has(a.chave))
      const deAtivoCascata = Object.entries(cascata).map(([chave, percentual]) => ({
        nivel: 'ativo', chave, percentual,
        classe_pai: (calc.abertas.find(p => p.ticker === chave) || {}).classe || null,
      }))
      await salvarAlvos([...deClasse, ...deSegmento, ...deAtivoPreservado, ...deAtivoCascata])
      rascunhoAlvoSujo.current = false
      recibo(deAtivoCascata.length
        ? `Alvos por segmento salvos e aplicados a ${deAtivoCascata.length} ativo${deAtivoCascata.length === 1 ? '' : 's'}.`
        : 'Alvos por segmento salvos.', 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setSalvando(false) }
  }

  return (
    <>
      <Painel titulo="Classificar por segmento" aoLado={semSegmentoN > 0 ? `${semSegmentoN} sem segmento ainda` : 'todos classificados'}>
        <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 16, lineHeight: 1.6 }}>
          Dentro de cada classe, agrupe os ativos por segmento. Ação e FII já vêm com uma lista de
          segmentos comuns pré-preenchida como sugestão — é só começar a digitar e escolher. Continua
          sendo texto livre: dá pra escrever um nome diferente se preferir, e ele também vira sugestão
          nas próximas linhas.
        </p>
        {porClasse.map(([classe, itens]) => (
          <div key={classe} style={{ marginBottom: 20 }}>
            <div className="rotulo" style={{ marginBottom: 8 }}><Ponto classe={classe} />{classe}</div>
            <div className="rolagem">
              <table>
                <thead><tr><th>Ativo</th><th style={{ textAlign: 'left' }}>Segmento</th><th>Valor hoje</th></tr></thead>
                <tbody>{itens.map(p => (
                  <tr key={p.ticker}>
                    <td><span className="ticker">{p.ticker}</span></td>
                    <td>
                      {podeEscrever ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <input className="celula" list={'lista-segmentos-' + classe} style={{ width: 220, textAlign: 'left' }}
                            value={tags[p.ticker] ?? ''} placeholder="ex.: Bancos e Serviços Financeiros"
                            onChange={e => setTags(t => ({ ...t, [p.ticker]: e.target.value }))}
                            onBlur={() => salvarTag(p.ticker)} />
                          {!mapaSegmentos[p.ticker] && segmentosPadrao[p.ticker] && (
                            <button className="btn mini vazio" type="button" onClick={() => {
                              setTags(t => ({ ...t, [p.ticker]: segmentosPadrao[p.ticker] }))
                              salvarTag(p.ticker, segmentosPadrao[p.ticker])
                            }}>usar {segmentosPadrao[p.ticker]}</button>
                          )}
                        </div>
                      ) : (mapaSegmentos[p.ticker] || <span className="nulo">—</span>)}
                    </td>
                    <td className="n">{fmtMoeda(p.valorAtual, p.moeda)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <datalist id={'lista-segmentos-' + classe}>
              {(sugeridosPorClasse[classe] || []).map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
        ))}
      </Painel>

      <Painel titulo="Alvo por segmento" aoLado="soma 100% dentro de cada classe, não da carteira inteira">
        <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 16, lineHeight: 1.6 }}>
          O percentual é sobre a classe, não sobre a carteira inteira — os segmentos de Ação somam 100%
          entre si, os de FII somam 100% entre si, cada classe é sua própria conta. Ao salvar, cada
          segmento é repartido <strong>em partes iguais</strong> entre os ativos que você etiquetou acima
          — 25% para Bancos com dois bancos vira 12,5% para cada um, não importa quanto você já tem de
          cada — e o resultado vira o alvo individual deles, que você ainda pode ajustar na aba
          "Por ativo" (que segue essa mesma regra: soma 100% dentro da classe).
        </p>
        {porClasseComAlvo.length === 0 ? (
          <Vazio><p>Etiquete pelo menos um ativo com um segmento, acima, para começar.</p></Vazio>
        ) : porClasseComAlvo.map(({ classe, linhas, somaClasse, orfaosClasse }) => (
          <div key={classe} style={{ marginBottom: 24 }}>
            <div className="rotulo" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><Ponto classe={classe} />{classe}</span>
              <span className={Math.abs(somaClasse - 100) < 0.01 ? 'pos' : somaClasse > 0 ? 'neg' : 'nulo'}>
                soma {fmtPctSimples(somaClasse)} de {classe}
              </span>
            </div>
            <div className="rolagem">
              <table style={{ tableLayout: 'fixed' }}>
                <thead><tr>
                  <th style={{ width: 220, textAlign: 'left' }}>Segmento</th>
                  <th style={{ width: 90 }}>Alvo</th><th style={{ width: 90 }}>Atual</th>
                  <th style={{ width: 100 }}>Desvio</th><th style={{ textAlign: 'left' }}>Ativos</th>
                </tr></thead>
                <tbody>{linhas.map(s => (
                  <tr key={s.segmento}>
                    <td style={{ textAlign: 'left' }}>{s.segmento}</td>
                    <td>
                      {podeEscrever ? (
                        <input className="celula" style={{ width: 78 }} inputMode="decimal"
                          value={rascunhoAlvo[classe + '|' + s.segmento] ?? ''} placeholder="0"
                          onChange={e => mudarRascunhoAlvo(classe + '|' + s.segmento, e.target.value)} />
                      ) : <span className="num">{fmtPctSimples(s.pctAlvo)}</span>}
                    </td>
                    <td className="n">{fmtPctSimples(s.pctAtual)}</td>
                    <td className={'n ' + (Math.abs(s.desvioPp) < 1 ? 'nulo' : s.desvioPp > 0 ? 'neg' : 'pos')}>
                      {s.pctAlvo === 0 && s.pctAtual === 0 ? '—' : `${s.desvioPp > 0 ? '+' : ''}${fmtNum(s.desvioPp, 1)}%`}
                    </td>
                    <td style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--tinta-3)' }}>
                      {s.itens.map(i => i.ticker).join(', ')}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {orfaosClasse.length > 0 && (
              <div className="aviso atencao" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>
                  {orfaosClasse.map(o => o.chave).join(', ')} {orfaosClasse.length === 1 ? 'tem' : 'têm'} alvo
                  dentro de {classe} mas nenhum ativo etiquetado ainda — nada será aplicado para{' '}
                  {orfaosClasse.length === 1 ? 'ele' : 'eles'}.
                </span>
                {podeEscrever && (
                  <button className="btn mini vazio" onClick={() => {
                    rascunhoAlvoSujo.current = true
                    setRascunhoAlvo(r => {
                      const novo = { ...r }
                      orfaosClasse.forEach(o => { delete novo[classe + '|' + o.chave] })
                      return novo
                    })
                  }}>Limpar {orfaosClasse.length === 1 ? 'este' : 'estes'}</button>
                )}
              </div>
            )}
          </div>
        ))}
        {podeEscrever && porClasseComAlvo.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button className="btn verde" onClick={salvarEAplicar} disabled={salvando}>
              {salvando ? 'Aplicando…' : 'Salvar e aplicar aos ativos'}
            </button>
          </div>
        )}
      </Painel>
    </>
  )
}

/* ================================================================
   POR ATIVO
   ================================================================ */
function PorAtivo({ d }) {
  const { calc, alvos, salvarAlvos, podeEscrever } = d
  const recibo = useRecibo()
  const [rascunho, setRascunho] = useState({})

  useEffect(() => {
    const m = {}
    alvos.filter(a => a.nivel === 'ativo').forEach(a => { m[a.chave] = String(a.percentual).replace('.', ',') })
    setRascunho(m)
  }, [alvos])

  if (!calc.abertas.length) return (
    <Painel><Vazio><p>Sem posições em aberto para definir alvo por ativo.</p></Vazio></Painel>
  )

  const mapaClasseValor = Object.fromEntries(calc.classes.map(c => [c.classe, c.valor]))

  const porClasse = (() => {
    const m = new Map()
    calc.abertas.forEach(p => { (m.get(p.classe) || m.set(p.classe, []).get(p.classe)).push(p) })
    return [...m.entries()].sort((a, b) =>
      b[1].reduce((s, p) => s + p.valorAtual, 0) - a[1].reduce((s, p) => s + p.valorAtual, 0))
  })()

  async function salvar() {
    const semAtivo = alvos.filter(a => a.nivel !== 'ativo')
    const deAtivo = Object.entries(rascunho)
      .map(([chave, v]) => ({
        nivel: 'ativo', chave, percentual: paraNumero(v),
        classe_pai: (calc.abertas.find(p => p.ticker === chave) || {}).classe || null,
      }))
      .filter(a => a.percentual > 0)
    try {
      await salvarAlvos([...semAtivo, ...deAtivo])
      recibo('Alvos por ativo salvos.', 'ok')
    } catch (e) { recibo(e.message, 'erro') }
  }

  return (
    <Painel titulo="Alvo por ativo" aoLado="soma 100% dentro de cada classe, não da carteira inteira">
      <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 16, lineHeight: 1.6 }}>
        Percentual sobre a classe, não sobre a carteira inteira — os ativos de Ação somam 100% entre si,
        os de FII somam 100% entre si. Deixe em branco os ativos que você não quer travar num peso
        específico. Ativos cujo alvo veio da aba "Por segmento" aparecem aqui já preenchidos — edite à
        vontade, o ajuste manual sempre vence.
      </p>
      {porClasse.map(([classe, itensClasse]) => {
        const classeTotal = mapaClasseValor[classe] || 0
        const somaClasse = itensClasse.reduce((s, p) => s + paraNumero(rascunho[p.ticker]), 0)
        return (
          <div key={classe} style={{ marginBottom: 24 }}>
            <div className="rotulo" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><Ponto classe={classe} />{classe}</span>
              <span className={Math.abs(somaClasse - 100) < 0.01 ? 'pos' : somaClasse > 100.01 ? 'neg' : ''}>
                soma {fmtPctSimples(somaClasse)} de {classe}
              </span>
            </div>
            <div className="rolagem">
              <table style={{ tableLayout: 'fixed' }}>
                <thead><tr>
                  <th style={{ width: 100 }}>Ativo</th><th style={{ width: 90 }}>Alvo</th>
                  <th style={{ width: 90 }}>Atual</th><th style={{ width: 100 }}>Desvio</th>
                  <th style={{ width: 110 }}>Em reais</th><th>Valor hoje</th>
                </tr></thead>
                <tbody>{itensClasse.map(p => {
                  const alvo = paraNumero(rascunho[p.ticker])
                  const valorBRL = p.valorAtualBRL ?? 0
                  const fatiaClasse = classeTotal > 0 ? valorBRL / classeTotal * 100 : 0
                  const desvio = fatiaClasse - alvo
                  const desvioRS = valorBRL - classeTotal * alvo / 100
                  return (
                    <tr key={p.ticker}>
                      <td><span className="ticker">{p.ticker}</span></td>
                      <td>{podeEscrever ? (
                        <input className="celula" style={{ width: 78 }} inputMode="decimal"
                          value={rascunho[p.ticker] ?? ''} placeholder="—"
                          onChange={e => setRascunho(r => ({ ...r, [p.ticker]: e.target.value }))} />
                      ) : <span className="num">{alvo ? fmtPctSimples(alvo) : '—'}</span>}</td>
                      <td className="n">{fmtPctSimples(fatiaClasse)}</td>
                      <td className={'n ' + (!alvo ? 'nulo' : Math.abs(desvio) < 1 ? 'nulo' : desvio > 0 ? 'neg' : 'pos')}>
                        {alvo ? `${desvio > 0 ? '+' : ''}${fmtNum(desvio, 1)}%` : '—'}
                      </td>
                      <td className={'n ' + (!alvo ? 'nulo' : desvioRS > 0 ? 'neg' : 'pos')}>
                        {alvo ? fmtBRL(desvioRS) : '—'}
                      </td>
                      <td className="n">{fmtMoeda(p.valorAtual, p.moeda)}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </div>
        )
      })}
      {podeEscrever && (
        <div style={{ marginTop: 6 }}>
          <button className="btn verde" onClick={salvar}>Salvar alvos por ativo</button>
        </div>
      )}
    </Painel>
  )
}

/* ================================================================
   RESERVA DE EMERGÊNCIA
   Não é posição de carteira — é dinheiro de liquidez diária, fora da
   bolsa. O app só guarda meta e valor atual; quem atualiza é você,
   do mesmo jeito que atualizaria um saldo de caixinha no banco.
   ================================================================ */
export function Reserva({ d }) {
  const { reserva, salvarReserva, podeEscrever } = d
  const recibo = useRecibo()
  const [meta, setMeta] = useState('')
  const [atual, setAtual] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setMeta(reserva ? String(reserva.meta).replace('.', ',') : '')
    setAtual(reserva ? String(reserva.atual).replace('.', ',') : '')
  }, [reserva])

  const metaN = paraNumero(meta), atualN = paraNumero(atual)
  const falta = Math.max(0, metaN - atualN)
  const pctCompleto = metaN > 0 ? Math.min(100, atualN / metaN * 100) : 0
  const completa = metaN > 0 && atualN >= metaN

  async function salvar() {
    setSalvando(true)
    try {
      await salvarReserva(metaN, atualN)
      recibo('Reserva atualizada.', 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setSalvando(false) }
  }

  return (
    <>
      <Painel titulo="Por que ter uma reserva antes de investir" aoLado="a rede de segurança vem primeiro">
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p style={{ marginBottom: 12 }}>
            A reserva de emergência é dinheiro parado, de propósito. Ela existe para um imprevisto — perda
            de renda, uma conta médica, o carro quebrar — sem que você precise vender uma ação ou um FII
            no momento errado, com o preço lá embaixo, só porque precisava do dinheiro naquela hora.
          </p>
          <p style={{ marginBottom: 12 }}>
            A régua mais comum: <strong>6 meses de custo fixo mensal</strong> para quem é CLT, com renda
            mais previsível, e <strong>12 meses</strong> para quem é autônomo ou tem renda variável. É
            ponto de partida, não lei — ajuste ao que te deixa tranquilo.
          </p>
          <p>
            Guarde num lugar de <strong>liquidez diária</strong> — resgate hoje, sem carência — como um
            CDB 100% do CDI com liquidez diária, Tesouro Selic, ou uma "caixinha" do seu banco. O ponto não
            é o rendimento, é conseguir sacar sem esperar nem perder valor. Renda variável, bolsa ou
            qualquer coisa que possa estar em queda no dia em que você precisar do dinheiro não serve
            para isso.
          </p>
        </div>
      </Painel>

      <Painel titulo="Sua reserva" aoLado={completa ? <span className="pos">completa</span> : `${fmtPctSimples(pctCompleto, 0)} do caminho`}>
        <div className="grade" style={{ marginBottom: 6 }}>
          <label className="campo">
            <span className="rotulo">Meta (custo fixo × meses que você escolher)</span>
            <input type="number" step="any" min="0" value={meta} placeholder="0,00" disabled={!podeEscrever}
              onChange={e => setMeta(e.target.value)} />
          </label>
          <label className="campo">
            <span className="rotulo">Quanto já tem guardado</span>
            <input type="number" step="any" min="0" value={atual} placeholder="0,00" disabled={!podeEscrever}
              onChange={e => setAtual(e.target.value)} />
          </label>
        </div>

        {metaN > 0 && (
          <div className="trilho" style={{ marginBottom: 14 }}>
            <i style={{ width: `${Math.max(1.5, pctCompleto)}%`, background: completa ? 'var(--verde)' : 'var(--ambar)' }} />
          </div>
        )}

        <div className="cartoes" style={{ marginBottom: 6 }}>
          <div className="cartao"><div className="rotulo">Guardado</div><div className="v pos">{fmtBRL(atualN)}</div></div>
          <div className="cartao"><div className="rotulo">Meta</div><div className="v">{fmtBRL(metaN)}</div></div>
          <div className="cartao"><div className="rotulo">Falta</div>
            <div className={'v ' + (completa ? 'pos' : '')}>{completa ? 'nada — completa' : fmtBRL(falta)}</div></div>
        </div>

        {podeEscrever && (
          <button className="btn verde" onClick={salvar} disabled={salvando} style={{ marginTop: 12 }}>
            {salvando ? 'Salvando…' : 'Salvar reserva'}
          </button>
        )}
        <p className="dica" style={{ marginTop: 14 }}>
          Este número não vem de lugar nenhum sozinho — o app não enxerga a conta do seu banco. Atualize
          aqui do mesmo jeito que atualizaria uma planilha, sempre que guardar ou usar algo da reserva.
        </p>
      </Painel>
    </>
  )
}

/* ================================================================
   SIMULADOR DE APORTE
   Usa os alvos já salvos nas outras abas. Primeiro decide quanto do
   aporte vai para a reserva de emergência, se ela ainda não estiver
   completa; o resto é distribuído entre as classes deficitárias, e
   dentro de cada uma, ranqueia os ativos pelo preço teto e pelo alvo
   individual que você já configurou.
   ================================================================ */
export function Simulador({ d, ir }) {
  const { calc, alvos, reserva, premissas, taxasCambio } = d
  const total = calc.total.valor
  const cmp = comparar(calc.classes, alvos.filter(a => a.nivel === 'classe'), total)

  const [aporte, setAporte] = useState('')
  const [dividirComReserva, setDividirComReserva] = useState(false)
  const [pctReserva, setPctReserva] = useState('70')
  // quantidade que a pessoa decidiu comprar de cada ativo, de fato — o
  // valor sugerido é só um ponto de partida, quem manda é o que ela digita
  const [quantidades, setQuantidades] = useState({})

  const metaReserva = reserva ? paraNumero(reserva.meta) : 0
  const reservaIncompleta = metaReserva > 0 && paraNumero(reserva?.atual) < metaReserva
  const fracaoReserva = !reservaIncompleta ? 0 : (dividirComReserva ? paraNumero(pctReserva) : 100)

  const dist = distribuirAporteComReserva(cmp.linhas, total, aporte, reserva, fracaoReserva)

  const semAlvoClasse = !cmp.linhas.some(l => l.pctAlvo > 0)

  // Para ativo em dólar, o que a pessoa digita é o VALOR em dólar que vai
  // aplicar (é assim que corretora de fracionário funciona — "US$30 em
  // VOO"), não a quantidade de cotas; a quantidade sai calculada a partir
  // disso. Para os demais, continua sendo a quantidade de cotas mesmo.
  const valorEmBRL = (ticker) => {
    const q = paraNumero(quantidades[ticker])
    if (!q) return 0
    const ativo = calc.abertas.find(p => p.ticker === ticker)
    if (!ativo) return 0
    if (ativo.moeda !== 'USD') return q * ativo.precoAtual
    return taxasCambio.USD ? q * taxasCambio.USD : 0
  }
  const totalDecidido = Object.keys(quantidades).reduce((s, t) => s + valorEmBRL(t), 0)
  const temAtivoSemTaxa = Object.keys(quantidades).some(t => {
    const ativo = calc.abertas.find(p => p.ticker === t)
    return paraNumero(quantidades[t]) > 0 && ativo?.moeda === 'USD' && !taxasCambio.USD
  })

  return (
    <Painel>
      <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 14, lineHeight: 1.6 }}>
        Digite quanto vai investir. Rebalancear comprando evita imposto sobre ganho e costuma bastar quando
        você aporta com alguma regularidade — o simulador nunca sugere vender.
      </p>

      <label className="campo" style={{ maxWidth: 240 }}>
        <span className="rotulo">Valor do aporte</span>
        <input type="number" step="any" min="0" value={aporte} placeholder="0,00"
          onChange={e => setAporte(e.target.value)} />
      </label>

      {reservaIncompleta && (
        <div className="aviso atencao" style={{ marginBottom: 16, maxWidth: 820 }}>
          <strong>Sua reserva de emergência ainda não está completa</strong>{' '}
          (faltam {fmtBRL(metaReserva - paraNumero(reserva?.atual))}).
          Por padrão, este aporte vai inteiro para lá antes de qualquer coisa — é o que a maioria dos
          educadores financeiros recomenda: rede de segurança primeiro.
          <div style={{ marginTop: 10 }}>
            <label className="linha-cheque">
              <input type="checkbox" checked={dividirComReserva} onChange={e => setDividirComReserva(e.target.checked)} />
              Prefiro dividir uma parte para investir mesmo assim
            </label>
          </div>
          {dividirComReserva && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="number" min="0" max="100" step="1" value={pctReserva}
                onChange={e => setPctReserva(e.target.value)} style={{ width: 70 }}
                className="celula" />
              <span style={{ fontSize: 12.5 }}>% do aporte vai para a reserva; o resto para investir.
                Setenta por cento é um ponto de partida comum entre quem quer ir criando o hábito de
                investir sem abandonar a reserva — ajuste ao que fizer sentido pra você.</span>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button className="btn mini vazio" onClick={() => ir('reserva')}>Ver/editar reserva</button>
          </div>
        </div>
      )}

      {paraNumero(aporte) > 0 && dist.paraReserva > 0.005 && (
        <div className="aviso info" style={{ marginBottom: 14, maxWidth: 820 }}>
          <strong>{fmtBRL(dist.paraReserva)}</strong> deste aporte é sugestão para a reserva de emergência
          — guarde em algo de liquidez diária, como fez com sua caixinha, não na corretora.
          {dist.faltaReserva > 0.005 && ` Depois disso ainda faltam ${fmtBRL(dist.faltaReserva)} para completá-la.`}
        </div>
      )}

      {semAlvoClasse ? (
        paraNumero(aporte) > 0 && <div className="aviso info">Defina os percentuais alvo em "Por classe" para o simulador ter o que distribuir.</div>
      ) : dist.paraInvestir > 0.005 && dist.destinos.length > 0 ? (
        <>
          <div className="rolagem" style={{ marginTop: 6 }}>
            <table>
              <thead><tr><th>Classe</th><th>Aplicar</th><th>Do investimento</th><th>Situação depois</th></tr></thead>
              <tbody>{dist.destinos.map(dd => {
                const l = cmp.linhas.find(x => x.chave === dd.chave)
                const depois = (l.valor + dd.valor) / (total + dist.paraInvestir) * 100
                return (
                  <tr key={dd.chave}>
                    <td><Ponto classe={dd.chave} />{dd.chave}</td>
                    <td className="n"><strong>{fmtBRL(dd.valor)}</strong></td>
                    <td className="n">{fmtPctSimples(dd.pctDoAporte)}</td>
                    <td className="n">{fmtPctSimples(depois)} de {fmtPctSimples(l.pctAlvo)}</td>
                  </tr>
                )
              })}</tbody>
              <tfoot><tr>
                <td>Total investido</td><td>{fmtBRL(dist.paraInvestir - dist.sobra)}</td><td colSpan={2} />
              </tr></tfoot>
            </table>
          </div>
          <div className={'aviso ' + (dist.alcancaAlvo ? 'ok' : 'atencao')} style={{ marginTop: 14, marginBottom: 20 }}>
            {dist.alcancaAlvo
              ? 'Esta parte do aporte é suficiente para colocar todas as classes no alvo.'
              : 'Não fecha todos os déficits — foi rateado proporcionalmente ao tamanho de cada um.'}
          </div>

          {dist.destinos.map(dd => (
            <SugestaoDaClasse key={dd.chave} classe={dd.chave} valorClasse={dd.valor} calc={calc}
              premissas={premissas} alvos={alvos} taxasCambio={taxasCambio}
              quantidades={quantidades} setQuantidades={setQuantidades} />
          ))}

          <div className="cartao" style={{ marginTop: 6, borderColor: totalDecidido > dist.paraInvestir + 0.01 ? 'var(--vermelho)' : undefined }}>
            <div className="rotulo">Total do que você decidiu comprar</div>
            <div className="v">{fmtBRL(totalDecidido)}</div>
            <div className="p">
              de {fmtBRL(dist.paraInvestir)} disponíveis para investir
              {totalDecidido > dist.paraInvestir + 0.01 && (
                <span className="neg"> — passou {fmtBRL(totalDecidido - dist.paraInvestir)} do combinado</span>
              )}
            </div>
            {temAtivoSemTaxa && (
              <div className="aviso atencao" style={{ marginTop: 10 }}>
                Há quantidade digitada para um ativo em dólar sem taxa de câmbio cadastrada — ele não entra
                nesta soma até você buscar ou digitar o câmbio em Cotações.
              </div>
            )}
          </div>
        </>
      ) : paraNumero(aporte) > 0 ? (
        <div className="aviso ok">Este aporte cobre a reserva por inteiro — nada sobra para investir desta vez.</div>
      ) : null}
    </Painel>
  )
}

/**
 * Dentro de uma classe que vai receber aporte, ranqueia os ativos por
 * preço teto e alvo individual, sugere quantas cotas comprar de cada, e
 * deixa a pessoa digitar a quantidade real que vai levar — o campo de
 * sugestão é só um ponto de partida, quem decide o total é ela.
 *
 * Sem preço teto nem alvo por ativo configurados, a ordem não tem
 * critério nenhum por trás — mas a lista continua aparecendo mesmo assim,
 * dividindo o aporte em partes iguais entre os ativos da classe. Deixar
 * de sugerir nada porque falta uma premissa seria pior do que sugerir
 * sem prioridade nenhuma e avisar disso claramente.
 */
function SugestaoDaClasse({ classe, valorClasse, calc, premissas, alvos, taxasCambio, quantidades, setQuantidades }) {
  const ativos = calc.abertas.filter(p => p.classe === classe)
  if (!ativos.length) return null
  const rank = melhoresAtivosDaClasse(ativos, premissas, alvos).slice(0, 5)
  const temAlgumSinal = rank.some(r => r.temSinal)
  // se a classe é em dólar, a pessoa digita o VALOR em dólar que vai
  // aplicar em cada ativo — é assim que corretora de fracionário funciona
  // ("US$30 em VOO") — e a quantidade de cotas sai calculada sozinha
  const ehDolar = ativos[0]?.moeda === 'USD'

  // reparte o valor da classe (sempre em real) entre os ranqueados:
  // proporcional aos pontos quando há algum critério; em partes iguais
  // quando não há nenhum. Só depois converte pra moeda nativa do ativo,
  // porque dividir um valor em real direto pelo preço em dólar dá conta
  // errada — precisa converter primeiro.
  const somaPontos = rank.reduce((s, r) => s + r.pontos, 0)
  const comValor = rank.map(r => {
    const fatia = temAlgumSinal && somaPontos > 0 ? r.pontos / somaPontos : 1 / rank.length
    const valorSugeridoBRL = valorClasse * fatia
    const ativo = ativos.find(p => p.ticker === r.ticker)
    const moeda = ativo?.moeda || 'BRL'
    const semTaxa = moeda === 'USD' && !taxasCambio.USD
    const valorSugeridoNativo = moeda === 'USD' ? (semTaxa ? null : valorSugeridoBRL / taxasCambio.USD) : valorSugeridoBRL
    const cotasSugeridas = valorSugeridoNativo != null && ativo?.precoAtual > 0 ? valorSugeridoNativo / ativo.precoAtual : null
    return { ...r, valorSugeridoNativo, cotasSugeridas, moeda, precoAtual: ativo?.precoAtual, semTaxa }
  })

  const subtotalBRL = comValor.reduce((s, r) => {
    const q = paraNumero(quantidades[r.ticker])
    if (!q) return s
    if (r.moeda !== 'USD') return s + q * (r.precoAtual || 0)
    return s + (taxasCambio.USD ? q * taxasCambio.USD : 0)
  }, 0)

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="rotulo" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>Dentro de {classe}, considere primeiro</span>
        <span>subtotal decidido: {fmtBRL(subtotalBRL)}</span>
      </div>
      {!temAlgumSinal && (
        <div className="aviso info" style={{ marginBottom: 10 }}>
          Nenhum ativo de {classe} tem preço teto ou alvo individual configurado — a divisão abaixo é
          igual entre eles, sem prioridade nenhuma por trás. Configure em Preço Teto ou em "Por ativo"
          para o simulador conseguir apontar por qual começar.
        </div>
      )}
      <div className="rolagem">
        <table>
          <thead><tr>
            <th>Ativo</th><th>Situação do teto</th><th>Desconto</th><th>Do próprio alvo</th>
            <th>Sugestão</th><th>Cotas sugeridas</th>
            <th>{ehDolar ? 'Vou aplicar (US$)' : 'Vou comprar'}</th>
            <th>{ehDolar ? 'Cotas resultantes' : 'Total'}</th>
          </tr></thead>
          <tbody>{comValor.map(r => {
            const rot = ROTULO_SITUACAO[r.situacao]
            const qtd = quantidades[r.ticker] ?? ''
            const qtdNum = paraNumero(qtd)
            // em dólar, o campo é o valor aplicado — a quantidade de cotas
            // sai calculada; nos demais, o campo já é a própria quantidade
            const cotasResultantes = ehDolar && qtdNum > 0 && r.precoAtual > 0 ? qtdNum / r.precoAtual : null
            const totalLinha = !ehDolar && qtdNum > 0 && r.precoAtual > 0 ? qtdNum * r.precoAtual : null
            return (
              <tr key={r.ticker}>
                <td><span className="ticker">{r.ticker}</span></td>
                <td>{r.teto != null
                  ? <span className="tag" style={{ color: rot.cor, borderColor: rot.cor }}>{rot.texto}</span>
                  : <span className="nulo">sem premissa</span>}</td>
                <td className={'n ' + (r.desconto == null ? 'nulo' : r.desconto >= 0 ? 'pos' : 'neg')}>
                  {r.desconto == null ? '—' : fmtPct(r.desconto, 1)}
                </td>
                <td className={'n ' + (r.desvioAlvo == null ? 'nulo' : r.desvioAlvo > 0 ? 'pos' : 'nulo')}>
                  {r.desvioAlvo == null ? '—' : `${r.desvioAlvo > 0 ? 'faltam ' : ''}${fmtNum(Math.abs(r.desvioAlvo), 1)}%`}
                </td>
                <td className="n">{r.semTaxa ? <span className="nulo">sem câmbio</span> : fmtMoeda(r.valorSugeridoNativo, r.moeda)}</td>
                <td className="n">{r.cotasSugeridas != null ? fmtNum(r.cotasSugeridas, r.cotasSugeridas < 1 ? 4 : 2) : <span className="nulo">—</span>}</td>
                <td>
                  <input type="number" step="any" min="0" className="celula" style={{ width: 80 }}
                    value={qtd} placeholder={ehDolar ? '0,00' : '0'}
                    onChange={e => setQuantidades(q => ({ ...q, [r.ticker]: e.target.value }))} />
                </td>
                <td className="n">
                  {ehDolar
                    ? (cotasResultantes != null ? fmtNum(cotasResultantes, cotasResultantes < 1 ? 4 : 2) : '—')
                    : (totalLinha != null ? fmtMoeda(totalLinha, r.moeda) : '—')}
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <p className="dica" style={{ marginTop: 6 }}>
        {temAlgumSinal
          ? 'Ordem e sugestão baseadas só no que você configurou: desconto sobre o preço teto e distância até o alvo por ativo. Não é uma recomendação de compra.'
          : ehDolar
            ? 'Digite quanto em dólar vai aplicar em cada um — a quantidade de cotas sai calculada sozinha ao lado.'
            : 'A quantidade sugerida é aproximada — o campo "Vou comprar" é onde você registra o que decidiu de fato, fração ou não.'}
      </p>
    </div>
  )
}
