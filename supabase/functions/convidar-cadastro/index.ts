/**
 * gminvest — convite de cadastro
 *
 * Cria uma conta nova e independente, sem vínculo com nenhuma carteira de
 * quem convida. Usa a chave de serviço do Supabase — por isso vive numa
 * função de servidor, nunca no navegador — para:
 *   1. registrar o e-mail em convites_cadastro (o gatilho do banco olha
 *      essa tabela antes de deixar qualquer cadastro acontecer, e a lista
 *      também alimenta o painel "Convites enviados" em Ajustes);
 *   2. gerar o link com auth.admin.generateLink, sem disparar nenhum
 *      e-mail — o link volta pronto para você copiar e mandar por onde
 *      quiser, no seu texto, na sua língua.
 *
 * Reenviar para um e-mail já convidado antes funciona: se a conta já
 * existe (mesmo que a pessoa nunca tenha terminado de entrar), a função
 * cai para um link de redefinição de senha em vez de tentar criar de novo.
 *
 * Só quem está na tabela `administradores` pode chamar esta função.
 * Publicar: npx supabase functions deploy convidar-cadastro
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return responder({ erro: 'Sem sessão.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // confirma quem está chamando, com o próprio token da pessoa
    const comoChamador = createClient(url, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: quem, error: eQuem } = await comoChamador.auth.getUser()
    if (eQuem || !quem?.user) return responder({ erro: 'Sessão inválida.' }, 401)

    const admin = createClient(url, serviceKey)

    const { data: souAdmin } = await admin
      .from('administradores').select('usuario_id').eq('usuario_id', quem.user.id).maybeSingle()
    if (!souAdmin) return responder({ erro: 'Só administradores podem convidar.' }, 403)

    const { email, redirectTo } = await req.json()
    const limpo = String(email || '').trim().toLowerCase()
    if (!limpo || !limpo.includes('@')) return responder({ erro: 'Informe um e-mail válido.' }, 400)

    const { error: eTabela } = await admin
      .from('convites_cadastro')
      .upsert({ email: limpo, convidado_por: quem.user.id }, { onConflict: 'email' })
    if (eTabela) throw eTabela

    let gerado = await admin.auth.admin.generateLink({ type: 'invite', email: limpo, options: { redirectTo } })
    let reenvio = false

    if (gerado.error?.message?.toLowerCase().includes('already been registered')) {
      // a conta já existe de um convite anterior — completo ou não. Um link
      // de redefinição de senha serve para os dois casos e passa pela mesma
      // tela de "definir senha" no app.
      reenvio = true
      gerado = await admin.auth.admin.generateLink({ type: 'recovery', email: limpo, options: { redirectTo } })
    }
    if (gerado.error) throw gerado.error

    const usuarioId = gerado.data?.user?.id || null
    if (usuarioId) {
      await admin.from('convites_cadastro').update({ usuario_id: usuarioId }).eq('email', limpo)
    }

    return responder({ ok: true, link: gerado.data?.properties?.action_link || null, reenvio })
  } catch (e) {
    return responder({ erro: (e as Error).message }, 500)
  }
})
