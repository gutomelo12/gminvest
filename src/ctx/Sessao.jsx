import { createContext, useContext, useEffect, useState } from 'react'
import { sb, configurado } from '../lib/supabase'

const Ctx = createContext(null)
export const useSessao = () => useContext(Ctx)

export function ProvedorSessao({ children }) {
  const [sessao, setSessao] = useState(null)
  const [carregando, setCarregando] = useState(true)
  // o link de convite loga a pessoa ANTES de ela escolher uma senha — o
  // próprio Supabase dispara SIGNED_IN e, na sequência, PASSWORD_RECOVERY.
  // Enquanto essa flag estiver ligada, a Interior fica bloqueada atrás da
  // tela de "definir senha", mesmo já existindo uma sessão válida.
  const [precisaDefinirSenha, setPrecisaDefinirSenha] = useState(false)

  useEffect(() => {
    if (!configurado) { setCarregando(false); return }
    sb.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((evento, s) => {
      setSessao(s)
      if (evento === 'PASSWORD_RECOVERY') setPrecisaDefinirSenha(true)
    })
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
    precisaDefinirSenha,
    async concluirDefinicaoDeSenha(senha) {
      const r = await sb.auth.updateUser({ password: senha })
      if (!r.error) {
        setPrecisaDefinirSenha(false)
        // best-effort: se isto falhar, a pessoa ainda assim entra normalmente —
        // só o painel "Convites enviados" fica sem marcar que ela concluiu
        sb.rpc('marcar_convite_usado').then(() => {})
      }
      return r
    },
    entrar: (email, senha) => sb.auth.signInWithPassword({ email, password: senha }),
    recuperar: email => sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
    trocarSenha: senha => sb.auth.updateUser({ password: senha }),
    sair: () => sb.auth.signOut(),
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
