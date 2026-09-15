// js/utils/formatCurrency.js
//
// Função pura de formatação — não sabe nada sobre Supabase nem sobre a
// tela, só recebe um número e devolve o texto formatado em reais. Por
// estar em /utils, pode ser reaproveitada por qualquer página do projeto.

export function formatCurrency(value) {
  return `R$ ${Number(value).toFixed(2)}`;
}
