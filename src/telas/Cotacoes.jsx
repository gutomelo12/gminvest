import { useState } from 'react'
import { useDados } from '../ctx/Dados'
import { Painel, Vazio, useRecibo } from '../comp/base'
import { buscarNoServidor, buscarNaBrapi, lerToken, salvarToken } from '../lib/cotacoes'
import { fmtBRL, fmtMoeda, fmtNum, fmtPct, fmtData, fmtHora, sinal, paraNumero, CLASSES_COM_COTACAO } from '../lib/formato'
import Pendencias from '../comp/Pendencias'

const DA_BOLSA = CLASSES_COM_COTACAO

export default function Cotacoes({ ir }) {
  const { calc, mapaCotacoes, salvarCotacoes, apagarCotacao, podeEscrever,
          ultimaAtualizacaoCotacoes, statusAuto } = useDados()
  const recibo = useRecibo()
  const [ocupado, setOcupado] = useState(null)
  const [reserva, setReserva] = useState(false)
  const [token, setToken] = useState(lerToken)

  const alvos = calc.abertas.filter(p => DA_BOLSA.includes(p.classe)).map(p => p.ticker)
  const temExterior = calc.abertas.some(p => p.moeda === 'USD')
  const alvosComCambio = temExterior ? [...alvos, 'USDBRL'] : alvos

  async function pelaFuncao() {
    if (!alvosComCambio.length) return recibo('Nenhum ativo de bolsa em carteira para cotar.')
    setOcupado('funcao')
    try {
      const r = await buscarNoServidor(alvosComCambio)
      const n = Object.keys(r.precos).length
      if (!n) throw new Error('A fonte respondeu, mas sem preços para estes ativos.')
      await salvarCotacoes(r.precos, 'yahoo')
      const extra = r.falhas.length ? ` ${r.falhas.length} sem retorno: ${r.falhas.join(', ')}.` : ''
      recibo(`${n} cotaç${n === 1 ? 'ão atualizada' : 'ões atualizadas'}.${extra}`, 'ok')
    } catch (e) {
      recibo(e.message, 'erro')
      setReserva(true)
    } finally { setOcupado(null) }
  }

  async function pelaBrapi() {
    if (!alvos.length) return recibo('Nenhum ativo de bolsa em carteira para cotar.')
    setOcupado('brapi')
    try {
      const precos = await buscarNaBrapi(alvos, token)
      const n = Object.keys(precos).length
      if (!n) throw new Error('Sem preços. Sem token, a brapi só responde PETR4, VALE3, MGLU3 e ITUB4.')
      await salvarCotacoes(precos, 'brapi')
      recibo(`${n} cotaç${n === 1 ? 'ão atualizada' : 'ões atualizadas'} pela brapi.`, 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setOcupado(null) }
  }

  if (!calc.abertas.length) return (
    <Painel><Vazio><p>Sem posições em aberto para cotar.</p></Vazio></Painel>
  )

  return (
    <>
      <Pendencias ir={ir} />

      <Painel titulo="Buscar preços" aoLado={<Resumo ultima={ultimaAtualizacaoCotacoes} status={statusAuto} />}>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14, maxWidth: 820 }}>
          A busca acontece no servidor do Supabase, não aqui no navegador. Isso contorna o bloqueio de
          origem da fonte e evita que qualquer credencial precise passar pela sua máquina. Ela também
          roda sozinha, uma vez, quando você abre a carteira.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn verde" onClick={pelaFuncao} disabled={ocupado !== null || !podeEscrever}>
            {ocupado === 'funcao' ? 'Consultando…' : 'Buscar cotações'}
          </button>
          <button className="btn mini vazio" onClick={() => setReserva(v => !v)}>
            {reserva ? 'Esconder a reserva' : 'Usar a brapi como reserva'}
          </button>
        </div>

        {reserva && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--linha-2)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--tinta-3)', lineHeight: 1.6, marginBottom: 12, maxWidth: 780 }}>
              A fonte principal não é oficial e pode sair do ar sem aviso. A brapi.dev fica aqui como
              segunda opção: cadastre um token gratuito em{' '}
              <a href="https://brapi.dev" target="_blank" rel="noopener noreferrer">brapi.dev</a> e use quando precisar.
              O token fica só neste navegador, não vai para o banco.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="campo" style={{ marginBottom: 0, maxWidth: 320, flex: 1, minWidth: 200 }}>
                <span className="rotulo">Token da brapi</span>
                <input type="password" value={token} placeholder="opcional"
                  onChange={e => { setToken(e.target.value); salvarToken(e.target.value) }} />
              </label>
              <button className="btn vazio" onClick={pelaBrapi} disabled={ocupado !== null || !podeEscrever}>
                {ocupado === 'brapi' ? 'Consultando…' : 'Buscar pela brapi'}
              </button>
            </div>
          </div>
        )}
      </Painel>

      {temExterior && (
        <Painel titulo="Câmbio" aoLado="usado para converter ativos em dólar no total da carteira">
          <div className="grade" style={{ maxWidth: 360 }}>
            <label className="campo">
              <span className="rotulo">Dólar (1 USD em reais)</span>
              <input className="celula" type="number" step="any" min="0" disabled={!podeEscrever}
                style={{ width: '100%', textAlign: 'left' }}
                defaultValue={mapaCotacoes['USDBRL']?.preco || ''} placeholder="5,15"
                onBlur={async e => {
                  const val = paraNumero(e.target.value)
                  if (val > 0) await salvarCotacoes({ USDBRL: val }, 'manual')
                }} />
            </label>
          </div>
          {!mapaCotacoes['USDBRL'] && (
            <div className="aviso atencao">
              Sem câmbio ainda, os ativos em dólar não entram no total da carteira — melhor subestimar
              do que fingir que 1 dólar vale 1 real. Clique em "Buscar cotações" acima ou digite manualmente.
            </div>
          )}
        </Painel>
      )}

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
              const origem = { yahoo: 'Yahoo', brapi: 'brapi.dev', 'b3-posicao': 'posição B3' }[cot?.origem]
                || (cot ? 'manual' : '—')
              return (
                <tr key={p.ticker}>
                  <td><span className="ticker">{p.ticker}</span><span className="classe">{p.classe}</span></td>
                  <td className="n">{fmtMoeda(p.precoMedio, p.moeda)}</td>
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

function Resumo({ ultima, status }) {
  if (status === 'buscando') return 'buscando…'
  if (!ultima) return status === 'erro' ? 'sem retorno na última tentativa' : 'ainda não buscado'
  const dt = new Date(ultima)
  const hoje = new Date().toDateString() === dt.toDateString()
  return `atualizado ${hoje ? 'hoje' : dt.toLocaleDateString('pt-BR')} às ${fmtHora(ultima)}`
}
