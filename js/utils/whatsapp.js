// js/utils/whatsapp.js
//
// Função pura de apoio para montar links do WhatsApp (wa.me) — não sabe
// nada sobre o DOM nem sobre o Supabase, só recebe um telefone e um texto
// e devolve a URL pronta para abrir. Por estar em /utils, pode ser
// reaproveitada em outras telas que também precisem enviar mensagens pelo
// WhatsApp (ex: cobrança via Pix, mais adiante).

// Monta a URL do wa.me a partir de um telefone brasileiro (só dígitos,
// sem DDI) e um texto. O wa.me exige o telefone com o código do país (55)
// na frente, sem espaços, parênteses, hífen ou o sinal de "+".
export function buildWhatsAppUrl(phoneDigits, message) {
  const digits = (phoneDigits ?? "").replace(/\D/g, "")

  // Se o telefone já vier com o 55 na frente (ex: copiado de outro
  // lugar), não duplicamos o código do país.
  const phoneWithCountryCode = digits.startsWith("55") ? digits : `55${digits}`

  return `https://wa.me/${phoneWithCountryCode}?text=${encodeURIComponent(message)}`
}
