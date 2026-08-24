import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useDados } from '../ctx/Dados'
import { useSessao } from '../ctx/Sessao'
import { Painel, Modal, Confirmacao, useRecibo, iniciais } from '../comp/base'
import { fmtData, semAcento, hoje } from '../lib/formato'

const PAPEIS = [
  ['leitura', 'Leitura', 'Vê tudo, não altera nada.'],
  ['edicao', 'Edição', 'Lança e apaga operações, proventos e alvos.'],
  ['dono', 'Dono', 'Tudo, mais convidar gente e apagar a carteira.'],
]
const rotuloPapel = p => (PAPEIS.find(x => x[0] === p) || [, p])[1]

export default function Ajustes() {
  const { carteira, carteiras, eDono, operacoes, proventos, renomearCarteira, apagarCarteira } = useDados()
  const { usuario, sair } = useSessao()
  const recibo = useRecibo()
  const [nome, setNome] = useState(carteira?.nome || '')
  const [cor, setCor] = useState(carteira?.cor || '#0B6E4F')
  const [confirma, setConfirma] = useState(false)

  useEffect(() => { setNome(carteira?.nome || ''); setCor(carteira?.cor || '#0B6E4F') }, [carteira?.id])

  function baixar(nomeArq, conteudo, tipo) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
    a.download = nomeArq
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <>
      <Painel titulo="Esta carteira" aoLado={`seu papel: ${rotuloPapel(carteira?.papel)}`}>
        <div className="grade" style={{ maxWidth: 520 }}>
          <label className="campo"><span className="rotulo">Nome</span>
            <input value={nome} disabled={!eDono} onChange={e => setNome(e.target.value)} /></label>
          <label className="campo"><span className="rotulo">Cor</span>
            <input type="color" value={cor} disabled={!eDono} onChange={e => setCor(e.target.value)}
              style={{ height: 38, padding: 3 }} /></label>
        </div>
        {eDono && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn verde" onClick={async () => {
              try { await renomearCarteira(carteira.id, nome.trim(), cor); recibo('Carteira salva.', 'ok') }
              catch (e) { recibo(e.message, 'erro') }
            }}>Salvar</button>
            <button className="btn perigo" onClick={() => setConfirma(true)}>Apagar carteira</button>
          </div>
        )}
      </Painel>

      {eDono && <Compartilhamento carteira={carteira} />}

      <Painel titulo="Exportar" aoLado="seus dados, no seu computador">
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14, maxWidth: 600 }}>
          Um retrato completo da carteira, para guardar fora do Supabase ou levar para uma planilha.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => baixar(
            `gminvest-${semAcento(carteira.nome).replace(/\W+/g, '-')}-${hoje()}.json`,
            JSON.stringify({ app: 'gminvest', versao: 1, exportadoEm: new Date().toISOString(),
              carteira: carteira.nome, operacoes, proventos }, null, 2),
            'application/json')}>Baixar .json</button>
          <button className="btn vazio" onClick={() => {
            const cab = 'data;tipo;ticker;classe;quantidade;preco;taxas;corretora'
            const linhas = [...operacoes].sort((a, b) => a.data.localeCompare(b.data))
              .map(o => [o.data, o.tipo, o.ticker, o.classe, o.quantidade, o.preco, o.taxas || 0, o.corretora || ''].join(';'))
            baixar(`operacoes-${hoje()}.csv`, '\uFEFF' + [cab, ...linhas].join('\n'), 'text/csv')
          }}>Operações em .csv</button>
        </div>
      </Painel>

      <Painel titulo="Sua conta">
        <p style={{ fontSize: 13, marginBottom: 4 }}>{usuario?.email}</p>
        <p className="dica" style={{ marginBottom: 14 }}>
          Você tem acesso a {carteiras.length} carteira{carteiras.length === 1 ? '' : 's'}.
        </p>
        <button className="btn vazio" onClick={sair}>Sair da conta</button>
      </Painel>

      {confirma && (
        <Confirmacao titulo={`Apagar “${carteira.nome}”`} perigo rotulo="Apagar para sempre"
          texto={`Todas as operações, proventos, alvos e premissas desta carteira somem, para você e para
            todos os convidados. Baixe o .json antes se tiver qualquer dúvida.`}
          aoFechar={() => setConfirma(false)}
          aoConfirmar={async () => {
            try { await apagarCarteira(carteira.id); recibo('Carteira apagada.') }
            catch (e) { recibo(e.message, 'erro') }
          }} />
      )}
    </>
  )
}

