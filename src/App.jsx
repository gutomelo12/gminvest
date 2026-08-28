import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useSessao } from './ctx/Sessao'
import { ProvedorDados, useDados } from './ctx/Dados'
import { Guilhoche, ProvedorRecibos, iniciais } from './comp/base'
import { fmtBRL, fmtHora } from './lib/formato'
import Login from './telas/Login'
import DefinirSenha from './telas/DefinirSenha'
import AceitarConvite from './telas/AceitarConvite'
import Resumo from './telas/Resumo'
import Posicoes from './telas/Posicoes'
import Operacoes from './telas/Operacoes'
import Proventos from './telas/Proventos'
import Alocacao from './telas/Alocacao'
import PrecoTeto from './telas/PrecoTeto'
import Cotacoes from './telas/Cotacoes'
// a leitura de planilhas carrega a SheetJS; só baixa quando a tela é aberta
const ImportarB3 = lazy(() => import('./telas/ImportarB3'))
import Ajustes, { SeletorCarteiras } from './telas/Ajustes'

const ICONES = {
  resumo:    'M3 13h4v6H3zM10 5h4v14h-4zM17 9h4v10h-4z',
  posicoes:  'M4 6h16M4 12h16M4 18h10',
  operacoes: 'M12 5v14M5 12h14',
  proventos: 'M12 3v18M8 7h6a3 3 0 010 6H9a3 3 0 000 6h7',
  alocacao:  'M12 3a9 9 0 109 9h-9V3z',
  teto:      'M3 17l6-6 4 4 7-7M14 4h7v7',
  cotacoes:  'M3 17l6-6 4 4 7-7M21 8v5h-5',
  b3:        'M12 3v12m0 0l-4-4m4 4l4-4M4 19h16',
  ajustes:   'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2m12 0h2M12 4v2m0 12v2',
}
const TELAS = {
  resumo:    'Resumo',
  posicoes:  'Posições',
  operacoes: 'Operações',
  proventos: 'Proventos',
  alocacao:  'Alocação',
  teto:      'Preço teto',
  cotacoes:  'Cotações',
  b3:        'Importações',
  ajustes:   'Ajustes',
}

export default function App() {
  const { usuario, carregando, precisaDefinirSenha } = useSessao()

  // link de convite (?convite=token) — não depende de sessão nenhuma,
  // por isso vem antes até da checagem de carregando. Só some da URL
  // depois de concluído, para não reaparecer se a pessoa atualizar a página.
  const [tokenConvite, setTokenConvite] = useState(
    () => new URLSearchParams(window.location.search).get('convite'))
  if (tokenConvite) {
    return <AceitarConvite token={tokenConvite} aoConcluir={() => {
      const u = new URL(window.location.href)
      u.searchParams.delete('convite')
      window.history.replaceState({}, '', u)
      setTokenConvite(null)
    }} />
  }

  if (carregando) return <div className="carregando">Carregando…</div>
  // vem antes de tudo — a pessoa já está autenticada pelo link do convite,
  // mas não pode entrar de fato sem antes escolher a própria senha
  if (precisaDefinirSenha) return <DefinirSenha />
  if (!usuario) return <Login />
  return (
    <ProvedorRecibos>
      <ProvedorDados><Interior /></ProvedorDados>
    </ProvedorRecibos>
  )
}

