import { useDados } from '../ctx/Dados'
import { Painel, Rosca, Evolucao, Colunas, Vazio, Ponto, useContagem } from '../comp/base'
import { fmtBRL, fmtPct, fmtPctSimples, sinal, corClasseEfetiva } from '../lib/formato'
import { proventosPorMes, patrimonioPorMes, aportesPorMes } from '../lib/calculo'
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
  const evolucao = patrimonioPorMes(historico, 12)
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
        <Painel titulo="Evolução do patrimônio" aoLado="uma fotografia por dia, a partir de hoje">
          {historico.length ? (
            <Evolucao dados={evolucao} formatar={fmtBRL} />
          ) : (
            <Vazio>
              <p>Ainda não há nenhuma fotografia do patrimônio registrada para esta carteira. Assim que
                alguém com acesso de edição abrir a carteira, a primeira entra — e o gráfico cresce um
                ponto por dia a partir daí.</p>
            </Vazio>
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
