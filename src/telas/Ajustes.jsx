import { useEffect, useRef, useState } from 'react'
import { sb, mensagemDeErroDaFuncao } from '../lib/supabase'
import { useDados } from '../ctx/Dados'
import { buscarNoServidor } from '../lib/cotacoes'
import { useSessao } from '../ctx/Sessao'
import { Painel, Modal, Confirmacao, useRecibo, iniciais } from '../comp/base'
import { fmtData, semAcento, hoje, fmtBRL, fmtQtd, fmtNum,
         corClasse, corClasseEfetiva, LISTA_CLASSES, inferirClasse } from '../lib/formato'

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
  const [excluindoConta, setExcluindoConta] = useState(false)

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

      <Duplicatas />

      <Recomecar />

      <Fracionarios />

      <Classificacao />

      <CoresDasClasses />

      {eDono && <Compartilhamento carteira={carteira} />}

      <Painel titulo="Exportar" aoLado="seus dados, no seu computador">
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          Um retrato completo da carteira, para guardar fora do Supabase ou levar para uma planilha.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => baixar(
            `gmINVEST-${semAcento(carteira.nome).replace(/\W+/g, '-')}-${hoje()}.json`,
            JSON.stringify({ app: 'gmINVEST', versao: 1, exportadoEm: new Date().toISOString(),
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn vazio" onClick={sair}>Sair da conta</button>
          <button className="btn perigo" onClick={() => setExcluindoConta(true)}>Excluir minha conta</button>
        </div>
      </Painel>

      <ConvidarConta />

      {excluindoConta && <ExcluirConta usuario={usuario} sair={sair} aoFechar={() => setExcluindoConta(false)} />}

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

/**
 * Convite de conta — não aparece pra ninguém além de administradores.
 * Cria uma conta nova e independente: quem aceita não herda acesso a
 * nenhuma carteira sua, só ganha permissão pra existir e cai direto na
 * tela de criar a própria primeira carteira.
 */
/**
 * Excluir a própria conta é irreversível — por isso não basta um clique
 * de confirmação genérico. A pessoa precisa digitar o próprio e-mail,
 * exatamente igual, antes do botão de excluir ficar disponível.
 */
function ExcluirConta({ usuario, sair, aoFechar }) {
  const [confirmacao, setConfirmacao] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState(null)
  const bate = confirmacao.trim().toLowerCase() === (usuario?.email || '').toLowerCase()

  async function excluir() {
    setOcupado(true); setErro(null)
    try {
      const { data, error } = await sb.functions.invoke('excluir-conta')
      if (error) throw new Error(await mensagemDeErroDaFuncao(error, 'excluir-conta'))
      if (data?.erro) throw new Error(data.erro)
      await sair()
    } catch (e) {
      setErro(e.message)
      setOcupado(false)
    }
  }

  return (
    <Modal titulo="Excluir sua conta" aoFechar={aoFechar} pe={<>
      <button className="btn vazio" onClick={aoFechar}>Cancelar</button>
      <button className="btn perigo" disabled={!bate || ocupado} onClick={excluir}>
        {ocupado ? 'Excluindo…' : 'Excluir para sempre'}
      </button>
    </>}>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>
        Isto apaga sua conta e <strong>toda carteira sua que ninguém mais acessa</strong>, com todas as
        operações, proventos, alvos e premissas dentro delas — sem volta. Seu acesso a carteiras de outras
        pessoas também é removido, sem afetar a carteira delas.
      </p>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>
        Se você é dona de uma carteira que <strong>outra pessoa também acessa</strong>, a exclusão é
        bloqueada até você resolver isso primeiro, em Ajustes → Quem acessa esta carteira — removendo o
        acesso dela ou passando a posição de dono para outra pessoa. O mesmo vale se você for a única
        administradora do sistema.
      </p>
      <label className="campo">
        <span className="rotulo">Digite seu e-mail para confirmar</span>
        <input value={confirmacao} onChange={e => setConfirmacao(e.target.value)}
          placeholder={usuario?.email} autoFocus />
      </label>
      {erro && <div className="aviso erro" style={{ marginTop: 10 }}>{erro}</div>}
    </Modal>
  )
}

function ConvidarConta() {
  const { usuario } = useSessao()
  const recibo = useRecibo()
  const [souAdmin, setSouAdmin] = useState(null)
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [link, setLink] = useState(null)
  const [horas, setHoras] = useState(48)
  const [copiado, setCopiado] = useState(false)
  const [convites, setConvites] = useState(null)

  useEffect(() => {
    let vivo = true
    sb.from('administradores').select('usuario_id').eq('usuario_id', usuario.id).maybeSingle()
      .then(({ data }) => { if (vivo) setSouAdmin(Boolean(data)) })
    return () => { vivo = false }
  }, [usuario.id])

  const carregarConvites = () => {
    sb.from('convites_cadastro').select('*').order('criado_em', { ascending: false })
      .then(({ data }) => setConvites(data || []))
  }
  useEffect(() => { if (souAdmin) carregarConvites() }, [souAdmin])

  if (!souAdmin) return null

  async function convidar() {
    const limpo = email.trim().toLowerCase()
    if (!limpo.includes('@')) return recibo('Informe um e-mail válido.', 'erro')
    setOcupado(true); setLink(null); setCopiado(false)
    try {
      const { data, error } = await sb.functions.invoke('convidar-cadastro', { body: { email: limpo } })
      if (error) throw new Error(await mensagemDeErroDaFuncao(error, 'convidar-cadastro'))
      if (data?.erro) throw new Error(data.erro)
      if (!data?.token) throw new Error('O convite foi criado, mas o token não veio na resposta.')
      setLink(`${window.location.origin}/?convite=${data.token}`)
      setHoras(data.horasDeValidade || 48)
      recibo('Link gerado.', 'ok')
      carregarConvites()
    } catch (e) {
      recibo(e.message, 'erro')
    } finally { setOcupado(false) }
  }

  const mensagem = link
    ? `Oi${nome ? ' ' + nome : ''}! Criei um acesso pra você no gmINVEST, o app que uso para organizar `
      + `os investimentos. É só clicar no link, escolher uma senha e você já entra direto — a carteira `
      + `é sua, começa vazia:\n\n${link}\n\nO link vale por ${horas} horas, se der problema me chama que eu gero outro.`
    : ''

  async function copiar() {
    await navigator.clipboard.writeText(mensagem)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <>
      <Painel titulo="Convidar para o gmINVEST" aoLado="conta nova, sem vínculo com esta carteira">
        <div className="grade" style={{ gridTemplateColumns: '1fr 1.8fr', maxWidth: 640, marginBottom: 10 }}>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span className="rotulo">E-mail</span>
            <input type="email" value={email} placeholder="pessoa@exemplo.com"
              onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span className="rotulo" style={{ whiteSpace: 'nowrap' }}>Nome <span style={{ fontWeight: 400 }}>(opcional, só para a mensagem)</span></span>
            <input value={nome} placeholder="opcional" onChange={e => setNome(e.target.value)} />
          </label>
        </div>
        <button className="btn verde" onClick={convidar} disabled={ocupado}>
          {ocupado ? 'Gerando…' : 'Gerar link de convite'}
        </button>

        {link && (
          <div style={{ marginTop: 16 }}>
            <div className="rotulo" style={{ marginBottom: 6 }}>Mensagem pronta para enviar</div>
            <textarea readOnly value={mensagem} rows={6}
              style={{ width: '100%', fontFamily: 'var(--sans)', fontSize: 13, padding: 10,
                border: '1px solid var(--linha)', borderRadius: 3, resize: 'vertical' }} />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn vazio" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar mensagem'}</button>
              <span style={{ fontSize: 12, color: 'var(--tinta-3)' }}>
                Validade de {horas} horas, controlada pelo próprio gmINVEST — não depende de nenhuma
                configuração do Supabase.
              </span>
            </div>
          </div>
        )}
      </Painel>

      <Painel titulo="Convites enviados" aoLado={convites ? `${convites.length} no total` : '...'}>
        {!convites?.length ? (
          <p style={{ fontSize: 13, color: 'var(--tinta-3)' }}>Nenhum convite gerado ainda.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead><tr><th>E-mail</th><th>Convidado em</th><th>Status</th></tr></thead>
              <tbody>{convites.map(c => (
                <tr key={c.email}>
                  <td style={{ textAlign: 'left' }}>{c.email}</td>
                  <td className="n">{fmtData(c.criado_em?.slice(0, 10))}</td>
                  <td>
                    {c.usado_em
                      ? <span className="tag" style={{ color: 'var(--verde)', borderColor: 'var(--verde)' }}>
                          Entrou em {fmtData(c.usado_em.slice(0, 10))}
                        </span>
                      : c.expira_em && new Date(c.expira_em) < new Date()
                        ? <span className="tag" style={{ color: 'var(--vermelho)', borderColor: 'var(--vermelho)' }}>
                            Expirado
                          </span>
                        : <span className="tag" style={{ color: 'var(--ambar)', borderColor: 'var(--ambar)' }}>
                            Convite pendente
                          </span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="dica" style={{ marginTop: 12 }}>
          "Entrou" significa que a pessoa terminou de escolher a senha — só abrir o link ainda não conta
          para nada, de propósito. "Expirado" passa do prazo sozinho; gere um convite novo para a mesma
          pessoa que ele some daqui.
        </p>
      </Painel>
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
      sb.from('acessos').select('usuario_id, papel').eq('carteira_id', carteira.id),
      sb.from('convites').select('*').eq('carteira_id', carteira.id).is('aceito_em', null),
    ])
    // isto tem dado "0 pessoas" mesmo com o dado certo no banco. A causa
    // mais provável: "perfil:perfis(...)" pedia pro PostgREST juntar
    // acessos com perfis sozinho, mas não existe chave estrangeira direta
    // entre as duas tabelas — as duas apontam pra auth.users, não uma pra
    // outra. Troquei para uma busca separada dos perfis, do mesmo jeito
    // que já funciona pra achar o dono de uma carteira em outro lugar do
    // sistema. O erro fica exposto de qualquer forma, para nunca mais
    // "vazio" e "deu erro" parecerem a mesma coisa.
    if (a.error) recibo('Erro ao carregar quem acessa: ' + a.error.message, 'erro')
    if (c.error) recibo('Erro ao carregar convites pendentes: ' + c.error.message, 'erro')
    const linhas = a.data || []
    const ids = [...new Set(linhas.map(x => x.usuario_id))]
    let mapaPerfis = {}
    if (ids.length) {
      const { data: perfis, error: eP } = await sb.from('perfis').select('id, email, nome').in('id', ids)
      if (eP) recibo('Erro ao carregar os perfis de quem acessa: ' + eP.message, 'erro')
      mapaPerfis = Object.fromEntries((perfis || []).map(p => [p.id, p]))
    }
    const comPerfil = linhas.map(x => ({ ...x, perfil: mapaPerfis[x.usuario_id] || null }))
    setAcessos(comPerfil)
    setConvites(c.data || [])
    return comPerfil
  }
  useEffect(() => {
    let vivo = true
    carregar().then(lista => {
      if (vivo && lista.length === 0) setTimeout(() => { if (vivo) carregar() }, 500)
    })
    return () => { vivo = false }
  }, [carteira.id])

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
          O convite fica guardado e vira acesso na hora em que a pessoa entrar com esse e-mail. Cadastro no
          gmINVEST é só por convite — se ela ainda não tem conta, peça a quem administra o gmINVEST para
          convidá-la primeiro (em Ajustes → Convidar para o gmINVEST), usando o mesmo endereço.
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
  const [salvando, setSalvando] = useState(false)
  const cores = ['#0B6E4F', '#1C3F94', '#B87615', '#6B4E9E', '#9E2B2B', '#2C7A8C']

  return (
    <Modal titulo="Suas carteiras" aoFechar={aoFechar} pe={
      criando ? (
        <>
          <button className="btn vazio" onClick={() => { setCriando(false); setErro(null) }} disabled={salvando}>Voltar</button>
          <button className="btn verde" disabled={salvando} onClick={async () => {
            if (nome.trim().length < 2) return setErro('Dê um nome à carteira.')
            setSalvando(true)
            try {
              await criarCarteira(nome.trim(), cores[carteiras.length % cores.length])
              recibo('Carteira criada.', 'ok')
              aoFechar()
            } catch (e) { setErro(e.message); setSalvando(false) }
          }}>{salvando ? 'Criando…' : 'Criar'}</button>
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
                  {c.papel !== 'dono' && c.dono && ` · de ${c.dono.nome || c.dono.email}`}
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


/**
 * O sufixo F identifica o mercado fracionário, que só muda o tamanho do lote.
 * Se a carteira tem VALE3 e VALE3F separados, existem dois preços médios onde
 * deveria haver um — e o do imposto de renda é o consolidado.
 */
function Fracionarios() {
  const { previewFracionarios, consolidarFracionarios, podeEscrever } = useDados()
  const recibo = useRecibo()
  const [ocupado, setOcupado] = useState(false)
  const pares = previewFracionarios()

  if (!pares.length) return null

  const total = pares.reduce((s, x) => s + x.operacoes + x.proventos, 0)

  return (
    <Painel titulo="Códigos do mercado fracionário" aoLado={`${pares.length} para unificar`}>
      <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
        O <strong>F</strong> no fim do código só indica que a compra foi feita em lote menor que cem.
        O papel é o mesmo, a custódia é a mesma e o preço médio deveria ser um só — inclusive para a
        apuração do imposto. Enquanto estiverem separados, cada um mostra um preço médio parcial e a
        alocação conta o ativo duas vezes.
      </p>

      <div className="rolagem" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Hoje</th><th>Vira</th><th>Operações</th><th>Proventos</th><th>Situação</th></tr></thead>
          <tbody>{pares.map(x => (
            <tr key={x.de}>
              <td><span className="ticker">{x.de}</span></td>
              <td><span className="ticker">{x.para}</span></td>
              <td className="n">{x.operacoes}</td>
              <td className="n">{x.proventos}</td>
              <td style={{ textAlign: 'left', fontSize: 12, color: 'var(--tinta-3)' }}>
                {x.jaExiste ? 'junta com a posição existente' : 'passa a existir sozinho'}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {pares.some(x => x.premissas || x.alvo) && (
        <div className="aviso atencao" style={{ marginBottom: 14 }}>
          Alguns desses códigos têm premissas de preço teto ou alvo de alocação próprios. Quando o
          código padrão já tiver os seus, os do fracionário são descartados — confira essas duas telas
          depois de unificar.
        </div>
      )}

      <button className="btn verde" disabled={ocupado || !podeEscrever} onClick={async () => {
        setOcupado(true)
        try {
          const n = await consolidarFracionarios(pares.map(({ de, para }) => ({ de, para })))
          recibo(`${n} lançamento${n === 1 ? '' : 's'} unificado${n === 1 ? '' : 's'}.`, 'ok')
        } catch (e) { recibo(e.message, 'erro') } finally { setOcupado(false) }
      }}>
        {ocupado ? 'Unificando…' : `Unificar ${total} lançamento${total === 1 ? '' : 's'}`}
      </button>
      <div className="dica" style={{ marginTop: 10 }}>
        Baixe o backup em .json antes, se quiser poder voltar atrás. Importações futuras já entram
        unificadas — este painel some quando não houver mais nada a fazer.
      </div>
    </Painel>
  )
}


/**
 * A classe é adivinhada pelo código do papel, e adivinhação erra. Units
 * como TAEE11 e ALUP11 já foram confundidas com FII aqui. Este painel
 * mostra onde o gravado diverge do que o app inferiria hoje.
 */
/**
 * Cor por classe — de fábrica vem uma cor fixa por classe; aqui dá para
 * trocar. Vale para o gráfico de "Ativos na carteira" no Resumo e para
 * os indicadores coloridos de classe em Posições.
 */
function CoresDasClasses() {
  const { calc, mapaCoresClasse, salvarCorClasse, restaurarCorClasse, podeEscrever } = useDados()
  const recibo = useRecibo()
  const classes = calc.classes.map(c => c.classe).sort()
  // o seletor nativo de cor dispara onChange a cada pixel que a pessoa
  // arrasta, não só quando fecha. Se cada disparo gravasse no banco na
  // hora, o recarregamento no meio da interação fechava o seletor. Aqui
  // o rascunho muda na hora (visual), e só grava de fato depois de meio
  // segundo sem nenhuma mudança nova.
  const [rascunho, setRascunho] = useState({})
  const temporizadores = useRef({})

  if (!classes.length) return null

  const mudar = (c, cor) => {
    setRascunho(r => ({ ...r, [c]: cor }))
    clearTimeout(temporizadores.current[c])
    temporizadores.current[c] = setTimeout(async () => {
      try { await salvarCorClasse(c, cor) }
      catch (err) { recibo(err.message, 'erro') }
    }, 500)
  }

  return (
    <Painel titulo="Cores das classes" aoLado="usadas no gráfico de Ativos na carteira">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {classes.map(c => {
          const cor = rascunho[c] ?? corClasseEfetiva(c, mapaCoresClasse)
          const alterada = Boolean(mapaCoresClasse[c])
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={cor} disabled={!podeEscrever}
                style={{ width: 34, height: 28, padding: 0, border: '1px solid var(--linha)', borderRadius: 3, cursor: podeEscrever ? 'pointer' : 'default' }}
                onChange={e => mudar(c, e.target.value)} />
              <span style={{ fontSize: 13, flex: 1 }}>{c}</span>
              {alterada && podeEscrever && (
                <button className="btn mini vazio" onClick={async () => {
                  try {
                    await restaurarCorClasse(c)
                    setRascunho(r => { const { [c]: _fora, ...resto } = r; return resto })
                    recibo(`${c} voltou à cor de fábrica.`, 'ok')
                  } catch (err) { recibo(err.message, 'erro') }
                }}>Restaurar</button>
              )}
            </div>
          )
        })}
      </div>
    </Painel>
  )
}

function Classificacao() {
  const { calc, mapaClasses, definirClasse, definirClasses, limparClasse, podeEscrever } = useDados()
  const recibo = useRecibo()
  const [consultando, setConsultando] = useState(false)
  const [sugestoes, setSugestoes] = useState(null)

  const ativos = calc.lista.filter(p => p.qtd > 0)
  if (!ativos.length) return null

  /**
   * A fonte de cotações informa se o papel é fundo de índice ou ação.
   * Ela não distingue FII de ação — por isso a pista só vale para achar
   * ETF classificado como outra coisa, que é justamente o erro comum.
   */
  async function consultarTipo() {
    setConsultando(true); setSugestoes(null)
    try {
      const r = await buscarNoServidor(ativos.map(p => p.ticker))
      const achados = []
      for (const [ticker, det] of Object.entries(r.detalhes || {})) {
        const atual = ativos.find(p => p.ticker === ticker)
        if (!atual || String(det.tipo).toUpperCase() !== 'ETF') continue
        // a fonte diz o tipo e a moeda; um ETF cotado fora do real é
        // internacional — é exatamente o sinal que faltava para não
        // depender de você lembrar de escolher a classe certa na mão
        const para = det.moeda && det.moeda !== 'BRL' ? 'ETFs Intern.' : 'ETFs'
        if (atual.classe !== para) achados.push({ ticker, de: atual.classe, para })
      }
      setSugestoes(achados)
      recibo(achados.length
        ? `${achados.length} ativo${achados.length === 1 ? '' : 's'} que a fonte identifica como ETF.`
        : 'A fonte não apontou nenhuma divergência.', achados.length ? '' : 'ok')
    } catch (e) { recibo(e.message, 'erro') } finally { setConsultando(false) }
  }

  return (
    <Painel titulo="Classificação dos ativos" aoLado={`${ativos.length} em carteira`}>
      <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
        A classe começa deduzida do código do papel, e dedução erra — códigos terminados em 11 podem ser
        fundo imobiliário, ETF ou Unit, e não há como saber pelo ticker. <strong>O que você escolher aqui
        vale para tudo</strong>: alocação, preço teto e os blocos da tela de Posições. Nenhuma importação
        futura sobrescreve.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn vazio" onClick={consultarTipo} disabled={consultando || !podeEscrever}>
          {consultando ? 'Consultando…' : 'Consultar tipo na fonte de cotações'}
        </button>
      </div>

      {sugestoes?.length > 0 && (
        <div className="aviso atencao" style={{ marginBottom: 16 }}>
          A fonte identifica como fundo de índice:{' '}
          <strong>{sugestoes.map(x => `${x.ticker} → ${x.para}`).join(', ')}</strong>.
          <div style={{ marginTop: 10 }}>
            <button className="btn mini" onClick={async () => {
              try {
                const n = await definirClasses(sugestoes.map(x => ({ ticker: x.ticker, classe: x.para })))
                setSugestoes(null)
                recibo(`${n} ativo${n === 1 ? '' : 's'} marcado${n === 1 ? '' : 's'} como ETF.`, 'ok')
              } catch (e) { recibo(e.message, 'erro') }
            }}>Aplicar a {sugestoes.length}</button>
          </div>
        </div>
      )}

      <div className="rolagem">
        <table>
          <thead><tr>
            <th>Ativo</th>
            <th style={{ textAlign: 'left' }}>Classe</th>
            <th style={{ textAlign: 'left' }}>Definida por</th>
            <th style={{ textAlign: 'left' }}>Sugestão</th>
            <th>Valor</th><th />
          </tr></thead>
          <tbody>{ativos.map(p => {
            const manual = Boolean(mapaClasses[p.ticker])
            const sugerida = inferirClasse(p.ticker, '')
            const diverge = sugerida !== 'Outro' && sugerida !== p.classe
            return (
              <tr key={p.ticker}>
                <td>
                  <span className="risco-classe" style={{ background: corClasse(p.classe) }} />
                  <span className="ticker">{p.ticker}</span>
                </td>
                <td style={{ textAlign: 'left' }}>
                  <select value={p.classe} disabled={!podeEscrever}
                    onChange={async e => {
                      try {
                        await definirClasse(p.ticker, e.target.value)
                        recibo(`${p.ticker} agora é ${e.target.value}.`, 'ok')
                      } catch (err) { recibo(err.message, 'erro') }
                    }}
                    style={{ padding: '4px 8px', border: '1px solid var(--linha)', borderRadius: 3, background: '#fff' }}>
                    {LISTA_CLASSES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--tinta-3)' }}>
                  {manual ? 'você' : 'deduzida do código'}
                </td>
                <td style={{ textAlign: 'left' }}>
                  {diverge ? (
                    <button className="btn mini vazio" disabled={!podeEscrever}
                      onClick={async () => {
                        try {
                          await definirClasse(p.ticker, sugerida)
                          recibo(`${p.ticker} agora é ${sugerida}.`, 'ok')
                        } catch (err) { recibo(err.message, 'erro') }
                      }}>usar {sugerida}</button>
                  ) : <span className="nulo" style={{ fontSize: 11.5 }}>—</span>}
                </td>
                <td className="n">{fmtBRL(p.valorAtual)}</td>
                <td>{manual && podeEscrever && (
                  <button className="btn mini vazio" onClick={async () => {
                    await limparClasse(p.ticker)
                    recibo(`${p.ticker} voltou à dedução automática.`)
                  }}>Voltar ao automático</button>
                )}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
    </Painel>
  )
}

function Duplicatas() {
  const { previewDuplicatas, apagarOperacoes, podeEscrever } = useDados()
  const recibo = useRecibo()
  const [ocupado, setOcupado] = useState(false)
  const [desmarcados, setDesmarcados] = useState(() => new Set())
  const pares = previewDuplicatas()

  if (!pares.length) return null

  const marcados = pares.filter(p => !desmarcados.has(p.sai.id))
  const valor = marcados.reduce((s, p) => s + Math.abs(Number(p.sai.quantidade)) * Number(p.sai.preco), 0)
  const alternar = id => setDesmarcados(d => {
    const n = new Set(d)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  return (
    <Painel titulo="Operações em dobro" aoLado={`${pares.length} suspeita${pares.length === 1 ? '' : 's'}`}>
      <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
        Cada par abaixo é o mesmo papel, mesma quantidade e mesmo preço, com poucos dias de intervalo.
        Quase sempre é o relatório de Negociação e o de Movimentação descrevendo o mesmo negócio — um na
        data do pregão, outro na liquidação. <strong>Confira antes de apagar:</strong> se você de fato
        comprou o mesmo papel duas vezes na mesma semana, desmarque a linha.
      </p>

      <div className="rolagem" style={{ marginBottom: 16, maxHeight: 380, overflowY: 'auto' }}>
        <table>
          <thead><tr>
            <th style={{ width: 40 }}>Apagar</th><th>Ativo</th><th>Fica</th><th>Sai</th>
            <th>Qtd.</th><th>Preço</th><th>Intervalo</th>
          </tr></thead>
          <tbody>{pares.map(p => (
            <tr key={p.sai.id} style={{ opacity: desmarcados.has(p.sai.id) ? .45 : 1 }}>
              <td><input type="checkbox" checked={!desmarcados.has(p.sai.id)}
                onChange={() => alternar(p.sai.id)} style={{ accentColor: 'var(--vermelho)' }} /></td>
              <td><span className="ticker">{p.sai.ticker}</span><span className="classe">{p.sai.tipo}</span></td>
              <td className="n">{fmtData(p.fica.data)}
                <span className="classe">{p.fica.fonte || 'origem não registrada'}</span></td>
              <td className="n" style={{ color: 'var(--vermelho)' }}>{fmtData(p.sai.data)}
                <span className="classe">{p.sai.fonte || 'origem não registrada'}</span></td>
              <td className="n">{fmtQtd(p.sai.quantidade)}</td>
              <td className="n">{fmtBRL(p.sai.preco)}</td>
              <td className="n">{p.diasEntre} dia{p.diasEntre === 1 ? '' : 's'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="aviso info" style={{ marginBottom: 14 }}>
        Apagando as {marcados.length} marcadas, saem <strong>{fmtBRL(valor)}</strong> em lançamentos.
        Compare com a diferença que você viu contra a B3.
      </div>

      <button className="btn perigo" disabled={ocupado || !podeEscrever || !marcados.length}
        onClick={async () => {
          setOcupado(true)
          try {
            const n = await apagarOperacoes(marcados.map(p => p.sai.id))
            setDesmarcados(new Set())
            recibo(`${n} lançamento${n === 1 ? '' : 's'} removido${n === 1 ? '' : 's'}.`, 'ok')
          } catch (e) { recibo(e.message, 'erro') } finally { setOcupado(false) }
        }}>{ocupado ? 'Removendo…' : `Apagar ${marcados.length} lançamentos`}</button>
      <div className="dica" style={{ marginTop: 10 }}>
        Baixe o backup .json antes. Depois, volte em Importações, solte o relatório de Posição e use a aba
        Conferência para ver se as quantidades passaram a bater com a custódia.
      </div>
    </Painel>
  )
}


/**
 * Quando a carteira acumulou importações erradas e correções por cima,
 * reconstruir a partir dos arquivos da B3 sai mais confiável que remendar.
 */
function Recomecar() {
  const { operacoes, proventos, recomecarCarteira, podeEscrever } = useDados()
  const recibo = useRecibo()
  const [aberto, setAberto] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [ocupado, setOcupado] = useState(false)

  if (!operacoes.length && !proventos.length) return null

  return (
    <Painel titulo="Recomeçar a carteira" aoLado="último recurso">
      {!aberto ? (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
            Apaga as {operacoes.length} operações e os {proventos.length} proventos desta carteira, para
            você reimportar tudo dos arquivos da B3. Cotações, alocação alvo, premissas de preço teto e as
            classes que você definiu <strong>permanecem</strong>.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
            Vale a pena quando a carteira passou por importações erradas e correções manuais em cima. Os
            arquivos da B3 são a fonte original: reconstruir a partir deles costuma sair mais limpo do
            que caçar cada lançamento indevido.
          </p>
          <button className="btn vazio" onClick={() => setAberto(true)} disabled={!podeEscrever}>
            Quero recomeçar
          </button>
        </>
      ) : (
        <>
          <div className="aviso erro" style={{ marginBottom: 14, lineHeight: 1.65 }}>
            <strong>Isto não tem desfazer.</strong> Antes de seguir, baixe o backup .json no painel
            Exportar, mais abaixo nesta tela. Confirme que você tem em mãos os arquivos de Negociação e
            de Movimentação de todos os anos — sem eles, a carteira fica vazia.
          </div>
          <label className="campo" style={{ maxWidth: 320 }}>
            <span className="rotulo">Digite RECOMEÇAR para liberar</span>
            <input value={confirmacao} onChange={e => setConfirmacao(e.target.value)} autoComplete="off" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn vazio" onClick={() => { setAberto(false); setConfirmacao('') }}>
              Cancelar
            </button>
            <button className="btn perigo" disabled={confirmacao.trim().toUpperCase() !== 'RECOMEÇAR' || ocupado}
              onClick={async () => {
                setOcupado(true)
                try {
                  await recomecarCarteira()
                  setAberto(false); setConfirmacao('')
                  recibo('Carteira zerada. Agora reimporte os arquivos da B3.', 'ok')
                } catch (e) { recibo(e.message, 'erro') } finally { setOcupado(false) }
              }}>{ocupado ? 'Apagando…' : 'Apagar e recomeçar'}</button>
          </div>
        </>
      )}
    </Painel>
  )
}