function Interior() {
  const d = useDados()
  const { sair } = useSessao()
  const [tela, setTela] = useState('resumo')

  /**
   * Busca as cotações uma vez por carteira aberta nesta sessão do
   * navegador — não a cada troca de tela, nem de novo se você recarregar
   * a página em seguida. Só quem pode editar dispara: leitura não grava.
   */
  const jaBuscou = useRef(new Set())
  useEffect(() => {
    if (!d.carteiraId || d.carregando || !d.podeEscrever) return
    if (jaBuscou.current.has(d.carteiraId)) return
    jaBuscou.current.add(d.carteiraId)
    d.atualizarCotacoesSilenciosamente()
  }, [d.carteiraId, d.carregando, d.podeEscrever])

  /**
   * Fotografa o patrimônio de hoje uma vez por carteira, por sessão. Espera
   * a busca de cotações terminar antes — senão a foto sai com preço de
   * ontem. Carteira só de renda fixa não tem cotação a buscar, então não
   * espera nada.
   */
  const jaFotografou = useRef(new Set())
  useEffect(() => {
    if (!d.carteiraId || d.carregando || !d.podeEscrever) return
    const pronto = !d.precisaCotar || d.statusAuto === 'ok' || d.statusAuto === 'erro'
    if (!pronto || jaFotografou.current.has(d.carteiraId)) return
    jaFotografou.current.add(d.carteiraId)
    d.registrarSnapshotSilenciosamente()
  }, [d.carteiraId, d.carregando, d.podeEscrever, d.statusAuto, d.precisaCotar])

  const [foco, setFoco] = useState(null)
  const [seletor, setSeletor] = useState(false)
  const [editandoOp, setEditandoOp] = useState(null)
  const [editandoPv, setEditandoPv] = useState(null)

  const ir = (t, arg) => { setTela(t); setFoco(arg ?? null); window.scrollTo(0, 0) }

  if (!d.carteiras.length && !d.carregando) return <PrimeiraCarteira />

  const t = d.calc.total
  const subtitulos = {
    resumo: d.operacoes.length
      ? `${t.ativos} ativo${t.ativos === 1 ? '' : 's'} em carteira · ${d.operacoes.length} operações registradas`
      : 'Carteira sem lançamentos',
    posicoes: 'Clique em um ativo para ver o histórico completo',
    operacoes: `${d.operacoes.length} lançamento${d.operacoes.length === 1 ? '' : 's'} na carteira`,
    proventos: `${fmtBRL(d.proventos.reduce((s, p) => s + Number(p.valor), 0))} recebidos em ${d.proventos.length} crédito${d.proventos.length === 1 ? '' : 's'}`,
    alocacao: 'Defina o peso de cada classe e simule o próximo aporte',
    teto: 'Bazin, Graham e Gordon lado a lado, com margem de segurança',
    cotacoes: t.semCotacao
      ? `${t.semCotacao} de ${t.ativos} ativos ainda sem preço de mercado`
      : `Todos os ${t.ativos} ativos têm cotação registrada`,
    b3: 'Extratos da B3 em planilha, ou notas da Nomad em PDF',
    ajustes: d.carteira?.nome || '',
  }

  const acoes = {
    resumo: d.podeEscrever && [['Lançar operação', () => { setEditandoOp({}); setTela('operacoes') }, 'verde']],
    posicoes: d.podeEscrever && [['Lançar operação', () => { setEditandoOp({}); setTela('operacoes') }, 'verde']],
    operacoes: d.podeEscrever && [
      ['Lançar operação', () => setEditandoOp({}), 'verde'],
      ['Importar da B3', () => ir('b3'), 'vazio'],
    ],
    proventos: d.podeEscrever && [['Lançar provento', () => setEditandoPv({}), 'verde']],
  }[tela] || []

  const Corpo = {
    resumo: <Resumo ir={ir} />,
    posicoes: <Posicoes ir={ir} />,
    operacoes: <Operacoes ir={ir} editando={editandoOp} setEditando={setEditandoOp} />,
    proventos: <Proventos ir={ir} editando={editandoPv} setEditando={setEditandoPv} />,
    alocacao: <Alocacao />,
    teto: <PrecoTeto focoTicker={foco} limparFoco={() => setFoco(null)} />,
    cotacoes: <Cotacoes ir={ir} />,
    b3: <Suspense fallback={<div className="carregando">Carregando o leitor de planilhas…</div>}><ImportarB3 ir={ir} /></Suspense>,
    ajustes: <Ajustes />,
  }[tela]

  return (
    <div className="app">
      <aside className="lateral">
        <div className="lateral-marca">
          <img src="/logo-escuro.png" alt="gm Invest" />
        </div>
        <div className="lateral-topo">
          <div className="rotulo">Carteira aberta</div>
          <button className="seletor" onClick={() => setSeletor(true)}>
            <span className="iniciais" style={{ background: d.carteira?.cor || '#0B6E4F' }}>
              {iniciais(d.carteira?.nome)}
            </span>
            <span className="nome">
              {d.carteira?.nome || '—'}
              {d.carteira?.papel !== 'dono' && d.carteira?.dono && (
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 400, opacity: .65 }}>
                  de {d.carteira.dono.nome || d.carteira.dono.email}
                </span>
              )}
            </span>
            <span className="seta">▾</span>
          </button>
        </div>
        <nav>
          {Object.entries(TELAS).map(([k, r]) => (
            <button key={k} className={tela === k ? 'ativo' : ''} onClick={() => ir(k)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICONES[k]} />
              </svg>
              <span>{r}</span>
            </button>
          ))}
        </nav>
        <div className="lateral-pe">
          {d.carteira?.papel === 'leitura' && <div style={{ marginBottom: 6 }}>Acesso de leitura</div>}
          <RelogioCotacoes d={d} />
          <button onClick={sair}>Sair da conta</button>
        </div>
      </aside>

      <main>
        <header className="cabecalho">
          <Guilhoche intensidade={Math.min(1, Math.log10(Math.max(1, t.valor)) / 6.5)} />
          <div className="cabecalho-corpo">
            <div>
              <h2>{TELAS[tela]}</h2>
              <div className="sub">{subtitulos[tela]}</div>
            </div>
            <div className="acoes-cab">
              {acoes.map(([rot, fn, cls]) => (
                <button key={rot} className={'btn ' + cls} onClick={fn}>{rot}</button>
              ))}
            </div>
          </div>
        </header>
        <div className="conteudo">
          {d.erro && <div className="aviso erro" style={{ marginBottom: 18 }}>{d.erro}</div>}
          {d.carregando ? <div className="carregando">Carregando a carteira…</div> : Corpo}
        </div>
      </main>

      {seletor && <SeletorCarteiras aoFechar={() => setSeletor(false)} />}
    </div>
  )
}

