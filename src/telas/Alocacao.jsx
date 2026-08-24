import { useEffect, useMemo, useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, Barras, Ponto, useRecibo } from '../comp/base'
import { comparar, distribuirAporte } from '../lib/alocacao'
import { fmtBRL, fmtPctSimples, fmtNum, paraNumero, corClasse, LISTA_CLASSES } from '../lib/formato'

export default function Alocacao() {
  const { calc, alvos, salvarAlvos, podeEscrever } = useDados()
  const [aba, setAba] = useState('classe')
  return (
    <>
      <div className="abas">
        <button className={aba === 'classe' ? 'ativo' : ''} onClick={() => setAba('classe')}>Por classe</button>
        <button className={aba === 'ativo' ? 'ativo' : ''} onClick={() => setAba('ativo')}>Por ativo</button>
      </div>
      {aba === 'classe'
        ? <PorClasse calc={calc} alvos={alvos} salvarAlvos={salvarAlvos} podeEscrever={podeEscrever} />
        : <PorAtivo calc={calc} alvos={alvos} salvarAlvos={salvarAlvos} podeEscrever={podeEscrever} />}
    </>
  )
}

/* ------------------------------------------------------------------ */

function PorClasse({ calc, alvos, salvarAlvos, podeEscrever }) {
  const recibo = useRecibo()
  const total = calc.total.valor

  // classes presentes na carteira, mais as que já têm alvo, mais as sugeridas
  const universo = useMemo(() => {
    const s = new Set([
      ...calc.classes.map(c => c.classe),
      ...alvos.filter(a => a.nivel === 'classe').map(a => a.chave),
    ])
    if (!s.size) ['Ação', 'FII', 'Renda Fixa'].forEach(c => s.add(c))
    return [...s]
  }, [calc.classes, alvos])

  const [rascunho, setRascunho] = useState({})
  useEffect(() => {
    const m = {}
    alvos.filter(a => a.nivel === 'classe').forEach(a => { m[a.chave] = String(a.percentual).replace('.', ',') })
    setRascunho(m)
  }, [alvos])

  const [salvando, setSalvando] = useState(false)
  const [aporte, setAporte] = useState('')

  const alvosVivos = Object.entries(rascunho)
    .map(([chave, v]) => ({ nivel: 'classe', chave, percentual: paraNumero(v) }))
    .filter(a => a.percentual > 0)
  const soma = alvosVivos.reduce((s, a) => s + a.percentual, 0)
  const cmp = comparar(calc.classes, alvosVivos, total)
  const dist = distribuirAporte(cmp.linhas, total, aporte)

  async function salvar() {
    setSalvando(true)
    try {
      await salvarAlvos(alvosVivos)
      recibo('Alocação alvo salva.', 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setSalvando(false) }
  }

  const adicionar = c => setRascunho(r => ({ ...r, [c]: r[c] ?? '0' }))
  const naoUsadas = LISTA_CLASSES.filter(c => !(c in rascunho))

  return (
    <>
      <Painel titulo="Alocação alvo" aoLado={
        <span className={Math.abs(soma - 100) < .01 ? 'pos' : 'neg'}>soma {fmtPctSimples(soma)}</span>}>
        <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 16, maxWidth: 620, lineHeight: 1.6 }}>
          Defina o peso que cada classe deve ter na carteira. Não existe número certo — depende do seu
          horizonte e do quanto de oscilação você aguenta ver sem mexer.
        </p>
        <div className="rolagem">
          <table>
            <thead><tr>
              <th>Classe</th><th>Alvo</th><th>Atual</th><th>Desvio</th><th>Em reais</th><th>Valor hoje</th>
            </tr></thead>
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
                    : `${l.desvioPp > 0 ? '+' : ''}${fmtNum(l.desvioPp, 1)} p.p.`}
                </td>
                <td className={'n ' + (Math.abs(l.desvioRS) < 1 ? 'nulo' : l.desvioRS > 0 ? 'neg' : 'pos')}>
                  {l.pctAlvo === 0 ? '—' : fmtBRL(l.desvioRS)}
                </td>
                <td className="n">{fmtBRL(l.valor)}</td>
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

      <Painel titulo="Simulador de aporte" aoLado="só compra, nunca venda">
        <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 14, maxWidth: 620, lineHeight: 1.6 }}>
          Digite quanto vai investir e o app distribui pelas classes que estão abaixo do alvo. Rebalancear
          comprando evita imposto sobre ganho e costuma bastar quando você aporta com alguma regularidade.
        </p>
        <label className="campo" style={{ maxWidth: 240 }}>
          <span className="rotulo">Valor do aporte</span>
          <input type="number" step="any" min="0" value={aporte} placeholder="0,00"
            onChange={e => setAporte(e.target.value)} />
        </label>

        {dist.destinos.length > 0 ? (
          <>
            <div className="rolagem" style={{ marginTop: 6 }}>
              <table>
                <thead><tr><th>Classe</th><th>Aplicar</th><th>Do aporte</th><th>Situação depois</th></tr></thead>
                <tbody>{dist.destinos.map(d => {
                  const l = cmp.linhas.find(x => x.chave === d.chave)
                  const depois = (l.valor + d.valor) / (total + paraNumero(aporte)) * 100
                  return (
                    <tr key={d.chave}>
                      <td><Ponto classe={d.chave} />{d.chave}</td>
                      <td className="n"><strong>{fmtBRL(d.valor)}</strong></td>
                      <td className="n">{fmtPctSimples(d.pctDoAporte)}</td>
                      <td className="n">{fmtPctSimples(depois)} de {fmtPctSimples(l.pctAlvo)}</td>
                    </tr>
                  )
                })}</tbody>
                <tfoot><tr>
                  <td>Total</td><td>{fmtBRL(paraNumero(aporte) - dist.sobra)}</td><td colSpan={2} />
                </tr></tfoot>
              </table>
            </div>
            <div className={'aviso ' + (dist.alcancaAlvo ? 'ok' : 'atencao')} style={{ marginTop: 14 }}>
              {dist.alcancaAlvo
                ? 'Este aporte é suficiente para colocar todas as classes no alvo.'
                : 'O aporte não fecha todos os déficits. Ele foi rateado proporcionalmente ao tamanho de cada um — as classes mais atrasadas recebem mais.'}
            </div>
          </>
        ) : paraNumero(aporte) > 0 ? (
          <div className="aviso info">Defina os percentuais alvo acima para o simulador ter o que distribuir.</div>
        ) : null}
      </Painel>
    </>
  )
}

