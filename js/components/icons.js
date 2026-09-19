// js/components/icons.js
//
// Pequenos ícones em SVG puro — sem depender de nenhuma biblioteca externa
// (fonte de ícones, pacote npm, etc.), só strings de HTML/SVG mesmo.
// Usam "currentColor" no traço, o que significa que herdam automaticamente
// a cor de texto do botão onde forem colocados — não precisam de cor própria.
//
// Usados nos botões de ação das tabelas (Editar, Excluir, Repor estoque,
// Ver detalhes, Remover) para economizar espaço em telas pequenas, onde o
// texto sozinho quebrava linha e bagunçava a tabela.

export const iconEdit = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 20h9" />
  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
</svg>`.trim();

export const iconTrash = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 6h18" />
  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  <path d="M10 11v6" />
  <path d="M14 11v6" />
</svg>`.trim();

export const iconPlus = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 5v14" />
  <path d="M5 12h14" />
</svg>`.trim();

export const iconEye = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
  <circle cx="12" cy="12" r="3" />
</svg>`.trim();

export const iconX = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M18 6L6 18" />
  <path d="M6 6l12 12" />
</svg>`.trim();

// Monta o HTML de um botão de ação padrão: ícone + texto. O texto
// (.actionLabel) some visualmente em telas pequenas (ver CSS), mas
// continua existindo no HTML — leitores de tela continuam anunciando o
// texto normalmente, então o botão nunca fica "sem nome" para quem usa
// leitor de tela, mesmo parecendo só um ícone na tela.
export function actionButtonContent(icon, label) {
  return `<span class="actionIcon">${icon}</span><span class="actionLabel">${label}</span>`;
}
