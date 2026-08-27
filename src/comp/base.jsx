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
export function Rosca({ fatias, total, rotuloCentro }) {
  if (!fatias.length || total <= 0) return <Vazio><p>Sem posições em aberto.</p></Vazio>
  const R = 78, r = 50, cx = 96, cy = 96
  let ang = -Math.PI / 2
  const partes = fatias.map(f => {
    const fr = f.valor / total
    const a2 = ang + fr * Math.PI * 2
    const grande = fr > .5 ? 1 : 0
    const P = (a, raio) => `${(cx + Math.cos(a) * raio).toFixed(2)} ${(cy + Math.sin(a) * raio).toFixed(2)}`
    const d = fr > .9995 ? null
      : `M${P(ang, R)} A${R} ${R} 0 ${grande} 1 ${P(a2, R)} L${P(a2, r)} A${r} ${r} 0 ${grande} 0 ${P(ang, r)} Z`
    const el = d
      ? <path key={f.chave} d={d} fill={f.cor} stroke="var(--cedula-3)" strokeWidth="1.5"><title>{f.chave}</title></path>
      : <circle key={f.chave} cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke={f.cor} strokeWidth={R - r} />
    ang = a2
    return el
  })
  const maior = fatias[0]
  return (
    <svg viewBox="0 0 192 192" style={{ width: '100%', maxWidth: 200, display: 'block', margin: '0 auto' }}
      role="img" aria-label="Distribuição por classe">
      {partes}
      <text x="96" y="90" textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5"
        letterSpacing="1.4" fill="var(--tinta-3)">{rotuloCentro || 'MAIOR CLASSE'}</text>
      <text x="96" y="106" textAnchor="middle" fontFamily="var(--serif)"
        fontSize="15" fontWeight="600" fill="var(--tinta)">{maior.chave}</text>
      <text x="96" y="120" textAnchor="middle" fontFamily="var(--mono)" fontSize="10"
        fill="var(--tinta-3)">{(maior.valor / total * 100).toFixed(1).replace('.', ',')}%</text>
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
              <text x={x + w / 2} y={H - 9} textAnchor="middle" fontFamily="var(--mono)"
                fontSize="8.5" fill="var(--tinta-4)">{d.rotulo}</text>
            </g>
          )
        }
        const h = Math.max(2, (d.valor - piso) / (max - piso || 1) * (H - 44))
        const y = H - 24 - h
        return (
          <g key={i}>
            <text x={x + w / 2} y={y - 4} textAnchor="middle" fontFamily="var(--mono)"
              fontSize="7.5" fill="var(--tinta-2)">{rotuloValor(d.valor)}</text>
            <rect x={x} y={y} width={w} height={h} fill="var(--verde)" opacity=".85" rx="1.5">
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

/* ---------- colunas mensais ---------- */
export function Colunas({ dados, formatar }) {
  if (!dados.length) return <Vazio><p>Nada registrado ainda.</p></Vazio>
  const max = Math.max(...dados.map(d => d.valor), 0.01)
  const W = 720, H = 170, pad = 26
  const larg = (W - pad * 2) / dados.length
  const media = dados.reduce((s, d) => s + d.valor, 0) / dados.length
  const yMedia = H - 24 - (media / max) * (H - 44)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Série mensal">
      <line x1={pad} y1={yMedia} x2={W - pad} y2={yMedia} stroke="var(--ambar)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={W - pad} y={yMedia - 5} textAnchor="end" fontFamily="var(--mono)"
        fontSize="9" fill="var(--ambar)">média {formatar(media)}</text>
      {dados.map((d, i) => {
        const h = Math.max(1, (d.valor / max) * (H - 44))
        const x = pad + i * larg + larg * .18, w = larg * .64, y = H - 24 - h
        return (
          <g key={i}>
            {d.valor > 0 && (
              <text x={x + w / 2} y={y - 4} textAnchor="middle" fontFamily="var(--mono)"
                fontSize="7.5" fill="var(--tinta-2)">{rotuloValor(d.valor)}</text>
            )}
            <rect x={x} y={y} width={w} height={h} fill="var(--verde)" opacity={d.valor > 0 ? .85 : .2} rx="1.5">
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

export const iniciais = nome => String(nome || '').trim().split(/\s+/).slice(0, 2)
  .map(p => p[0]).join('').toUpperCase() || '?'