/* ------------------------------------------------------------------ */

function PorAtivo({ calc, alvos, salvarAlvos, podeEscrever }) {
  const recibo = useRecibo()
  const total = calc.total.valor
  const [rascunho, setRascunho] = useState({})

  useEffect(() => {
    const m = {}
    alvos.filter(a => a.nivel === 'ativo').forEach(a => { m[a.chave] = String(a.percentual).replace('.', ',') })
    setRascunho(m)
  }, [alvos])

  if (!calc.abertas.length) return (
    <Painel><Vazio><p>Sem posições em aberto para definir alvo por ativo.</p></Vazio></Painel>
  )

  const soma = Object.values(rascunho).reduce((s, v) => s + paraNumero(v), 0)

  async function salvar() {
    const deClasse = alvos.filter(a => a.nivel === 'classe')
      .map(a => ({ nivel: 'classe', chave: a.chave, percentual: a.percentual }))
    const deAtivo = Object.entries(rascunho)
      .map(([chave, v]) => ({
        nivel: 'ativo', chave, percentual: paraNumero(v),
        classe_pai: (calc.abertas.find(p => p.ticker === chave) || {}).classe || null,
      }))
      .filter(a => a.percentual > 0)
    try {
      await salvarAlvos([...deClasse, ...deAtivo])
      recibo('Alvos por ativo salvos.', 'ok')
    } catch (e) { recibo(e.message, 'erro') }
  }

  return (
    <Painel titulo="Alvo por ativo" aoLado={<span className={soma > 100.01 ? 'neg' : ''}>soma {fmtPctSimples(soma)} da carteira</span>}>
      <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 16, maxWidth: 620, lineHeight: 1.6 }}>
        Percentual sobre a carteira inteira, não sobre a classe. Deixe em branco os ativos que você não
        quer travar num peso específico.
      </p>
      <div className="rolagem">
        <table>
          <thead><tr><th>Ativo</th><th>Alvo</th><th>Atual</th><th>Desvio</th><th>Em reais</th><th>Valor hoje</th></tr></thead>
          <tbody>{calc.abertas.map(p => {
            const alvo = paraNumero(rascunho[p.ticker])
            const desvio = p.fatia - alvo
            const desvioRS = p.valorAtual - total * alvo / 100
            return (
              <tr key={p.ticker}>
                <td><span className="ticker">{p.ticker}</span><span className="classe">{p.classe}</span></td>
                <td>{podeEscrever ? (
                  <input className="celula" style={{ width: 78 }} inputMode="decimal"
                    value={rascunho[p.ticker] ?? ''} placeholder="—"
                    onChange={e => setRascunho(r => ({ ...r, [p.ticker]: e.target.value }))} />
                ) : <span className="num">{alvo ? fmtPctSimples(alvo) : '—'}</span>}</td>
                <td className="n">{fmtPctSimples(p.fatia)}</td>
                <td className={'n ' + (!alvo ? 'nulo' : Math.abs(desvio) < 1 ? 'nulo' : desvio > 0 ? 'neg' : 'pos')}>
                  {alvo ? `${desvio > 0 ? '+' : ''}${fmtNum(desvio, 1)} p.p.` : '—'}
                </td>
                <td className={'n ' + (!alvo ? 'nulo' : desvioRS > 0 ? 'neg' : 'pos')}>
                  {alvo ? fmtBRL(desvioRS) : '—'}
                </td>
                <td className="n">{fmtBRL(p.valorAtual)}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {podeEscrever && (
        <div style={{ marginTop: 18 }}>
          <button className="btn verde" onClick={salvar}>Salvar alvos por ativo</button>
        </div>
      )}
    </Painel>
  )
}
