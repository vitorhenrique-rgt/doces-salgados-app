// js/services/saleService.js
//
// Esta é a ÚNICA camada que pode falar diretamente com o Supabase para
// tudo relacionado a vendas (sales, sale_items, credit_payments).
//
// Este service chama o productService para abater o estoque — ele NÃO mexe
// em stock_quantity diretamente, pois quem é "dono" dessa coluna é o
// productService (ver skill doces-salgados-camada-servico).

import { supabase } from "../supabaseClient.js"
import { decreaseStock, increaseStock } from "./productService.js"

// Busca todas as vendas, já trazendo o nome do cliente junto (join automático,
// possível porque sales.customer_id já referencia customers.id no banco)
// "credit_payments(id)" aqui não é pra mostrar pagamento nenhum na lista —
// é só pra saber SE existe algum pagamento (sale.credit_payments.length > 0),
// o que decide se a venda pode ser editada ou excluída (ver updateSale e
// deleteSale, mais abaixo).
export async function listSales() {
  const { data, error } = await supabase
    .from("sales")
    .select("*, customers(name), credit_payments(id)")
    .order("sale_date", { ascending: false })

  return { data, error }
}

// Busca uma venda específica, com os itens vendidos (+ nome do produto de
// cada item) e o histórico de pagamentos de fiado já feitos
export async function getSaleById(id) {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "*, customers(name), sale_items(*, products(name)), credit_payments(*)",
    )
    .eq("id", id)
    .single()

  return { data, error }
}

// Função auxiliar interna (não exportada): calcula o subtotal de cada
// item e o total já com o desconto aplicado — usada tanto por createSale
// quanto por updateSale, pra não duplicar essa conta em dois lugares.
function calculateSaleTotals(items, discountAmount) {
  const itemsWithSubtotal = items.map((item) => ({
    ...item,
    subtotal: item.quantity * item.unitPrice,
  }))

  const subtotal = itemsWithSubtotal.reduce(
    (soma, item) => soma + item.subtotal,
    0,
  )

  // Math.max com 0 evita um total negativo se o desconto digitado for
  // maior que o subtotal dos itens.
  const totalAmount = Math.max(subtotal - (discountAmount ?? 0), 0)

  return { itemsWithSubtotal, totalAmount }
}

// Cria uma nova venda com múltiplos itens.
// saleData = {
//   customerId, saleDate, paymentMethod, paymentStatus, discountAmount,
//   items: [{ productId, quantity, unitPrice }, ...]
// }
// discountAmount é opcional (desconto em R$, não percentual) — edição
// livre do usuário, pode até zerar o total (ex: dar o produto de brinde).
export async function createSale(saleData) {
  // O total_amount salvo é o valor FINAL da venda, já com o desconto
  // abatido — é esse valor que o resto do sistema usa (saldo devedor,
  // A Receber, etc.).
  const discountAmount = saleData.discountAmount ?? 0
  const { itemsWithSubtotal, totalAmount } = calculateSaleTotals(
    saleData.items,
    discountAmount,
  )

  // 1. Cria a venda em si (linha na tabela "sales")
  const { data: saleRows, error: saleError } = await supabase
    .from("sales")
    .insert([
      {
        customer_id: saleData.customerId,
        sale_date: saleData.saleDate,
        total_amount: totalAmount,
        discount_amount: discountAmount,
        payment_method: saleData.paymentMethod,
        payment_status: saleData.paymentStatus,
      },
    ])
    .select()

  if (saleError) return { data: null, error: saleError }

  const sale = saleRows[0]

  // 2. Cria os itens da venda (linhas na tabela "sale_items"), todos
  // vinculados à venda que acabamos de criar através do sale_id
  const saleItemsToInsert = itemsWithSubtotal.map((item) => ({
    sale_id: sale.id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: item.subtotal,
  }))

  const { error: itemsError } = await supabase
    .from("sale_items")
    .insert(saleItemsToInsert)

  if (itemsError) return { data: null, error: itemsError }

  // 3. Abate o estoque de cada produto vendido, chamando o productService
  // (que é o dono da lógica de estoque) — nunca mexemos em stock_quantity
  // diretamente por aqui.
  for (const item of itemsWithSubtotal) {
    const { error: stockError } = await decreaseStock(
      item.productId,
      item.quantity,
    )

    if (stockError) {
      // A venda já foi registrada quando chegamos aqui — não faz sentido
      // "desfazer" tudo por um erro no abate de estoque. Por enquanto,
      // deixamos o erro registrado no console para investigação manual.
      console.error(
        "Erro ao abater estoque do produto",
        item.productId,
        stockError,
      )
    }
  }

  return { data: sale, error: null }
}

// Calcula o saldo devedor de uma venda (total da venda menos a soma de
// todos os pagamentos de fiado já feitos para ela).
// Recebe uma venda já buscada com getSaleById (que traz credit_payments junto).
export function calculateSaleBalance(sale) {
  const totalPago = (sale.credit_payments ?? []).reduce(
    (soma, pagamento) => soma + pagamento.amount_paid,
    0,
  )

  return sale.total_amount - totalPago
}

