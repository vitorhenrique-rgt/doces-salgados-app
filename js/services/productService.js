// js/services/productService.js
//
// Esta é a ÚNICA camada que pode falar diretamente com o Supabase para
// tudo relacionado a produtos. Nenhuma página deve chamar supabase.from('products')
// diretamente — sempre passar por uma das funções abaixo.
//
// Importante: este service é o "dono" do campo stock_quantity. Nenhum outro
// arquivo do projeto deve alterar o estoque de um produto diretamente — sempre
// através de increaseStock() ou decreaseStock() (esta última será usada pelo
// saleService, quando chegarmos na tela de vendas).

import { supabase } from '../supabaseClient.js';

// Busca todos os produtos, ordenados por nome (A-Z)
export async function listProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  return { data, error };
}

// Busca um único produto pelo id
export async function getProductById(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

// Cria um novo produto
// product = { name, sale_price, category, stock_quantity }
// stock_quantity aqui representa o ESTOQUE INICIAL, definido só no momento
// da criação — depois disso, o estoque só muda via increaseStock/decreaseStock.
export async function createProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .select();

  return { data, error };
}

// Atualiza os dados gerais de um produto (nome, preço, categoria).
// Atenção: updatedFields NUNCA deve conter stock_quantity — a página de
// produtos não deve permitir isso, para evitar que o usuário apague o
// estoque sem querer ao editar outro campo. Reposição de estoque é uma
// ação separada (ver increaseStock, abaixo).
export async function updateProduct(id, updatedFields) {
  const { data, error } = await supabase
    .from('products')
    .update(updatedFields)
    .eq('id', id)
    .select();

  return { data, error };
}

// Remove um produto
export async function deleteProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  return { data, error };
}

// Repõe estoque: soma "amount" ao estoque atual do produto.
// Usado quando o usuário produz um novo lote (ação "Repor estoque" na tela).
export async function increaseStock(productId, amount) {
  const { data: product, error: fetchError } = await getProductById(productId);
  if (fetchError) return { data: null, error: fetchError };

  const newQuantity = product.stock_quantity + amount;

  const { data, error } = await supabase
    .from('products')
    .update({ stock_quantity: newQuantity })
    .eq('id', productId)
    .select();

  return { data, error };
}

// Abate estoque: subtrai "amount" do estoque atual do produto.
// Será chamado pelo saleService ao confirmar uma venda (item por item) —
// ainda não usamos esta função até chegarmos na tela de vendas.
export async function decreaseStock(productId, amount) {
  const { data: product, error: fetchError } = await getProductById(productId);
  if (fetchError) return { data: null, error: fetchError };

  const newQuantity = product.stock_quantity - amount;

  const { data, error } = await supabase
    .from('products')
    .update({ stock_quantity: newQuantity })
    .eq('id', productId)
    .select();

  return { data, error };
}
