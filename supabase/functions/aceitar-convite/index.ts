/**
 * gminvest — aceitar convite
 *
 * Recebe o token bruto que a pessoa convidada tem em mãos (veio na URL,
 * ela nunca precisou de conta nenhuma até este momento) mais a senha que
 * ela escolheu. Confere a hash contra o que foi guardado, checa validade
 * e uso único, e só então cria a conta de verdade — tudo num só passo,
 * para não deixar conta pela metade se a pessoa desistir no meio.
 *
 * Sem cabeçalho de autorização: quem chama ainda não tem sessão nenhuma.
 * A segurança vem do próprio token, não de um login prévio.
 *
 * Publicar: npx supabase functions deploy aceitar-convite
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function sha256Hex(texto: string) {
  const dados = new TextEncoder().encode(texto)
  const buf = await crypto.subtle.digest('SHA-256', dados)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const { token, senha, aceitouTermos } = await req.json()
    if (!token || typeof token !== 'string') return responder({ erro: 'Convite inválido.' }, 400)
    if (!senha || senha.length < 8) return responder({ erro: 'A senha precisa de pelo menos 8 caracteres.' }, 400)
    // conferido aqui também, e não só na tela: uma chamada direta à função,
    // pulando o formulário, não pode criar conta sem o aceite
    if (aceitouTermos !== true)
      return responder({ erro: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    const tokenHash = await sha256Hex(token)
    const { data: convite } = await admin
      .from('convites_cadastro').select('email, expira_em, usado_em').eq('token_hash', tokenHash).maybeSingle()

    if (!convite) return responder({ erro: 'Convite inválido — o link pode estar incompleto ou já ter sido trocado por outro.' }, 400)
    if (convite.usado_em) return responder({ erro: 'Este convite já foi usado. Peça um novo a quem te convidou.' }, 400)
    if (new Date(convite.expira_em) < new Date())
      return responder({ erro: 'Este convite expirou. Peça um novo a quem te convidou.' }, 400)

    let usuarioId: string
    const criado = await admin.auth.admin.createUser({
      email: convite.email, password: senha, email_confirm: true,
    })

    if (criado.error) {
      if (!criado.error.message?.toLowerCase().includes('already been registered')) throw criado.error
      // a conta já existe — de um convite anterior já concluído. Em vez de
      // falhar, troca a senha: o efeito para quem está do outro lado é o
      // mesmo (entrar com essa senha), e ninguém precisa adivinhar por quê.
      let pagina = 1
      let existente = null
      while (!existente) {
        const { data: lista, error: eLista } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
        if (eLista) throw eLista
        existente = lista.users.find(u => u.email?.toLowerCase() === convite.email) || null
        if (!existente) {
          if (!lista.users.length || pagina > 20) break
          pagina++
        }
      }
      if (!existente) throw new Error('Conta já registrada, mas não encontrada para redefinir a senha.')
      const atualizado = await admin.auth.admin.updateUserById(existente.id, { password: senha })
      if (atualizado.error) throw atualizado.error
      usuarioId = existente.id
    } else {
      usuarioId = criado.data.user.id
    }

    await admin.from('convites_cadastro')
      .update({ usado_em: new Date().toISOString(), usuario_id: usuarioId })
      .eq('token_hash', tokenHash)

    // o gatilho que cria a linha em perfis roda no mesmo INSERT do
    // createUser acima, então a linha já existe neste ponto
    await admin.from('perfis')
      .update({ aceitou_termos_em: new Date().toISOString() })
      .eq('id', usuarioId)

    return responder({ ok: true, email: convite.email })
  } catch (e) {
    return responder({ erro: (e as Error).message }, 500)
  }
})
