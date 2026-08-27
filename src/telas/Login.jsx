import { useState } from 'react'
import { useSessao } from '../ctx/Sessao'
import { Guilhoche } from '../comp/base'
import { configurado, problema, aviso } from '../lib/supabase'

export default function Login() {
  const { entrar, recuperar } = useSessao()
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  if (!configurado) return (
    <div className="acesso"><div className="folha">
      <div className="marca"><img src="/logo-claro.png" alt="gm Invest" className="marca-logo" /></div>
      <div className="cedula"><div className="cedula-corpo">
        <div className="aviso erro">
          <strong>Falta configurar o Supabase.</strong><br />
          {problema}<br /><br />
          Local: preencha o <code>.env</code> na raiz do projeto, copiando de <code>.env.example</code>,
          e reinicie o <code>npm run dev</code> — variáveis de ambiente só são lidas na partida.<br />
          Netlify: cadastre em Site settings → Environment variables e depois use
          Deploys → Trigger deploy, porque salvar a variável sozinho não republica o site.
        </div>
      </div></div>
    </div></div>
  )

  async function enviar(e) {
    e.preventDefault()
    setMsg(null); setOcupado(true)
    try {
      if (modo === 'recuperar') {
        const { error } = await recuperar(email)
        if (error) throw error
        setMsg({ tipo: 'ok', texto: 'Se existir conta com esse e-mail, o link de redefinição foi enviado.' })
      } else {
        const { error } = await entrar(email, senha)
        if (error) throw new Error(
          error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message)
      }
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message })
    } finally { setOcupado(false) }
  }

  const titulos = {
    entrar: ['Entrar', 'Acesse sua carteira'],
    recuperar: ['Recuperar acesso', 'Enviamos um link por e-mail'],
  }
  const [rotulo, sub] = titulos[modo]

  return (
    <div className="acesso"><div className="folha">
      <div className="marca">
        <img src="/logo-claro.png" alt="gm Invest" className="marca-logo" />
      </div>
      <div className="cedula">
        <Guilhoche intensidade={.3} />
        <div className="cedula-corpo">
          {aviso && <div className="aviso atencao" style={{ marginBottom: 16 }}>{aviso}</div>}
          <div className="rotulo">{sub}</div>
          <form onSubmit={enviar} style={{ marginTop: 16 }}>
            <label className="campo"><span className="rotulo">E-mail</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" required />
            </label>
            {modo !== 'recuperar' && (
              <label className="campo"><span className="rotulo">Senha</span>
                <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                  autoComplete="current-password" required />
              </label>
            )}
            {msg && <div className={'aviso ' + msg.tipo} style={{ marginBottom: 14 }}>{msg.texto}</div>}
            <button className="btn verde cheio" disabled={ocupado}>
              {ocupado ? 'Aguarde…' : rotulo}
            </button>
          </form>
          <div style={{ marginTop: 16, display: 'flex', gap: 14, justifyContent: 'center', fontSize: 12.5, flexWrap: 'wrap' }}>
            {modo !== 'entrar' && <button className="btn mini vazio" type="button" onClick={() => { setModo('entrar'); setMsg(null) }}>Já tenho conta</button>}
            {modo === 'entrar' && <button className="btn mini vazio" type="button" onClick={() => { setModo('recuperar'); setMsg(null) }}>Esqueci a senha</button>}
          </div>
        </div>
      </div>
    </div></div>
  )
}
