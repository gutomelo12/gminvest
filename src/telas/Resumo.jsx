import { useDados } from '../ctx/Dados'
import { Painel, Rosca, Barras, Colunas, Vazio, Ponto } from '../comp/base'
import { fmtBRL, fmtPct, fmtPctSimples, sinal, corClasse } from '../lib/formato'
import { proventosPorMes } from '../lib/calculo'
import TabelaPosicoes from './TabelaPosicoes'

export default function Resumo({ ir }) {
  const { calc, proventos, operacoes } = useDados()
  const t = calc.total

  if (!operacoes.length) return (
    <Painel>
      <Vazio>
        <p><strong>Comece pelo extrato da B3.</strong> Baixe o relatório de negociação ou de movimentação
          na Área do Investidor e solte o arquivo aqui — compras, vendas e proventos entram de uma vez.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn verde" onClick={() => ir('b3')}>Importar extrato da B3</button>
          <button className="btn vazio" onClick={() => ir('operacoes')}>Lançar à mão</button>
        </div>
      </Vazio>
    </Painel>
  )

  const [inteiro, cent = '00'] = fmtBRL(t.valor).replace('R$', '').trim().split(',')
  const meses = proventosPorMes(proventos, 12)
  const soma12 = meses.reduce((s, m) => s + m.valor, 0)

  return (
    <>
      <div className="patrimonio">
        <div>
          <div className="rotulo">Patrimônio a preço de mercado</div>
          <div className="valor"><span className="moeda">R$</span>{inteiro}<span className="cent">,{cent}</span></div>
        </div>
        <div className="lado">
          <div>
            <div className="rotulo">Resultado não realizado</div>
            <div className={'v ' + sinal(t.naoRealizado)}>
              {fmtBRL(t.naoRealizado)} <span style={{ fontSize: 12 }}>({fmtPct(t.naoRealizadoPct)})</span>
            </div>
          </div>
          <div>
            <div className="rotulo">Retorno total acumulado</div>
            <div className={'v ' + sinal(t.retorno)}>{fmtBRL(t.retorno)}</div>
          </div>
        </div>
      </div>

      <div className="cartoes">
        <div className="cartao"><div className="rotulo">Custo das posições</div>
          <div className="v">{fmtBRL(t.custo)}</div><div className="p">base do preço médio</div></div>
        <div className="cartao"><div className="rotulo">Proventos recebidos</div>
          <div className="v pos">{fmtBRL(t.proventos)}</div>
          <div className="p">{t.custo > 0 ? fmtPctSimples(t.proventos / t.custo * 100, 2) : '—'} sobre o custo</div></div>
        <div className="cartao"><div className="rotulo">Lucro realizado</div>
          <div className={'v ' + sinal(t.realizado)}>{fmtBRL(t.realizado)}</div>
          <div className="p">apurado nas vendas</div></div>
        <div className="cartao"><div className="rotulo">Custos e taxas</div>
          <div className="v">{fmtBRL(t.taxas)}</div><div className="p">corretagem, emolumentos</div></div>
      </div>

      {t.semCotacao > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 20 }}>
          <strong>{t.semCotacao} ativo{t.semCotacao === 1 ? '' : 's'} sem cotação.</strong>{' '}
          Sem preço de mercado, eles entram no patrimônio pelo preço médio — o que zera o resultado deles.{' '}
          <button className="btn mini vazio" style={{ marginLeft: 4 }} onClick={() => ir('cotacoes')}>Definir preços</button>
        </div>
      )}

      <Painel titulo="Alocação" aoLado="por classe e por ativo">
        <div className="duas">
          <div>
            <Rosca total={t.valor}
              fatias={calc.classes.map(c => ({ chave: c.classe, valor: c.valor, cor: corClasse(c.classe) }))} />
            <div className="barras" style={{ marginTop: 16 }}>
              {calc.classes.map(c => (
                <div className="barra-item" key={c.classe}>
                  <div className="cab">
                    <span><Ponto classe={c.classe} />{c.classe}</span>
                    <span className="v">{fmtPctSimples(c.fatia)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="rotulo" style={{ marginBottom: 10 }}>Maiores posições</div>
            <Barras itens={calc.abertas.slice(0, 10).map(p => ({
              chave: p.ticker,
              rotulo: <><strong>{p.ticker}</strong>{' '}
                <span style={{ color: 'var(--tinta-3)', fontSize: 11.5 }}>{p.classe}</span></>,
              direita: `${fmtBRL(p.valorAtual)} · ${fmtPctSimples(p.fatia)}`,
              valor: p.valorAtual, cor: corClasse(p.classe),
            }))} />
          </div>
        </div>
      </Painel>

      <Painel titulo="Proventos nos últimos 12 meses" aoLado={`${fmtBRL(soma12)} no período`}>
        <Colunas dados={meses} formatar={fmtBRL} />
      </Painel>

      <TabelaPosicoes posicoes={calc.abertas} ir={ir} />
    </>
  )
}
