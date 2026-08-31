import { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react'
import { corClasse } from '../lib/formato'

/* ---------- guilhoché: o padrão gravado das cédulas, feito por código ---------- */
export function Guilhoche({ intensidade = .35 }) {
  const d = useMemo(() => {
    const w = 900, h = 260, i = Math.max(0, Math.min(1, intensidade)), linhas = 26
    let caminho = ''
    for (let L = 0; L < linhas; L++) {
      const y0 = (h / (linhas - 1)) * L
      const fase = L * .38
      const amp = (5 + i * 20) * Math.sin(L / linhas * Math.PI)
      let p = `M0 ${y0.toFixed(1)}`
      for (let x = 0; x <= w; x += 18) {
        const y = y0 + Math.sin(x / 108 + fase) * amp + Math.sin(x / 47 - fase * 1.7) * amp * .32
        p += ` L${x} ${y.toFixed(1)}`
      }
      caminho += p + ' '
    }
    return caminho
  }, [intensidade])
  return (
    <svg className="guilhoche" viewBox="0 0 900 260" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="#0B6E4F" strokeWidth=".45" strokeOpacity=".3" />
    </svg>
  )
}

/* ---------- contagem: o patrimônio sobe até o valor real na primeira
   exibição da tela, como um contador de banca — só uma vez, sem disputar
   atenção depois disso, e sem animar nada se a pessoa pediu menos movimento. */
export function useContagem(alvo, duracaoMs = 900) {
  const [valor, setValor] = useState(alvo)
  const primeiraVez = useRef(true)
  useEffect(() => {
    if (!primeiraVez.current) { setValor(alvo); return }
    primeiraVez.current = false
    const reduzido = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduzido || !isFinite(alvo)) { setValor(alvo); return }
    const inicio = performance.now()
    let quadro
    const passo = agora => {
      const t = Math.min(1, (agora - inicio) / duracaoMs)
      const suavizado = 1 - Math.pow(1 - t, 3)
      setValor(alvo * suavizado)
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo])
  return valor
}

/* ---------- recibos (avisos passageiros) ---------- */
const CtxRecibo = createContext(() => {})
export const useRecibo = () => useContext(CtxRecibo)

export function ProvedorRecibos({ children }) {
  const [itens, setItens] = useState([])
  const mostrar = (texto, tipo = '') => {
    const id = Math.random().toString(36).slice(2)
    setItens(a => [...a, { id, texto, tipo }])
    setTimeout(() => setItens(a => a.filter(x => x.id !== id)), 3800)
  }
  return (
    <CtxRecibo.Provider value={mostrar}>
      {children}
      <div className="recibos">
        {itens.map(i => <div key={i.id} className={'recibo ' + i.tipo}>{i.texto}</div>)}
      </div>
    </CtxRecibo.Provider>
  )
}

/* ---------- modal ---------- */
export function Modal({ titulo, largo, aoFechar, pe, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', esc)
    const alvo = ref.current?.querySelector('input,select,textarea,button:not(.fechar)')
    alvo?.focus()
    return () => document.removeEventListener('keydown', esc)
  }, [aoFechar])
  return (
    <div className="cortina" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className={'modal' + (largo ? ' largo' : '')} ref={ref} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cab">
          <h3>{titulo}</h3>
          <button className="fechar" type="button" onClick={aoFechar} aria-label="Fechar">&times;</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {pe && <div className="modal-pe">{pe}</div>}
      </div>
    </div>
  )
}

export function Confirmacao({ titulo, texto, rotulo = 'Confirmar', perigo, aoConfirmar, aoFechar }) {
  return (
    <Modal titulo={titulo} aoFechar={aoFechar} pe={<>
      <button className="btn vazio" type="button" onClick={aoFechar}>Cancelar</button>
      <button className={'btn ' + (perigo ? 'perigo' : 'verde')} type="button"
        onClick={() => { aoConfirmar(); aoFechar() }}>{rotulo}</button>
    </>}>
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{texto}</p>
    </Modal>
  )
}

/* ---------- painel ---------- */
export function Painel({ titulo, aoLado, children, corpo = true }) {
  return (
    <div className="painel">
      {(titulo || aoLado) && (
        <div className="painel-cab">
          <h3>{titulo}</h3>
          {aoLado && <span className="rotulo">{aoLado}</span>}
        </div>
      )}
      {corpo ? <div className="painel-corpo">{children}</div> : children}
    </div>
  )
}

export const Vazio = ({ children }) => <div className="vazio-estado">{children}</div>

