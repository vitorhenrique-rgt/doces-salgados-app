// js/services/customerService.js
//
// Esta é a ÚNICA camada que pode falar diretamente com o Supabase para
// tudo relacionado a clientes. Nenhuma página deve chamar supabase.from('customers')
// diretamente — sempre passar por uma das funções abaixo.
//
// Por quê? Quando o projeto migrar para Node/React no futuro, só o CONTEÚDO
// destas funções vai mudar (vão virar fetch('/api/customers') em vez de
// chamar o Supabase direto) — as páginas que usam este service não vão
// precisar mudar quase nada.

import { supabase } from '../supabaseClient.js';

// Busca todos os clientes, ordenados por nome (A-Z)
export async function listCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });

  return { data, error };
}

// Busca um único cliente pelo id (útil para telas de edição)
export async function getCustomerById(id) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

// Cria um novo cliente
// customer = { name, phone, address }
export async function createCustomer(customer) {
  const { data, error } = await supabase
    .from('customers')
    .insert([customer])
    .select();

  return { data, error };
}

// Atualiza um cliente existente
// updatedFields = objeto só com os campos que mudaram, ex: { phone: '11999999999' }
export async function updateCustomer(id, updatedFields) {
  const { data, error } = await supabase
    .from('customers')
    .update(updatedFields)
    .eq('id', id)
    .select();

  return { data, error };
}

// Remove um cliente
// Atenção: se o cliente tiver vendas associadas, isso pode dar erro por causa
// da referência (foreign key) da tabela "sales". Vamos tratar esse caso quando
// chegarmos na tela de vendas — por enquanto, deletar um cliente sem vendas
// funciona normalmente.
export async function deleteCustomer(id) {
  const { data, error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id);

  return { data, error };
}
