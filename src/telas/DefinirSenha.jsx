import { useState } from 'react'
import { useSessao } from '../ctx/Sessao'
import { sb } from '../lib/supabase'
import { Guilhoche, Modal } from '../comp/base'
import { TermosDeUso, PoliticaPrivacidade } from './Legal'

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
  const [aceitouTermos, setAceitouTermos] = useState(false)
  const [verDocumento, setVerDocumento] = useState(null)
  const [erro, setErro] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) return setErro('A senha precisa de pelo menos 8 caracteres.')
    if (senha !== senha2) return setErro('As senhas não conferem.')
    if (!aceitouTermos) return setErro('Para continuar, é preciso aceitar os Termos de Uso e a Política de Privacidade.')
    setOcupado(true)
    const { error } = await concluirDefinicaoDeSenha(senha)
    if (error) { setErro(error.message); setOcupado(false); return }
    // best-effort: se isto falhar, não trava a entrada da pessoa por causa
    // disso — só não fica um registro do aceite desta vez
    try { await sb.rpc('registrar_aceite_termos') } catch { /* segue o baile */ }
  }

  return (
    <div className="acesso"><div className="folha">
      <div className="marca"><h1>gmINVEST</h1></div>
      <div className="cedula">
        <Guilhoche intensidade={.3} />
        <div className="cedula-corpo">
          <div className="rotulo">Bem-vindo(a)</div>
          <p style={{ fontSize: 13, color: 'var(--tinta-3)', margin: '8px 0 18px', lineHeight: 1.6 }}>
            Você foi convidado(a) para o gmINVEST. Escolha uma senha para concluir o seu cadastro —
            esta conta é sua, independente de quem te convidou.
          </p>
          <form onSubmit={enviar}>
            <label className="campo"><span className="rotulo">Senha</span>
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                autoComplete="new-password" autoFocus required /></label>
            <label className="campo"><span className="rotulo">Repita a senha</span>
              <input type="password" value={senha2} onChange={e => setSenha2(e.target.value)}
                autoComplete="new-password" required /></label>
            <label className="linha-cheque" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={aceitouTermos} style={{ marginTop: 2 }}
                onChange={e => setAceitouTermos(e.target.checked)} />
              <span>Li e aceito os{' '}
                <button type="button" className="link" onClick={() => setVerDocumento('termos')}>Termos de Uso</button>
                {' '}e a{' '}
                <button type="button" className="link" onClick={() => setVerDocumento('privacidade')}>Política de Privacidade</button>
              </span>
            </label>
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

      {verDocumento && (
        <Modal titulo={verDocumento === 'termos' ? 'Termos de Uso' : 'Política de Privacidade'}
          largo aoFechar={() => setVerDocumento(null)}
          pe={<button className="btn verde" onClick={() => setVerDocumento(null)}>Fechar</button>}>
          {verDocumento === 'termos' ? <TermosDeUso /> : <PoliticaPrivacidade />}
        </Modal>
      )}
    </div></div>
  )
}
