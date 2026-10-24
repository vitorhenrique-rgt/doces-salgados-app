// js/services/settingsService.js
//
// Esta é a ÚNICA camada que pode falar diretamente com o Supabase para
// as configurações do negócio (chave Pix, nome do recebedor, cidade).
//
// Diferente dos outros services, esta tabela tem SEMPRE no máximo UMA
// linha — não existe "lista" nem "criar vários". Por isso o formato é
// um pouco diferente do padrão de list/get/create/update/delete: só tem
// getBusinessSettings() (busca a linha, se existir) e
// saveBusinessSettings() (cria se ainda não existe, atualiza se já existe).

import { supabase } from "../supabaseClient.js"

// Busca as configurações do negócio. Se o usuário ainda não configurou
// nada, "data" vem null (não é um erro — é um estado válido, "ainda não
// configurado").
export async function getBusinessSettings() {
  const { data, error } = await supabase
    .from("business_settings")
    .select("*")
    .limit(1)
    .maybeSingle()

  return { data, error }
}

// Salva as configurações do negócio. settings = { pix_key, receiver_name, receiver_city }
// Decide sozinho se deve CRIAR a linha (primeira vez que o usuário
// configura) ou ATUALIZAR a que já existe — quem chama essa função não
// precisa saber qual dos dois casos é.
export async function saveBusinessSettings(settings) {
  const { data: existing, error: fetchError } = await getBusinessSettings()
  if (fetchError) return { data: null, error: fetchError }

  if (existing) {
    const { data, error } = await supabase
      .from("business_settings")
      .update(settings)
      .eq("id", existing.id)
      .select()

    return { data, error }
  }

  const { data, error } = await supabase
    .from("business_settings")
    .insert([settings])
    .select()

  return { data, error }
}
