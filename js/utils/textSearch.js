// js/utils/textSearch.js
//
// Função pura de apoio para filtros de busca — não sabe nada sobre o DOM
// nem sobre o Supabase, só recebe um texto e devolve outro "normalizado".
// Por estar em /utils, será reaproveitada nos filtros de Produtos, Vendas
// e A Receber.

// Deixa o texto em minúsculo e sem acentos, para que a busca por "joao"
// encontre "João" e "acucar" encontre "Açúcar".
//
// Como funciona: normalize('NFD') "desmonta" cada letra acentuada em duas
// partes (a letra + o acento solto, ex: "ã" vira "a" + "~"). Depois o
// replace remove só os acentos soltos (o intervalo \u0300-\u036f é onde o
// Unicode guarda esses sinais).
export function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}