import { useState } from 'react'
import { useSessao } from '../ctx/Sessao'
import { Guilhoche } from '../comp/base'
import { configurado } from '../lib/supabase'

export default function Login() {
  const { entrar, cadastrar, recuperar } = useSessao()
  const [modo, setModo] = useState('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  if (!configurado) return (
    <div className="acesso"><div className="folha">
      <div className="marca"><div className="selo">g</div><h1>gfin</h1></div>
      <div className="cedula"><div className="cedula-corpo">
        <div className="aviso erro">
          <strong>Falta configurar o Supabase.</strong><br />
          Crie um arquivo <code>.env</code> na raiz do projeto com <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, copiando de <code>.env.example</code>. Depois reinicie o{' '}
          <code>npm run dev</code> — variáveis de ambiente só são lidas na partida.
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
      } else if (modo === 'cadastrar') {
        if (senha.length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.')
        if (senha !== senha2) throw new Error('As senhas não conferem.')
        const { data, error } = await cadastrar(email, senha, nome)
        if (error) throw error
        setMsg(data.session
          ? null
          : { tipo: 'ok', texto: 'Conta criada. Confirme o e-mail que acabou de chegar e volte para entrar.' })
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
    cadastrar: ['Criar conta', 'Cada pessoa tem a sua'],
    recuperar: ['Recuperar acesso', 'Enviamos um link por e-mail'],
  }
  const [rotulo, sub] = titulos[modo]

  return (
    <div className="acesso"><div className="folha">
      <div className="marca">
        <div className="selo">g</div>
        <h1>gfin</h1>
        <p>Carteiras de investimento independentes, uma conta por pessoa.</p>
      </div>
      <div className="cedula">
        <Guilhoche intensidade={.3} />
        <div className="cedula-corpo">
          <div className="rotulo">{sub}</div>
          <form onSubmit={enviar} style={{ marginTop: 16 }}>
            {modo === 'cadastrar' && (
              <label className="campo"><span className="rotulo">Nome</span>
                <input value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" required />
              </label>
            )}
            <label className="campo"><span className="rotulo">E-mail</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" required />
            </label>
            {modo !== 'recuperar' && (
              <label className="campo"><span className="rotulo">Senha</span>
                <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                  autoComplete={modo === 'cadastrar' ? 'new-password' : 'current-password'} required />
              </label>
            )}
            {modo === 'cadastrar' && (
              <label className="campo"><span className="rotulo">Repita a senha</span>
                <input type="password" value={senha2} onChange={e => setSenha2(e.target.value)}
                  autoComplete="new-password" required />
              </label>
            )}
            {msg && <div className={'aviso ' + msg.tipo} style={{ marginBottom: 14 }}>{msg.texto}</div>}
            <button className="btn verde cheio" disabled={ocupado}>
              {ocupado ? 'Aguarde…' : rotulo}
            </button>
          </form>
          <div style={{ marginTop: 16, display: 'flex', gap: 14, justifyContent: 'center', fontSize: 12.5, flexWrap: 'wrap' }}>
            {modo !== 'entrar' && <button className="btn mini vazio" type="button" onClick={() => { setModo('entrar'); setMsg(null) }}>Já tenho conta</button>}
            {modo !== 'cadastrar' && <button className="btn mini vazio" type="button" onClick={() => { setModo('cadastrar'); setMsg(null) }}>Criar conta</button>}
            {modo === 'entrar' && <button className="btn mini vazio" type="button" onClick={() => { setModo('recuperar'); setMsg(null) }}>Esqueci a senha</button>}
          </div>
        </div>
      </div>
      <div className="microimpressao">
        {' CUSTÓDIA · ACESSO POR CONTA · CADA CARTEIRA COM SEU DONO E SEUS CONVIDADOS · '.repeat(24)}
      </div>
    </div></div>
  )
}
