import { useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Rosca, Evolucao, Colunas, Vazio, Ponto, Seta, useContagem } from '../comp/base'
import { fmtBRL, fmtData, fmtPct, fmtPctSimples, sinal, corClasseEfetiva } from '../lib/formato'
import { proventosPorMes, patrimonioPorMes, aportesPorMes, custoAcumuladoPorMes } from '../lib/calculo'
import TabelaPosicoes from './TabelaPosicoes'
import Pendencias from '../comp/Pendencias'

export default function Resumo({ ir }) {
  const { calc, proventos, operacoes, historico, taxasCambio, mapaClasses, mapaCoresClasse } = useDados()
  const t = calc.total
  // precisa rodar sempre, mesmo quando a tela vai retornar cedo pelo estado
  // vazio — hook não pode ser condicional, senão o React perde a contagem
  // de hooks assim que a carteira ganha o primeiro lançamento.
  const valorExibido = useContagem(t.valor)

  if (!operacoes.length) return (
    <Painel>
      <Vazio>
        <p><strong>Comece pelo extrato da B3.</strong> Baixe o relatório de negociação ou de movimentação
          na Área do Investidor e solte o arquivo aqui — compras, vendas e proventos entram de uma vez.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn verde" onClick={() => ir('b3')}>Importar extratos</button>
          <button className="btn vazio" onClick={() => ir('operacoes')}>Lançar à mão</button>
        </div>
      </Vazio>
    </Painel>
  )

  const [inteiro, cent = '00'] = fmtBRL(valorExibido).replace('R$', '').trim().split(',')
  const meses = proventosPorMes(proventos, 12)
  const soma12 = meses.reduce((s, m) => s + m.valor, 0)
  // meses sem fotografia de patrimônio (antes de você começar a usar o
  // sistema) mostram o capital aportado acumulado no lugar — não é valor
  // de mercado, então cada mês carrega a marca "estimado" para o gráfico
  // desenhar essa parte diferente da parte com dado real
  const evolucaoReal = patrimonioPorMes(historico, 12)
  const precisaEstimativa = evolucaoReal.some(m => m.valor == null)
  const evolucao = precisaEstimativa
    ? (() => {
        const estimado = custoAcumuladoPorMes(operacoes, mapaClasses, taxasCambio, 12)
        return evolucaoReal.map((m, i) => m.valor != null
          ? { ...m, estimado: false }
          : { ...m, valor: estimado[i].valor, estimado: true })
      })()
    : evolucaoReal.map(m => ({ ...m, estimado: false }))
  const mesesAporte = aportesPorMes(operacoes, taxasCambio, mapaClasses, 12)
  const somaAportes12 = mesesAporte.reduce((s, m) => s + m.valor, 0)

  const [inteiroLucro, centLucro = '00'] = fmtBRL(Math.abs(t.retorno)).replace('R$', '').trim().split(',')
  const [inteiroProv, centProv = '00'] = fmtBRL(soma12).replace('R$', '').trim().split(',')

  return (
    <>
      <Pendencias ir={ir} />

      <div className="linha-resumo">
        <div className="cartao destaque">
          <div className="destaque-cab">
            <span className="selo-mini">R$</span>
            <span className="rotulo" style={{ paddingBottom: 0 }}>Patrimônio total</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <div className="valor"><span className="moeda">R$</span>{inteiro}<span className="cent">,{cent}</span></div>
            {t.naoRealizadoPct != null && (
              <span className={'pilula ' + sinal(t.naoRealizadoPct)}>
                {t.naoRealizadoPct >= 0 ? '▲' : '▼'} {fmtPct(t.naoRealizadoPct, 2)}
              </span>
            )}
          </div>
          <div className="sub" style={{ color: 'var(--tinta-3)' }}>Valor investido</div>
          <div className="sub num" style={{ marginTop: 1 }}>{fmtBRL(t.custo)}</div>
        </div>

        <div className="cartao destaque">
          <div className="destaque-cab">
            <span className="selo-mini">Δ</span>
            <span className="rotulo" style={{ paddingBottom: 0 }}>Lucro total</span>
          </div>
          <div className={'valor ' + sinal(t.retorno)} style={{ marginTop: 10 }}>
            {t.retorno < 0 && '−'}<span className="moeda">R$</span>{inteiroLucro}<span className="cent">,{centLucro}</span>
          </div>
          <div className="sub" style={{ color: 'var(--tinta-3)' }}>Realizado nas vendas</div>
          <div className={'sub num ' + sinal(t.realizado)} style={{ marginTop: 1 }}>{fmtBRL(t.realizado)}</div>
        </div>

        <div className="cartao destaque">
          <div className="destaque-cab">
            <span className="selo-mini">$</span>
            <span className="rotulo" style={{ paddingBottom: 0 }}>Proventos (12 meses)</span>
          </div>
          <div className="valor pos" style={{ marginTop: 10 }}>
            <span className="moeda">R$</span>{inteiroProv}<span className="cent">,{centProv}</span>
          </div>
          <div className="sub" style={{ color: 'var(--tinta-3)' }}>Desde o início</div>
          <div className="sub num pos" style={{ marginTop: 1 }}>{fmtBRL(t.proventos)}</div>
        </div>

        <div className="cartao destaque">
          <div className="destaque-cab">
            <span className="selo-mini">%</span>
            <span className="rotulo" style={{ paddingBottom: 0 }}>Rentabilidade total</span>
          </div>
          <div className={'valor ' + sinal(t.retornoPct)} style={{ marginTop: 10 }}>{fmtPct(t.retornoPct, 2)}</div>
          <div className="sub" style={{ color: 'var(--tinta-3)', marginTop: 1 }}>Sobre o valor investido</div>
        </div>
      </div>

      {t.semCotacao > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 20 }}>
          <strong>{t.semCotacao} ativo{t.semCotacao === 1 ? '' : 's'} sem cotação.</strong>{' '}
          Sem preço de mercado, eles entram no patrimônio pelo preço médio — o que zera o resultado deles.{' '}
          <button className="btn mini vazio" style={{ marginLeft: 4 }} onClick={() => ir('cotacoes')}>Definir preços</button>
        </div>
      )}

      <div className="duas-largas">
        <Painel titulo="Evolução do patrimônio">
          <Evolucao dados={evolucao} formatar={fmtBRL} />
          {precisaEstimativa && (
            <p style={{ fontSize: 11.5, color: 'var(--tinta-3)', marginTop: 10, lineHeight: 1.6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--ambar)', opacity: .5, marginRight: 5, verticalAlign: 1 }} />
              Sem cotação histórica disponível, mostra o capital aportado acumulado até aquele mês, não
              o valor de mercado real.
              <br />
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--verde)', opacity: .85, marginRight: 5, verticalAlign: 1 }} />
              Valor de mercado real a partir de quando a carteira começou a ser acompanhada aqui.
            </p>
          )}
        </Painel>

        <Painel titulo="Ativos na carteira" aoLado={`${calc.classes.length} classe${calc.classes.length === 1 ? '' : 's'}`}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 auto' }}>
              <Rosca total={t.valor}
                fatias={calc.classes.map(c => ({ chave: c.classe, valor: c.valor, cor: corClasseEfetiva(c.classe, mapaCoresClasse) }))} />
            </div>
            <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {calc.classes.map(c => (
                <div key={c.classe} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
                  <span><Ponto classe={c.classe} cor={corClasseEfetiva(c.classe, mapaCoresClasse)} />{c.classe}</span>
                  <span className="num" style={{ color: 'var(--tinta-2)' }}>
                    {fmtPctSimples(c.fatia)} <span style={{ color: 'var(--tinta-3)', fontSize: 11.5 }}>· {fmtBRL(c.valor)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Painel>
      </div>

      <TabelaPosicoes posicoes={calc.abertas} ir={ir} />

      <PosicoesEncerradas encerradas={calc.encerradas} />

      <Painel titulo="Aportes por mês" aoLado={`${fmtBRL(somaAportes12)} nos últimos 12 meses`}>
        <Colunas dados={mesesAporte} formatar={fmtBRL} />
        {calc.total.semTaxaCambio > 0 && (
          <p style={{ fontSize: 11.5, color: 'var(--tinta-3)', marginTop: 10 }}>
            Há compra em dólar sem taxa de câmbio cadastrada — esses meses aparecem subcontados até
            você buscar ou digitar o câmbio em Cotações.
          </p>
        )}
      </Painel>
    </>
  )
}

/**
 * Mesmo formato de acordeão dos blocos de classe em "Meus Ativos" — um
 * único bloco aqui, já que posição encerrada não costuma ser numerosa a
 * ponto de precisar de agrupamento por classe. Começa fechado, porque é
 * uma consulta ocasional, não algo que se olha toda vez que abre o Resumo.
 */
function PosicoesEncerradas({ encerradas }) {
  const [aberto, setAberto] = useState(false)
  if (!encerradas.length) return null
  const totR = encerradas.reduce((s, x) => s + x.realizado, 0)

  return (
    <div className="secao-grupo" style={{ marginBottom: 20 }}>
      <div className="secao-grupo-cab" onClick={() => setAberto(a => !a)}>
        <div className="secao-grupo-titulo">
          <Seta aberta={aberto} />
          <strong>Posições encerradas</strong>
          <span className="conta">{encerradas.length} ativo{encerradas.length === 1 ? '' : 's'}</span>
        </div>
        <div className="secao-grupo-metricas">
          <div className="item"><span className="rotulo">Resultado</span>
            <span className={'num ' + sinal(totR)}><strong>{fmtBRL(totR)}</strong></span></div>
        </div>
      </div>
      {aberto && (
        <div className="rolagem">
          <table>
            <thead><tr><th>Ativo</th><th>Período</th><th>Custo vendido</th><th>Resultado</th><th>Proventos</th></tr></thead>
            <tbody>{encerradas.map(x => (
              <tr key={x.ticker}>
                <td><span className="ticker">{x.ticker}</span><span className="classe">{x.classe}</span></td>
                <td className="n">{fmtData(x.primeira)} – {fmtData(x.ultima)}</td>
                <td className="n">{fmtBRL(x.custoVendido)}</td>
                <td className={'n ' + sinal(x.realizado)}>{fmtBRL(x.realizado)}</td>
                <td className={'n ' + (x.proventos > 0 ? 'pos' : 'nulo')}>{x.proventos > 0 ? fmtBRL(x.proventos) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
