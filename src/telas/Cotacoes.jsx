import { useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, useRecibo } from '../comp/base'
import { buscar, lerToken, salvarToken } from '../lib/cotacoes'
import { fmtBRL, fmtNum, fmtPct, fmtData, sinal, paraNumero } from '../lib/formato'

const DA_BOLSA = ['Ação', 'FII', 'ETF', 'BDR']

export default function Cotacoes() {
  const { calc, mapaCotacoes, salvarCotacoes, apagarCotacao, podeEscrever } = useDados()
  const recibo = useRecibo()
  const [token, setToken] = useState(lerToken)
  const [ocupado, setOcupado] = useState(false)

  async function atualizar() {
    const alvos = calc.abertas.filter(p => DA_BOLSA.includes(p.classe)).map(p => p.ticker)
    if (!alvos.length) return recibo('Nenhum ativo de bolsa em carteira para cotar.')
    setOcupado(true)
    try {
      const precos = await buscar(alvos, token)
      const n = Object.keys(precos).length
      if (!n) return recibo('A brapi respondeu sem preços. Sem token, só PETR4, VALE3, MGLU3 e ITUB4 retornam.', 'erro')
      await salvarCotacoes(precos, 'brapi')
      recibo(`${n} cotaç${n === 1 ? 'ão atualizada' : 'ões atualizadas'}.`, 'ok')
    } catch (e) {
      recibo(e.message, 'erro')
    } finally { setOcupado(false) }
  }

  if (!calc.abertas.length) return (
    <Painel><Vazio><p>Sem posições em aberto para cotar.</p></Vazio></Painel>
  )

  return (
    <>
      <Painel titulo="Fonte das cotações" aoLado="brapi.dev">
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14, maxWidth: 640 }}>
          A B3 não publica preços numa API aberta. A brapi.dev normaliza os dados públicos da bolsa e
          responde direto do navegador. Sem token, só quatro papéis de teste retornam; a conta gratuita
          libera o restante da bolsa dentro de uma cota mensal. Crie a sua em{' '}
          <a href="https://brapi.dev" target="_blank" rel="noopener noreferrer">brapi.dev</a>.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="campo" style={{ marginBottom: 0, maxWidth: 340, flex: 1, minWidth: 220 }}>
            <span className="rotulo">Token da brapi</span>
            <input type="password" value={token} placeholder="deixe em branco para usar sem token"
              onChange={e => { setToken(e.target.value); salvarToken(e.target.value) }} />
          </label>
          <button className="btn verde" onClick={atualizar} disabled={ocupado || !podeEscrever}>
            {ocupado ? 'Consultando…' : 'Buscar cotações'}
          </button>
        </div>
        <div className="dica" style={{ marginTop: 8 }}>
          O token fica só neste navegador — ele não vai para o banco, então não é compartilhado com quem
          tem acesso à carteira.
        </div>
      </Painel>

      <Painel titulo="Preços de mercado" aoLado="edite qualquer valor para sobrescrever" corpo={false}>
        <div className="rolagem">
          <table>
            <thead><tr>
              <th>Ativo</th><th>Preço médio</th><th>Preço de mercado</th><th>Variação</th>
              <th>Origem</th><th>Atualizado</th>
            </tr></thead>
            <tbody>{calc.abertas.map(p => {
              const cot = mapaCotacoes[p.ticker]
              const varia = p.temCotacao && p.precoMedio > 0 ? (p.precoAtual / p.precoMedio - 1) * 100 : null
              const origem = cot?.origem === 'brapi' ? 'brapi.dev'
                : cot?.origem === 'b3-posicao' ? 'posição B3' : cot ? 'manual' : '—'
              return (
                <tr key={p.ticker}>
                  <td><span className="ticker">{p.ticker}</span><span className="classe">{p.classe}</span></td>
                  <td className="n">{fmtNum(p.precoMedio, p.precoMedio < 1 ? 4 : 2)}</td>
                  <td>
                    <input className="celula" type="number" step="any" min="0" disabled={!podeEscrever}
                      defaultValue={cot ? cot.preco : ''} placeholder={fmtNum(p.precoMedio)}
                      onBlur={async e => {
                        const val = paraNumero(e.target.value)
                        if (val > 0) await salvarCotacoes({ [p.ticker]: val }, 'manual')
                        else if (cot) await apagarCotacao(p.ticker)
                      }} />
                  </td>
                  <td className={'n ' + (varia == null ? 'nulo' : sinal(varia))}>{varia == null ? '—' : fmtPct(varia)}</td>
                  <td style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--tinta-3)' }}>{origem}</td>
                  <td className="n" style={{ fontSize: 11.5, color: 'var(--tinta-3)' }}>
                    {cot ? fmtData(cot.atualizado) : '—'}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </Painel>

      <div className="aviso info">
        <strong>Renda fixa, Tesouro e fundos entram à mão.</strong> Não existe fonte pública gratuita com o
        preço unitário desses papéis por CPF — o número confiável é o do extrato de posição da B3, que o
        importador já lê e aplica aqui.
      </div>
    </>
  )
}
