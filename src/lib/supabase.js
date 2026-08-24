import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && chave)

export const sb = configurado
  ? createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true } })
  : null