/* ---------- rosca de alocação ---------- */
export function Rosca({ fatias, total }) {
  if (!fatias.length || total <= 0) return <Vazio><p>Sem posições em aberto.</p></Vazio>
  const R = 78, r = 50, cx = 96, cy = 96, rMeio = (R + r) / 2
  let ang = -Math.PI / 2
  const rotulos = []
  const partes = fatias.map(f => {
    const fr = f.valor / total
    const a2 = ang + fr * Math.PI * 2
    const grande = fr > .5 ? 1 : 0
    const P = (a, raio) => `${(cx + Math.cos(a) * raio).toFixed(2)} ${(cy + Math.sin(a) * raio).toFixed(2)}`
    const d = fr > .9995 ? null
      : `M${P(ang, R)} A${R} ${R} 0 ${grande} 1 ${P(a2, R)} L${P(a2, r)} A${r} ${r} 0 ${grande} 0 ${P(ang, r)} Z`
    const el = d
      ? <path key={f.chave} d={d} fill={f.cor} stroke="var(--cedula-3)" strokeWidth="1.5"><title>{f.chave}: {(fr * 100).toFixed(1).replace('.', ',')}%</title></path>
      : <circle key={f.chave} cx={cx} cy={cy} r={rMeio} fill="none" stroke={f.cor} strokeWidth={R - r} />
    // rótulo de porcentagem só nas fatias grandes o bastante pra caber o
    // número sem virar uma sopa de letrinhas espremidas
    if (fr > .045) {
      const angMeio = ang + (a2 - ang) / 2
      rotulos.push(
        <text key={'r' + f.chave} x={cx + Math.cos(angMeio) * rMeio} y={cy + Math.sin(angMeio) * rMeio + 3}
          textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fontWeight="600" fill="#fff"
          style={{ pointerEvents: 'none' }}>{Math.round(fr * 100)}%</text>
      )
    }
    ang = a2
    return el
  })
  return (
    <svg viewBox="0 0 192 192" style={{ width: '100%', maxWidth: 200, display: 'block', margin: '0 auto' }}
      role="img" aria-label="Distribuição por classe">
      {partes}
      {rotulos}
    </svg>
  )
}

