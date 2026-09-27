// js/utils/inputMasks.js
//
// Funções puras de formatação/validação de texto digitado — não sabem nada
// sobre o DOM nem sobre o Supabase, só recebem uma string e devolvem outra
// já tratada. Por estarem em /utils, podem ser reaproveitadas por qualquer
// página do projeto.

// Aplica a máscara de telefone brasileiro progressivamente, conforme a
// pessoa digita: (11) 8888-7777 (fixo, 8 dígitos) ou (11) 98888-7777
// (celular, 9 dígitos) — a diferença de agrupamento é decidida pela
// quantidade de dígitos já digitados.
export function formatPhoneNumber(rawValue) {
  const digits = rawValue.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 2) {
    return digits.replace(/^(\d{0,2})/, '($1');
  }
  if (digits.length <= 6) {
    return digits.replace(/^(\d{2})(\d{0,4})/, '($1) $2');
  }
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  }
  return digits.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

// Remove tudo que não for dígito — usado para tirar a máscara do telefone
// antes de salvar no banco (guardamos só os números, formatamos só na tela)
export function onlyDigits(value) {
  return value.replace(/\D/g, '');
}

// Filtra em tempo real, permitindo só letras (incluindo acentos do
// português: á, é, ã, ç, etc.), espaços, hífen e apóstrofo — para o campo
// de nome de cliente
export function onlyLetters(value) {
  return value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, '');
}

// Conectores que ficam em minúsculo na capitalização de nomes (exceto se
// forem a primeira palavra) — "Maria da Silva", não "Maria Da Silva"
const LOWERCASE_CONNECTORS = ['de', 'da', 'do', 'das', 'dos', 'e'];

export function capitalizeName(value) {
  return value
    .toLowerCase()
    .split(' ')
    .filter((word) => word.length > 0) // remove espaços duplos digitados sem querer
    .map((word, index) => {
      if (index > 0 && LOWERCASE_CONNECTORS.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// Garante que o valor digitado seja um número inteiro (sem casas decimais)
// — usado no campo de estoque, que não faz sentido ser fracionário.
// Em vez de só remover o "." (o que transformaria "12.5" em "125", errado),
// cortamos tudo a partir do separador decimal.
export function enforceIntegerString(value) {
  const integerPart = value.split(/[.,]/)[0];
  return integerPart.replace(/\D/g, '');
}
