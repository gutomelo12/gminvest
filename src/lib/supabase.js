import { createClient } from '@supabase/supabase-js'

/**
 * O cliente monta os caminhos (/auth/v1/..., /rest/v1/...) em cima da URL base.
 * Se a base já trouxer barra final ou um caminho colado, o endereço final sai
 * inválido e o gateway responde "Invalid path specified in request URL" — uma
 * mensagem que não diz onde está o problema. Aqui a URL é normalizada e, se
 * ainda assim estiver errada, o motivo é dito em português na tela de acesso.
 */
function normalizar(bruta) {
  const s = String(bruta || '').trim().replace(/^["']|["']$/g, '')
  if (!s) return { erro: 'A variável VITE_SUPABASE_URL não foi definida.' }

  let u
  try { u = new URL(s) } catch {
    return { erro: `VITE_SUPABASE_URL não parece um endereço válido: "${s}". Deve começar com https://` }
  }
  if (!/^https?:$/.test(u.protocol))
    return { erro: 'VITE_SUPABASE_URL precisa começar com https://' }

  const caminho = u.pathname.replace(/\/+$/, '')
  const limpa = u.origin

  if (caminho) {
    return {
      url: limpa,
      aviso: `A URL do Supabase veio com "${caminho}" no final. Usei só ${limpa}. ` +
             `Copie o valor de Project Settings → Data API → Project URL, sem nada depois do domínio.`,
    }
  }
  return { url: limpa }
}

function conferirChave(bruta) {
  const s = String(bruta || '').trim().replace(/^["']|["']$/g, '')
  if (!s) return { erro: 'A variável VITE_SUPABASE_ANON_KEY não foi definida.' }
  if (s.startsWith('sb_secret') || s.includes('service_role'))
    return { erro: 'Essa é a chave de serviço. Ela ignora todas as políticas de segurança e não pode ir para o navegador. Use a chave anon (ou publishable).' }
  return { chave: s }
}

const u = normalizar(import.meta.env.VITE_SUPABASE_URL)
const k = conferirChave(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const problema = u.erro || k.erro || null
export const aviso = u.aviso || null
export const configurado = !problema

export const sb = configurado
  ? createClient(u.url, k.chave, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

if (aviso) console.warn('[gmINVEST] ' + aviso)

/**
 * O Supabase descarta o corpo da resposta quando uma função de servidor
 * responde com erro — o erro que chega no navegador é sempre o genérico
 * "Edge Function returned a non-2xx status code", sem dizer o motivo real.
 * A mensagem de verdade está guardada em error.context, um Response que
 * precisa ser lido à parte.
 */
export async function mensagemDeErroDaFuncao(error, rotuloFuncao) {
  if (!error) return null
  try {
    if (error.context?.json) {
      const corpo = await error.context.clone().json()
      if (corpo?.erro) return corpo.erro
    }
  } catch { /* corpo não era JSON — segue para o texto genérico abaixo */ }
  const msg = String(error.message || '')
  if (msg.includes('Failed to send') || msg.includes('Failed to fetch'))
    return `A função${rotuloFuncao ? ` "${rotuloFuncao}"` : ''} não respondeu. ` +
      `Ela já foi publicada com "npx supabase functions deploy${rotuloFuncao ? ' ' + rotuloFuncao : ''}"?`
  return msg || 'A função falhou, sem detalhes.'
}
