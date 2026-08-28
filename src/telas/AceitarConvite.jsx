import { useState } from 'react'
import { sb, mensagemDeErroDaFuncao } from '../lib/supabase'
import { Guilhoche } from '../comp/base'

/**
 * Tela de quem chega pelo link de convite. Ainda não existe conta nenhuma
 * até este momento — abrir esta tela (um GET, uma pessoa só olhando) não
 * consome o convite. Só o envio da senha consome, o que evita o problema
 * de apps de mensagem queimarem o link ao montar a prévia sozinhos.
 */
export default function AceitarConvite({ token, aoConcluir }) {
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) return setErro('A senha precisa de pelo menos 8 caracteres.')
    if (senha !== senha2) return setErro('As senhas não conferem.')
    setOcupado(true)
    try {
      const { data, error } = await sb.functions.invoke('aceitar-convite', { body: { token, senha } })
      if (error) throw new Error(await mensagemDeErroDaFuncao(error, 'aceitar-convite'))
      if (data?.erro) throw new Error(data.erro)
      const { error: eLogin } = await sb.auth.signInWithPassword({ email: data.email, password: senha })
      if (eLogin) throw eLogin
      aoConcluir()
    } catch (err) {
      setErro(err.message)
      setOcupado(false)
    }
  }

  return (
    <div className="acesso"><div className="folha">
      <div className="marca"><img src="/logo-claro.png" alt="gm Invest" className="marca-logo" /></div>
      <div className="cedula">
        <Guilhoche intensidade={.3} />
        <div className="cedula-corpo">
          <div className="rotulo">Bem-vindo(a)</div>
          <p style={{ fontSize: 13, color: 'var(--tinta-3)', margin: '8px 0 18px', lineHeight: 1.6 }}>
            Você foi convidado(a) para o gminvest. Escolha uma senha para concluir o seu cadastro —
            esta conta é sua, independente de quem te convidou.
          </p>
          <form onSubmit={enviar}>
            <label className="campo"><span className="rotulo">Senha</span>
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                autoComplete="new-password" autoFocus required /></label>
            <label className="campo"><span className="rotulo">Repita a senha</span>
              <input type="password" value={senha2} onChange={e => setSenha2(e.target.value)}
                autoComplete="new-password" required /></label>
            {erro && <div className="aviso erro" style={{ marginBottom: 14 }}>{erro}</div>}
            <button className="btn verde cheio" disabled={ocupado}>
              {ocupado ? 'Criando conta…' : 'Criar conta e entrar'}
            </button>
          </form>
        </div>
      </div>
    </div></div>
  )
}
