/**
 * gminvest — convite de cadastro
 *
 * Gera um token próprio (não é o link mágico do Supabase) e guarda só o
 * hash dele no banco — o token bruto sai desta função e nunca mais é
 * salvo em lugar nenhum. Isso evita dois problemas do link mágico nativo:
 *   1. depender da configuração de Site URL / Redirect URLs do Supabase;
 *   2. ser de uso único e morrer sozinho quando o WhatsApp pré-carrega o
 *      link para montar a prévia, antes de qualquer humano clicar.
 *
 * Aqui, abrir o link (GET, na tela do app) não consome nada — só o envio
 * da senha (POST, na função aceitar-convite) consome o token.
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

const HORAS_DE_VALIDADE = 48

async function sha256Hex(texto: string) {
  const dados = new TextEncoder().encode(texto)
  const buf = await crypto.subtle.digest('SHA-256', dados)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function gerarToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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

    const comoChamador = createClient(url, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: quem, error: eQuem } = await comoChamador.auth.getUser()
    if (eQuem || !quem?.user) return responder({ erro: 'Sessão inválida.' }, 401)

    const admin = createClient(url, serviceKey)

    const { data: souAdmin } = await admin
      .from('administradores').select('usuario_id').eq('usuario_id', quem.user.id).maybeSingle()
    if (!souAdmin) return responder({ erro: 'Só administradores podem convidar.' }, 403)

    const { email } = await req.json()
    const limpo = String(email || '').trim().toLowerCase()
    if (!limpo || !limpo.includes('@')) return responder({ erro: 'Informe um e-mail válido.' }, 400)

    const token = gerarToken()
    const tokenHash = await sha256Hex(token)
    const expiraEm = new Date(Date.now() + HORAS_DE_VALIDADE * 3600 * 1000).toISOString()

    const { error: eTabela } = await admin.from('convites_cadastro').upsert({
      email: limpo, token_hash: tokenHash, expira_em: expiraEm,
      convidado_por: quem.user.id, usado_em: null,
    }, { onConflict: 'email' })
    if (eTabela) throw eTabela

    return responder({ ok: true, token, horasDeValidade: HORAS_DE_VALIDADE })
  } catch (e) {
    return responder({ erro: (e as Error).message }, 500)
  }
})
