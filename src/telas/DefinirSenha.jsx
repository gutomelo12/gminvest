import { useState } from 'react'
import { useSessao } from '../ctx/Sessao'
import { Guilhoche } from '../comp/base'

/**
 * Tela que aparece depois de clicar no link do convite, antes de qualquer
 * outra coisa. O Supabase já autentica a pessoa nesse momento — se ela
 * fechasse a aba aqui, ficaria com uma conta sem senha definida, então
 * este passo é obrigatório, sem botão de pular.
 */
export default function DefinirSenha() {
  const { concluirDefinicaoDeSenha, sair } = useSessao()
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
    const { error } = await concluirDefinicaoDeSenha(senha)
    if (error) { setErro(error.message); setOcupado(false) }
  }

  return (
    <div className="acesso"><div className="folha">
      <div className="marca"><h1>gminvest</h1></div>
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
              {ocupado ? 'Salvando…' : 'Definir senha e entrar'}
            </button>
          </form>
          <button className="btn mini vazio" style={{ marginTop: 14 }} onClick={sair}>
            Não fui eu — sair
          </button>
        </div>
      </div>
    </div></div>
  )
}