// Registra um novo pagamento (parcial ou total) de uma venda fiado, e
// atualiza automaticamente o status da venda se o saldo chegar a zero.
export async function addCreditPayment(
  saleId,
  amountPaid,
  paymentMethod,
  notes,
) {
  const { data: paymentData, error: paymentError } = await supabase
    .from("credit_payments")
    .insert([
      {
        sale_id: saleId,
        amount_paid: amountPaid,
        payment_method: paymentMethod,
        notes,
      },
    ])
    .select()

  if (paymentError) return { data: null, error: paymentError }

  // Depois de registrar o pagamento, buscamos a venda atualizada (com todos
  // os pagamentos, incluindo o que acabamos de criar) para recalcular o saldo
  const { data: sale, error: saleError } = await getSaleById(saleId)
  if (saleError) return { data: paymentData, error: saleError }

  const saldoDevedor = calculateSaleBalance(sale)

  // Se o saldo chegou a zero (ou menos, por algum arredondamento), a venda
  // está quitada. Senão, ela passa a ser "parcial" (já recebeu algo, mas não tudo).
  const novoStatus = saldoDevedor <= 0 ? "paid" : "partial"

  const { error: updateError } = await supabase
    .from("sales")
    .update({ payment_status: novoStatus })
    .eq("id", saleId)

  if (updateError) return { data: paymentData, error: updateError }

  return { data: paymentData, error: null }
}

// Remove uma venda, devolvendo ao estoque a quantidade de cada item
// vendido (sem isso, o estoque ficaria "faltando" para sempre). Como
// sale_items e credit_payments têm "on delete cascade" vinculados a
// sale_id, apagar a venda já remove os itens e pagamentos dela
// automaticamente — não precisamos apagar essas linhas manualmente antes.
//
// Por decisão do usuário (2026-10-03): uma venda que já tem pagamento de
// fiado registrado NÃO pode ser excluída — excluir apagaria esse histórico
// de dinheiro já recebido. Nesses casos, devolvemos um erro explicando o
// motivo, no mesmo formato { message } que os erros do Supabase já usam.
export async function deleteSale(id) {
  const { data: sale, error: fetchError } = await getSaleById(id)
  if (fetchError) return { data: null, error: fetchError }

  if ((sale.credit_payments ?? []).length > 0) {
    return {
      data: null,
      error: {
        message:
          "Esta venda já tem pagamento de fiado registrado e não pode ser excluída.",
      },
    }
  }

  for (const item of sale.sale_items) {
    const { error: stockError } = await increaseStock(
      item.product_id,
      item.quantity,
    )
    if (stockError) {
      console.error(
        "Erro ao devolver estoque do produto",
        item.product_id,
        stockError,
      )
    }
  }

  const { data, error } = await supabase.from("sales").delete().eq("id", id)

  return { data, error }
}

// Atualiza uma venda existente (cliente, data, itens, desconto, forma de
// pagamento). Por decisão do usuário (2026-10-03), só é permitido editar
// vendas que AINDA NÃO têm nenhum pagamento de fiado registrado — evita
// ter que decidir o que fazer com dinheiro que o cliente já pagou numa
// venda que mudou de valor depois.
//
// saleData = {
//   customerId, saleDate, paymentMethod, paymentStatus, discountAmount,
//   items: [{ productId, quantity, unitPrice }, ...]
// }
export async function updateSale(id, saleData) {
  const { data: existingSale, error: fetchError } = await getSaleById(id)
  if (fetchError) return { data: null, error: fetchError }

  if ((existingSale.credit_payments ?? []).length > 0) {
    return {
      data: null,
      error: {
        message:
          "Esta venda já tem pagamento de fiado registrado e não pode ser editada.",
      },
    }
  }

  // Venda já paga (à vista, no momento da venda) também não pode ser
  // editada — o dinheiro já foi recebido pelos itens originais. Excluir
  // continua permitido nesse caso (ver deleteSale, mais abaixo), só a
  // edição é bloqueada aqui.
  if (existingSale.payment_status === "paid") {
    return {
      data: null,
      error: { message: "Vendas já pagas não podem ser editadas." },
    }
  }

  // 1. Devolve ao estoque os itens da versão ANTIGA da venda — antes de
  // aplicar os itens novos, "desfazemos" o abate original.
  for (const item of existingSale.sale_items) {
    const { error: stockError } = await increaseStock(
      item.product_id,
      item.quantity,
    )
    if (stockError) {
      console.error(
        "Erro ao devolver estoque do produto",
        item.product_id,
        stockError,
      )
    }
  }

  // 2. Remove os itens antigos — serão substituídos pelos novos
  const { error: deleteItemsError } = await supabase
    .from("sale_items")
    .delete()
    .eq("sale_id", id)
  if (deleteItemsError) return { data: null, error: deleteItemsError }

  // 3. Recalcula subtotal/total com os itens e o desconto novos (mesma
  // função usada pelo createSale, pra não duplicar essa regra)
  const discountAmount = saleData.discountAmount ?? 0
  const { itemsWithSubtotal, totalAmount } = calculateSaleTotals(
    saleData.items,
    discountAmount,
  )

  // 4. Atualiza os dados da venda em si
  const { error: updateError } = await supabase
    .from("sales")
    .update({
      customer_id: saleData.customerId,
      sale_date: saleData.saleDate,
      total_amount: totalAmount,
      discount_amount: discountAmount,
      payment_method: saleData.paymentMethod,
      payment_status: saleData.paymentStatus,
    })
    .eq("id", id)
  if (updateError) return { data: null, error: updateError }

  // 5. Insere os itens novos
  const saleItemsToInsert = itemsWithSubtotal.map((item) => ({
    sale_id: id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: item.subtotal,
  }))

  const { error: itemsError } = await supabase
    .from("sale_items")
    .insert(saleItemsToInsert)
  if (itemsError) return { data: null, error: itemsError }

  // 6. Abate o estoque conforme os itens NOVOS
  for (const item of itemsWithSubtotal) {
    const { error: stockError } = await decreaseStock(
      item.productId,
      item.quantity,
    )
    if (stockError) {
      console.error(
        "Erro ao abater estoque do produto",
        item.productId,
        stockError,
      )
    }
  }

  return { data: { id }, error: null }
}