function PrimeiraCarteira() {
  const { criarCarteira } = useDados()
  const { sair, usuario } = useSessao()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  return (
    <div className="acesso"><div className="folha">
      <div className="marca">
        <img src="/logo-claro.png" alt="gm Invest" className="marca-logo marca-logo-mini" />
        <h1>Primeira carteira</h1>
        <p>Entrou como {usuario?.email}. Agora crie a carteira que você vai acompanhar.</p>
      </div>
      <div className="cedula">
        <Guilhoche intensidade={.3} />
        <div className="cedula-corpo">
          <label className="campo"><span className="rotulo">Nome da carteira</span>
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={60}
              placeholder="Ex.: Gustavo, Longo prazo, Reserva" autoFocus /></label>
          {erro && <div className="aviso erro" style={{ marginBottom: 12 }}>{erro}</div>}
          <button className="btn verde cheio" disabled={ocupado} onClick={async () => {
            if (nome.trim().length < 2) return setErro('Dê um nome à carteira.')
            setOcupado(true)
            try { await criarCarteira(nome.trim(), '#0B6E4F') }
            catch (e) { setErro(e.message); setOcupado(false) }
          }}>{ocupado ? 'Criando…' : 'Criar carteira'}</button>
          <div className="dica" style={{ marginTop: 12 }}>
            Se alguém te convidou para uma carteira, ela aparece sozinha assim que você entrar com o
            e-mail que recebeu o convite.
          </div>
          <button className="btn mini vazio" style={{ marginTop: 14 }} onClick={sair}>Sair da conta</button>
        </div>
      </div>
    </div></div>
  )
}

/** Mostra quando as cotações foram buscadas pela última vez, com o estado da busca automática. */
function RelogioCotacoes({ d }) {
  if (d.statusAuto === 'buscando') return <div style={{ marginBottom: 6 }}>Buscando cotações…</div>
  if (!d.ultimaAtualizacaoCotacoes) {
    if (d.statusAuto === 'erro') return <div style={{ marginBottom: 6 }}>Cotações: sem retorno agora</div>
    return null
  }
  const dt = new Date(d.ultimaAtualizacaoCotacoes)
  const hoje = new Date().toDateString() === dt.toDateString()
  return (
    <div style={{ marginBottom: 6 }}>
      Cotações {hoje ? 'hoje' : dt.toLocaleDateString('pt-BR')} às {fmtHora(d.ultimaAtualizacaoCotacoes)}
    </div>
  )
}