function Compartilhamento({ carteira }) {
  const { usuario } = useSessao()
  const recibo = useRecibo()
  const [acessos, setAcessos] = useState([])
  const [convites, setConvites] = useState([])
  const [novo, setNovo] = useState({ email: '', papel: 'leitura' })
  const [ocupado, setOcupado] = useState(false)

  const carregar = async () => {
    const [a, c] = await Promise.all([
      sb.from('acessos').select('usuario_id, papel, perfil:perfis(email, nome)').eq('carteira_id', carteira.id),
      sb.from('convites').select('*').eq('carteira_id', carteira.id).is('aceito_em', null),
    ])
    setAcessos(a.data || [])
    setConvites(c.data || [])
  }
  useEffect(() => { carregar() }, [carteira.id])

  async function convidar() {
    const email = novo.email.trim().toLowerCase()
    if (!email.includes('@')) return recibo('Informe um e-mail válido.', 'erro')
    setOcupado(true)
    try {
      const { error } = await sb.from('convites')
        .upsert({ carteira_id: carteira.id, email, papel: novo.papel, criado_por: usuario.id },
          { onConflict: 'carteira_id,email' })
      if (error) throw error
      setNovo({ email: '', papel: 'leitura' })
      await carregar()
      recibo('Convite registrado. Ele vira acesso assim que a pessoa entrar com esse e-mail.', 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setOcupado(false) }
  }

  async function mudarPapel(usuario_id, papel) {
    const { error } = await sb.from('acessos').update({ papel })
      .eq('carteira_id', carteira.id).eq('usuario_id', usuario_id)
    if (error) return recibo(error.message, 'erro')
    await carregar()
    recibo('Papel atualizado.', 'ok')
  }

  async function remover(usuario_id) {
    const { error } = await sb.from('acessos').delete()
      .eq('carteira_id', carteira.id).eq('usuario_id', usuario_id)
    if (error) return recibo(error.message, 'erro')
    await carregar()
    recibo('Acesso removido.')
  }

  const donos = acessos.filter(a => a.papel === 'dono').length

  return (
    <Painel titulo="Quem acessa esta carteira" aoLado={`${acessos.length} pessoa${acessos.length === 1 ? '' : 's'}`}>
      <div className="rolagem" style={{ marginBottom: 18 }}>
        <table>
          <thead><tr><th>Pessoa</th><th>Papel</th><th /></tr></thead>
          <tbody>
            {acessos.map(a => {
              const eu = a.usuario_id === usuario.id
              const ultimoDono = a.papel === 'dono' && donos === 1
              return (
                <tr key={a.usuario_id}>
                  <td>
                    <span className="ticker">{a.perfil?.nome || a.perfil?.email || 'conta'}</span>
                    <span className="classe">{a.perfil?.email}{eu ? ' · você' : ''}</span>
                  </td>
                  <td>
                    <select value={a.papel} disabled={ultimoDono}
                      onChange={e => mudarPapel(a.usuario_id, e.target.value)}
                      style={{ padding: '4px 8px', border: '1px solid var(--linha)', borderRadius: 3, background: '#fff' }}>
                      {PAPEIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    {!ultimoDono && (
                      <button className="btn mini perigo" onClick={() => remover(a.usuario_id)}>
                        {eu ? 'Sair da carteira' : 'Remover'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {convites.map(c => (
              <tr key={c.id} style={{ opacity: .6 }}>
                <td><span className="ticker">{c.email}</span>
                  <span className="classe">convite pendente desde {fmtData(c.criado_em)}</span></td>
                <td>{rotuloPapel(c.papel)}</td>
                <td>
                  <button className="btn mini vazio" onClick={async () => {
                    await sb.from('convites').delete().eq('id', c.id)
                    await carregar(); recibo('Convite cancelado.')
                  }}>Cancelar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rotulo" style={{ marginBottom: 8 }}>Convidar por e-mail</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="campo" style={{ marginBottom: 0, minWidth: 240, flex: 1 }}>
          <span className="rotulo">E-mail</span>
          <input type="email" value={novo.email} placeholder="pessoa@exemplo.com"
            onChange={e => setNovo({ ...novo, email: e.target.value })} />
        </label>
        <label className="campo" style={{ marginBottom: 0, width: 160 }}>
          <span className="rotulo">Papel</span>
          <select value={novo.papel} onChange={e => setNovo({ ...novo, papel: e.target.value })}>
            {PAPEIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <button className="btn verde" onClick={convidar} disabled={ocupado}>Convidar</button>
      </div>
      <div className="dica" style={{ marginTop: 10 }}>
        {PAPEIS.map(([, r, d]) => <div key={r}><strong>{r}:</strong> {d}</div>)}
        <div style={{ marginTop: 6 }}>
          O convite fica guardado e vira acesso na hora em que a pessoa entrar com esse e-mail. Se ela ainda
          não tem conta, peça para criar uma em <strong>Criar conta</strong>, usando o mesmo endereço.
        </div>
      </div>
    </Painel>
  )
}

/* seletor de carteira, usado pelo cabeçalho lateral */
export function SeletorCarteiras({ aoFechar }) {
  const { carteiras, carteiraId, trocarCarteira, criarCarteira } = useDados()
  const recibo = useRecibo()
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState(null)
  const cores = ['#0B6E4F', '#1C3F94', '#B87615', '#6B4E9E', '#9E2B2B', '#2C7A8C']

  return (
    <Modal titulo="Suas carteiras" aoFechar={aoFechar} pe={
      criando ? (
        <>
          <button className="btn vazio" onClick={() => { setCriando(false); setErro(null) }}>Voltar</button>
          <button className="btn verde" onClick={async () => {
            if (nome.trim().length < 2) return setErro('Dê um nome à carteira.')
            try {
              await criarCarteira(nome.trim(), cores[carteiras.length % cores.length])
              recibo('Carteira criada.', 'ok')
              aoFechar()
            } catch (e) { setErro(e.message) }
          }}>Criar</button>
        </>
      ) : (
        <>
          <button className="btn vazio" onClick={aoFechar}>Fechar</button>
          <button className="btn verde" onClick={() => setCriando(true)}>Nova carteira</button>
        </>
      )
    }>
      {criando ? (
        <>
          <label className="campo"><span className="rotulo">Nome da carteira</span>
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={60}
              placeholder="Ex.: Helena, Reserva, Longo prazo" /></label>
          <div className="aviso info">
            Você entra como dono. Para entregar a carteira a outra pessoa, convide o e-mail dela em
            Ajustes e escolha o papel.
          </div>
          {erro && <div className="aviso erro" style={{ marginTop: 10 }}>{erro}</div>}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {carteiras.map(c => (
            <button key={c.id} className="item-carteira" onClick={() => { trocarCarteira(c.id); aoFechar() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '13px 14px', background: c.id === carteiraId ? '#fff' : 'var(--cedula-2)',
                border: '1px solid ' + (c.id === carteiraId ? 'var(--verde)' : 'var(--linha-2)'),
                borderRadius: 3, cursor: 'pointer',
              }}>
              <span className="iniciais g" style={{ background: c.cor }}>{iniciais(c.nome)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{c.nome}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--tinta-3)' }}>
                  {rotuloPapel(c.papel)} · desde {fmtData(c.criada_em)}
                </span>
              </span>
              {c.id === carteiraId && <span className="rotulo">aberta</span>}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