// Busca todas as vendas que ainda têm pendência de fiado (status "credit" ou
// "partial"), já com o nome e telefone do cliente e os pagamentos feitos até
// agora — é essa consulta que vai alimentar a tela de controle de fiado
// ("quem me deve"). O telefone é necessário para a ação de enviar o resumo
// do débito por WhatsApp.
export async function listOpenCreditSales() {
  const { data, error } = await supabase
    .from("sales")
    .select("*, customers(name, phone), credit_payments(*)")
    .in("payment_status", ["credit", "partial"])
    .order("sale_date", { ascending: true })

  return { data, error }
}

// Busca as vendas em aberto de UM cliente específico, da mais antiga para a
// mais nova — é essa ordem que a alocação de pagamento (FIFO) usa abaixo.
export async function listOpenCreditSalesByCustomer(customerId) {
  const { data, error } = await supabase
    .from("sales")
    .select("*, credit_payments(*)")
    .eq("customer_id", customerId)
    .in("payment_status", ["credit", "partial"])
    .order("sale_date", { ascending: true })

  return { data, error }
}

// Registra um único pagamento de um cliente e distribui esse valor
// automaticamente entre as vendas em aberto dele, começando pela mais
// antiga (alocação "FIFO" — primeira a entrar, primeira a sair), até o
// valor se esgotar ou não sobrar mais nenhuma venda pendente.
//
// Ex: cliente deve R$30 (venda A) e R$20 (venda B, mais recente). Um
// pagamento de R$40 quita a venda A inteira (R$30) e deixa R$10 na venda B
// (que passa a "partial"). Cada "fatia" vira uma linha separada em
// credit_payments, reaproveitando addCreditPayment (que já cuida de
// atualizar o status de cada venda).
export async function payCustomerCredit(
  customerId,
  amount,
  paymentMethod,
  notes,
) {
  const { data: openSales, error: fetchError } =
    await listOpenCreditSalesByCustomer(customerId)
  if (fetchError) return { data: null, error: fetchError }

  let valorRestante = amount
  const pagamentosRealizados = []

  for (const sale of openSales) {
    if (valorRestante <= 0) break

    const saldoDevedor = calculateSaleBalance(sale)
    if (saldoDevedor <= 0) continue // segurança: não deveria acontecer, mas evita pagamento de R$0

    // Aloca o menor valor entre "quanto ainda sobrou do pagamento" e
    // "quanto essa venda específica ainda deve"
    const valorAlocado = Math.min(valorRestante, saldoDevedor)

    const { error: paymentError } = await addCreditPayment(
      sale.id,
      valorAlocado,
      paymentMethod,
      notes,
    )

    if (paymentError) {
      // Já alocamos parte do pagamento em vendas anteriores quando isso
      // acontece — não desfazemos o que já foi feito, só paramos aqui e
      // avisamos que o processo não terminou por completo.
      return { data: { pagamentosRealizados }, error: paymentError }
    }

    pagamentosRealizados.push({ saleId: sale.id, valorAlocado })
    valorRestante -= valorAlocado
  }

  // Se sobrou valor não alocado, é porque o pagamento foi maior do que a
  // dívida total do cliente — devolvemos essa informação para a tela poder
  // avisar o usuário, em vez de "perder" esse valor silenciosamente.
  return {
    data: { pagamentosRealizados, valorNaoAlocado: valorRestante },
    error: null,
  }
}
