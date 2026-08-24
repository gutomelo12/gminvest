import { createContext, useContext, useEffect, useState } from 'react'
import { sb, configurado } from '../lib/supabase'

const Ctx = createContext(null)
export const useSessao = () => useContext(Ctx)

export function ProvedorSessao({ children }) {
  const [sessao, setSessao] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!configurado) { setCarregando(false); return }
    sb.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // convites pendentes viram acesso assim que a pessoa entra
  useEffect(() => {
    if (sessao) sb.rpc('aceitar_convites').then(() => {})
  }, [sessao?.user?.id])

  const valor = {
    sessao,
    usuario: sessao?.user || null,
    carregando,
    entrar: (email, senha) => sb.auth.signInWithPassword({ email, password: senha }),
    cadastrar: (email, senha, nome) =>
      sb.auth.signUp({ email, password: senha, options: { data: { nome } } }),
    recuperar: email => sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
    trocarSenha: senha => sb.auth.updateUser({ password: senha }),
    sair: () => sb.auth.signOut(),
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
