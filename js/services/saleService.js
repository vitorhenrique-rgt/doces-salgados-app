// js/services/saleService.js
//
// Esta é a ÚNICA camada que pode falar diretamente com o Supabase para
// tudo relacionado a vendas (sales, sale_items, credit_payments).
//
// Este service chama o productService para abater o estoque — ele NÃO mexe
// em stock_quantity diretamente, pois quem é "dono" dessa coluna é o
// productService (ver skill doces-salgados-camada-servico).

import { supabase } from '../supabaseClient.js';
import { decreaseStock } from './productService.js';

// Busca todas as vendas, já trazendo o nome do cliente junto (join automático,
// possível porque sales.customer_id já referencia customers.id no banco)
export async function listSales() {
  const { data, error } = await supabase
    .from('sales')
    .select('*, customers(name)')
    .order('sale_date', { ascending: false });

  return { data, error };
}

// Busca uma venda específica, com os itens vendidos (+ nome do produto de
// cada item) e o histórico de pagamentos de fiado já feitos
export async function getSaleById(id) {
  const { data, error } = await supabase
    .from('sales')
    .select('*, customers(name), sale_items(*, products(name)), credit_payments(*)')
    .eq('id', id)
    .single();

  return { data, error };
}

// Cria uma nova venda com múltiplos itens.
// saleData = {
//   customerId, saleDate, paymentMethod, paymentStatus,
//   items: [{ productId, quantity, unitPrice }, ...]
// }
export async function createSale(saleData) {
  // 1. Calculamos o subtotal de cada item (quantidade x preço unitário) e
  // somamos tudo para chegar no total da venda — essa conta é simples o
  // bastante para viver aqui no service, não precisa de um arquivo separado.
  const itemsWithSubtotal = saleData.items.map((item) => ({
    ...item,
    subtotal: item.quantity * item.unitPrice,
  }));

  const totalAmount = itemsWithSubtotal.reduce(
    (soma, item) => soma + item.subtotal,
    0
  );

  // 2. Cria a venda em si (linha na tabela "sales")
  const { data: saleRows, error: saleError } = await supabase
    .from('sales')
    .insert([
      {
        customer_id: saleData.customerId,
        sale_date: saleData.saleDate,
        total_amount: totalAmount,
        payment_method: saleData.paymentMethod,
        payment_status: saleData.paymentStatus,
      },
    ])
    .select();

  if (saleError) return { data: null, error: saleError };

  const sale = saleRows[0];

  // 3. Cria os itens da venda (linhas na tabela "sale_items"), todos
  // vinculados à venda que acabamos de criar através do sale_id
  const saleItemsToInsert = itemsWithSubtotal.map((item) => ({
    sale_id: sale.id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: item.subtotal,
  }));

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(saleItemsToInsert);

  if (itemsError) return { data: null, error: itemsError };

  // 4. Abate o estoque de cada produto vendido, chamando o productService
  // (que é o dono da lógica de estoque) — nunca mexemos em stock_quantity
  // diretamente por aqui.
  for (const item of itemsWithSubtotal) {
    const { error: stockError } = await decreaseStock(item.productId, item.quantity);

    if (stockError) {
      // A venda já foi registrada quando chegamos aqui — não faz sentido
      // "desfazer" tudo por um erro no abate de estoque. Por enquanto,
      // deixamos o erro registrado no console para investigação manual.
      console.error('Erro ao abater estoque do produto', item.productId, stockError);
    }
  }

  return { data: sale, error: null };
}

// Calcula o saldo devedor de uma venda (total da venda menos a soma de
// todos os pagamentos de fiado já feitos para ela).
// Recebe uma venda já buscada com getSaleById (que traz credit_payments junto).
export function calculateSaleBalance(sale) {
  const totalPago = (sale.credit_payments ?? []).reduce(
    (soma, pagamento) => soma + pagamento.amount_paid,
    0
  );

  return sale.total_amount - totalPago;
}

// Registra um novo pagamento (parcial ou total) de uma venda fiado, e
// atualiza automaticamente o status da venda se o saldo chegar a zero.
export async function addCreditPayment(saleId, amountPaid, notes) {
  const { data: paymentData, error: paymentError } = await supabase
    .from('credit_payments')
    .insert([{ sale_id: saleId, amount_paid: amountPaid, notes }])
    .select();

  if (paymentError) return { data: null, error: paymentError };

  // Depois de registrar o pagamento, buscamos a venda atualizada (com todos
  // os pagamentos, incluindo o que acabamos de criar) para recalcular o saldo
  const { data: sale, error: saleError } = await getSaleById(saleId);
  if (saleError) return { data: paymentData, error: saleError };

  const saldoDevedor = calculateSaleBalance(sale);

  // Se o saldo chegou a zero (ou menos, por algum arredondamento), a venda
  // está quitada. Senão, ela passa a ser "parcial" (já recebeu algo, mas não tudo).
  const novoStatus = saldoDevedor <= 0 ? 'paid' : 'partial';

  const { error: updateError } = await supabase
    .from('sales')
    .update({ payment_status: novoStatus })
    .eq('id', saleId);

  if (updateError) return { data: paymentData, error: updateError };

  return { data: paymentData, error: null };
}

// Remove uma venda. Como sale_items e credit_payments têm "on delete cascade"
// vinculados a sale_id, apagar a venda já remove os itens e pagamentos dela
// automaticamente — não precisamos apagar essas linhas manualmente antes.
export async function deleteSale(id) {
  const { data, error } = await supabase
    .from('sales')
    .delete()
    .eq('id', id);

  return { data, error };
}

// Busca todas as vendas que ainda têm pendência de fiado (status "credit" ou
// "partial"), já com o nome do cliente e os pagamentos feitos até agora —
// é essa consulta que vai alimentar a tela de controle de fiado ("quem me deve").
export async function listOpenCreditSales() {
  const { data, error } = await supabase
    .from('sales')
    .select('*, customers(name), credit_payments(*)')
    .in('payment_status', ['credit', 'partial'])
    .order('sale_date', { ascending: true });

  return { data, error };
}