/* ---------- barras ---------- */
export function Barras({ itens, max, marcador }) {
  const teto = max || Math.max(...itens.map(i => i.valor), 0.01)
  return (
    <div className="barras">
      {itens.map(i => (
        <div className="barra-item" key={i.chave}>
          <div className="cab">
            <span>{i.rotulo}</span>
            <span className="v">{i.direita}</span>
          </div>
          <div className="trilho">
            <i style={{ width: `${Math.max(1.5, Math.min(100, i.valor / teto * 100))}%`, background: i.cor || 'var(--verde)' }} />
            {marcador && i.alvo != null && (
              <span className="marcador" style={{ left: `${Math.min(100, i.alvo / teto * 100)}%` }}
                title={`alvo ${i.alvo.toFixed(1)}%`} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- evolução do patrimônio ---------- */
/** Rótulo curto para caber em cima de uma barra estreita: 21273 → "21,3k". */
function rotuloValor(v) {
  const abs = Math.abs(v)
  if (abs >= 1000) return (v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k'
  return Math.round(v).toLocaleString('pt-BR')
}

/** Arredonda pra um número "redondo" (1, 2 ou 5 × potência de 10) — é o
 * mesmo truque que qualquer gráfico de verdade usa pra a grade do eixo
 * cair em 50, 100, 150 em vez de 47, 94, 141. */
function passoBonito(bruto) {
  if (bruto <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(bruto)))
  const frac = bruto / exp
  const bonito = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return bonito * exp
}

/**
 * Igual a Colunas na grade, diferente no que faz com a ausência de dado.
 * Em proventos, um mês sem crédito é um zero de verdade. Aqui não: um mês
 * sem fotografia é um mês em que a carteira ainda não estava sendo
 * acompanhada — vira um traço mudo na base, não uma barra de zero.
 */
export function Evolucao({ dados, formatar }) {
  const comDado = dados.filter(d => d.valor != null)
  if (!comDado.length) return <Vazio><p>Ainda sem fotografias registradas.</p></Vazio>
  const max = Math.max(...comDado.map(d => d.valor), 0.01)
  const min = Math.min(...comDado.map(d => d.valor), max)
  const piso = min > 0 ? min * .92 : 0
  const W = 720, H = 170, pad = 26
  const larg = (W - pad * 2) / dados.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Evolução do patrimônio">
      {dados.map((d, i) => {
        const x = pad + i * larg + larg * .18, w = larg * .64
        if (d.valor == null) {
          return (
            <g key={i}>
              <rect x={x} y={H - 25} width={w} height="1.5" fill="var(--linha)" />
              <text x={x + w / 2} y={H - 8} textAnchor="middle" fontFamily="var(--mono)"
                fontSize="9.5" fill="var(--tinta-4)">{d.rotulo}</text>
            </g>
          )
        }
        const h = Math.max(2, (d.valor - piso) / (max - piso || 1) * (H - 44))
        const y = H - 24 - h
        return (
          <g key={i}>
            <text x={x + w / 2} y={y - 4} textAnchor="middle" fontFamily="var(--mono)"
              fontSize="8.5" fill="var(--tinta-2)">{rotuloValor(d.valor)}</text>
            <rect x={x} y={y} width={w} height={h}
              fill={d.estimado ? 'var(--ambar)' : 'var(--verde)'} opacity={d.estimado ? .45 : .85} rx="1.5">
              <title>{d.rotulo}: {formatar(d.valor)}{d.estimado ? ' (capital aportado, sem cotação histórica)' : ''}</title>
            </rect>
            <text x={x + w / 2} y={H - 8} textAnchor="middle" fontFamily="var(--mono)"
              fontSize="9.5" fill="var(--tinta-3)">{d.rotulo}</text>
          </g>
        )
      })}
    </svg>
  )
}

/* ---------- colunas mensais ---------- */
export function Colunas({ dados, formatar }) {
  if (!dados.length) return <Vazio><p>Nada registrado ainda.</p></Vazio>
  const max = Math.max(...dados.map(d => d.valor), 0.01)
  const W = 720, H = 220, padEsq = 40, padDir = 12, padBaixo = 26, padCima = 28
  const larg = (W - padEsq - padDir) / dados.length
  const media = dados.reduce((s, d) => s + d.valor, 0) / dados.length

  // grade do eixo: 4 faixas, com o teto arredondado pra cima do maior valor
  const passo = passoBonito(max / 4 || 1)
  const teto = Math.max(passo, Math.ceil(max / passo) * passo)
  const nLinhas = Math.round(teto / passo)
  const linhasGrade = Array.from({ length: nLinhas + 1 }, (_, i) => passo * i)
  const yDe = v => H - padBaixo - (v / teto) * (H - padBaixo - padCima)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Série mensal">
      {linhasGrade.map((v, i) => (
        <g key={i}>
          <line x1={padEsq} y1={yDe(v)} x2={W - padDir} y2={yDe(v)} stroke="var(--linha)" strokeWidth="1" />
          <text x={padEsq - 6} y={yDe(v) + 3} textAnchor="end" fontFamily="var(--mono)"
            fontSize="8" fill="var(--tinta-4)">{rotuloValor(v)}</text>
        </g>
      ))}
      <line x1={padEsq} y1={yDe(media)} x2={W - padDir} y2={yDe(media)} stroke="var(--ambar)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={W - padDir} y={yDe(media) - 5} textAnchor="end" fontFamily="var(--mono)"
        fontSize="9" fill="var(--ambar)">média {formatar(media)}</text>
      {dados.map((d, i) => {
        const x = padEsq + i * larg + larg * .18, w = larg * .64
        const y = yDe(d.valor), h = Math.max(1, H - padBaixo - y)
        return (
          <g key={i}>
            {d.valor > 0 && (
              <text x={x + w / 2} y={y - 5} textAnchor="middle" fontFamily="var(--mono)"
                fontSize="7.5" fill="var(--tinta-2)">{rotuloValor(d.valor)}</text>
            )}
            <rect x={x} y={y} width={w} height={h} fill="var(--verde)" opacity={d.valor > 0 ? .85 : .2} rx="3">
              <title>{d.rotulo}: {formatar(d.valor)}</title>
            </rect>
            <text x={x + w / 2} y={H - 9} textAnchor="middle" fontFamily="var(--mono)"
              fontSize="8.5" fill="var(--tinta-3)">{d.rotulo}</text>
          </g>
        )
      })}
    </svg>
  )
}

export const Ponto = ({ classe, cor }) => (
  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2,
    background: cor || corClasse(classe), marginRight: 6 }} />
)

/** Seta de acordeão — gira quando o bloco está aberto. */
export const Seta = ({ aberta }) => (
  <svg className={'seta-grupo' + (aberta ? ' aberta' : '')} width="11" height="11" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export const iniciais = nome => String(nome || '').trim().split(/\s+/).slice(0, 2)
  .map(p => p[0]).join('').toUpperCase() || '?'
