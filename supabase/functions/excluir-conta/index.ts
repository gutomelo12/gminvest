/**
 * gminvest — excluir a própria conta
 *
 * Quem chama só pode excluir a SI MESMO — o id nunca vem do corpo da
 * requisição, vem de decodificar o próprio token de quem chamou. Isso
 * evita qualquer chance de alguém pedir a exclusão de outra pessoa.
 *
 * Antes de excluir de verdade, dois travamentos de segurança:
 *
 * 1) Se a pessoa é dona de uma carteira que TEM outra gente com acesso
 *    (edição ou leitura), a exclusão é bloqueada — apagar a conta dela
 *    cascatearia e apagaria a carteira inteira, tirando o acesso de
 *    quem mais usa aquilo sem elas terem sido consultadas. A pessoa
 *    precisa primeiro remover esse acesso ou passar a carteira para
 *    outra dono em Ajustes → Quem acessa esta carteira.
 *
 * 2) Se a pessoa é a ÚNICA administradora do sistema, a exclusão é
 *    bloqueada — sem isso, ninguém mais conseguiria convidar gente nova
 *    pro gmINVEST depois.
 *
 * Passando os dois travamentos, um único delete em auth.users cuida do
 * resto sozinho: perfis, carteiras próprias (e tudo dentro delas — 
 * operações, proventos, alvos...), acessos a carteiras de outras pessoas,
 * e o registro de administrador, todos têm "on delete cascade" já
 * configurado no schema.
 *
 * Publicar: npx supabase functions deploy excluir-conta
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

    const comoChamador = createClient(url, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: quem, error: eQuem } = await comoChamador.auth.getUser()
    if (eQuem || !quem?.user) return responder({ erro: 'Sessão inválida.' }, 401)
    const meuId = quem.user.id

    const admin = createClient(url, serviceKey)

    // 1) alguma carteira minha tem outra pessoa com acesso?
    const { data: minhasCarteiras, error: eCarteiras } = await admin
      .from('carteiras').select('id, nome').eq('criada_por', meuId)
    if (eCarteiras) throw eCarteiras

    if (minhasCarteiras?.length) {
      const { data: acessosDeOutros, error: eAcessos } = await admin
        .from('acessos').select('carteira_id')
        .in('carteira_id', minhasCarteiras.map(c => c.id))
        .neq('usuario_id', meuId)
      if (eAcessos) throw eAcessos

      if (acessosDeOutros?.length) {
        const idsComOutros = new Set(acessosDeOutros.map(a => a.carteira_id))
        const nomes = minhasCarteiras.filter(c => idsComOutros.has(c.id)).map(c => c.nome)
        return responder({
          erro: `Antes de excluir a conta, resolva o acesso compartilhado em: ${nomes.join(', ')}. `
            + 'Remova quem mais acessa essas carteiras, ou passe a posição de dono para outra pessoa, '
            + 'em Ajustes → Quem acessa esta carteira.',
        }, 400)
      }
    }

    // 2) sou a única pessoa administradora do sistema?
    const { data: souAdmin } = await admin
      .from('administradores').select('usuario_id').eq('usuario_id', meuId).maybeSingle()
    if (souAdmin) {
      const { count, error: eCount } = await admin
        .from('administradores').select('usuario_id', { count: 'exact', head: true })
      if (eCount) throw eCount
      if ((count ?? 0) <= 1)
        return responder({
          erro: 'Você é a única pessoa administradora do gmINVEST — excluir sua conta impediria qualquer '
            + 'novo convite de cadastro no sistema. Torne outra pessoa administradora antes de excluir a sua conta.',
        }, 400)
    }

    const { error: eExcluir } = await admin.auth.admin.deleteUser(meuId)
    if (eExcluir) throw eExcluir

    return responder({ ok: true })
  } catch (e) {
    return responder({ erro: (e as Error).message }, 500)
  }
})
