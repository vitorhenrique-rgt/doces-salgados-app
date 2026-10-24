// js/utils/pixCode.js
//
// Função pura que monta o "Pix Copia e Cola" (formato BR Code, padrão
// público do Banco Central) — um texto que qualquer app de banco lê e já
// preenche a chave, o nome do recebedor, a cidade e o valor. Não sabe nada
// sobre Supabase nem sobre a tela, só recebe os dados e devolve o texto
// pronto — mesma filosofia do pricingCalculator.js (quando chegarmos lá).
//
// IMPORTANTE: isso é um Pix ESTÁTICO. O valor é só uma sugestão que o app
// de quem paga já preenche, mas pode ser alterado antes de confirmar — não
// existe confirmação automática de pagamento nem integração com banco.
// Quem recebe continua conferindo e registrando o pagamento manualmente,
// exatamente como já faz hoje.

// Monta um campo no formato EMV/TLV (Tag-Length-Value) exigido pelo
// padrão: 2 dígitos de identificador + 2 dígitos com o tamanho do valor +
// o valor em si. É esse encadeamento de campos que forma o código inteiro.
function buildField(tag, value) {
  const length = String(value.length).padStart(2, "0")
  return `${tag}${length}${value}`
}

// Remove acentos e deixa em maiúsculas — o padrão exige texto só com
// caracteres simples (sem ç, ã, etc.) nos campos de nome e cidade do
// recebedor, e a maioria dos apps de banco espera maiúsculas aqui.
function sanitizeText(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
}

// Calcula o checksum CRC16 (algoritmo CCITT-FALSE) exigido no final do
// código — é assim que o app de quem vai pagar confere se o código não
// foi digitado ou copiado errado. É um algoritmo público e padronizado,
// usado em várias áreas de telecomunicação, não é específico do Pix.
function calculateCRC16(payload) {
  const polynomial = 0x1021
  let crc = 0xffff

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8

    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ polynomial : crc << 1
      crc &= 0xffff
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0")
}

// Monta o código Pix copia-e-cola completo.
// settings = { pix_key, receiver_name, receiver_city }
// amount = valor da cobrança (número, ex: 45.5)
export function buildPixCode(settings, amount) {
  // O padrão limita o nome a 25 caracteres e a cidade a 15 — cortamos
  // aqui como segurança extra, além do limite já aplicado no formulário
  // de configurações.
  const merchantName = sanitizeText(settings.receiver_name).slice(0, 25)
  const merchantCity = sanitizeText(settings.receiver_city).slice(0, 15)

  // Campo 26: "informações da conta do recebedor" — por dentro, é outro
  // conjunto de campos (chave Pix identificada pelo domínio do Bacen).
  const merchantAccountInfo =
    buildField("00", "br.gov.bcb.pix") + buildField("01", settings.pix_key)

  // Campo 62: identificador da transação ("txid"). "***" significa "sem
  // referência específica" — válido no padrão para um Pix estático como
  // este, que não está vinculado a uma cobrança registrada no banco.
  const additionalData = buildField("05", "***")

  const payloadSemCRC =
    buildField("00", "01") + // Payload Format Indicator (fixo)
    buildField("26", merchantAccountInfo) + // Chave Pix
    buildField("52", "0000") + // Categoria do comerciante (genérica)
    buildField("53", "986") + // Moeda: Real brasileiro (código ISO)
    buildField("54", amount.toFixed(2)) + // Valor sugerido da cobrança
    buildField("58", "BR") + // País
    buildField("59", merchantName) + // Nome do recebedor
    buildField("60", merchantCity) + // Cidade do recebedor
    buildField("62", additionalData) + // Identificador da transação
    "6304" // Abre o campo do checksum, calculado sobre tudo isto

  const checksum = calculateCRC16(payloadSemCRC)

  return payloadSemCRC + checksum
}
