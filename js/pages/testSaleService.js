// js/pages/testSaleService.js
//
// Arquivo TEMPORÁRIO — testa o fluxo completo de uma venda fiado:
// criar cliente e produto de apoio, registrar a venda, conferir que o
// estoque foi abatido, registrar pagamentos parciais e conferir que o
// status da venda muda de "credit" -> "partial" -> "paid" corretamente.

import { createCustomer, deleteCustomer } from '../services/customerService.js';
import { createProduct, getProductById, deleteProduct } from '../services/productService.js';
import {
  createSale,
  getSaleById,
  deleteSale,
  addCreditPayment,
  calculateSaleBalance,
  listSales,
  listOpenCreditSales,
} from '../services/saleService.js';

const outputEl = document.getElementById('output');

function log(mensagem, dado) {
  console.log(mensagem, dado);
  outputEl.textContent += `\n${mensagem}\n${JSON.stringify(dado, null, 2)}\n`;
}

async function runTests() {
  // ---- Preparação: criar um cliente e um produto de apoio para o teste ----

  const clienteTeste = await createCustomer({
    name: 'Cliente Fiado Teste',
    phone: '11977777777',
    address: '',
  });
  log('Preparação: cliente criado', clienteTeste);

  if (clienteTeste.error) {
    log('Parando: erro ao criar cliente de apoio.', clienteTeste.error);
    return;
  }

  const produtoTeste = await createProduct({
    name: 'Salgado Teste',
    sale_price: 5,
    category: 'Salgado',
    stock_quantity: 20,
  });
  log('Preparação: produto criado (estoque inicial 20)', produtoTeste);

  if (produtoTeste.error) {
    log('Parando: erro ao criar produto de apoio.', produtoTeste.error);
    return;
  }

  const customerId = clienteTeste.data[0].id;
  const productId = produtoTeste.data[0].id;

  // ---- 1. Criar uma venda fiado de 5 unidades (5 x R$5,00 = R$25,00) ----

  const vendaCriada = await createSale({
    customerId,
    saleDate: new Date().toISOString().slice(0, 10), // formato 'YYYY-MM-DD'
    paymentMethod: 'credit',
    paymentStatus: 'credit',
    items: [{ productId, quantity: 5, unitPrice: 5 }],
  });
  log('1. Venda criada (esperado total_amount 25, payment_status credit)', vendaCriada);

  if (vendaCriada.error) {
    log('Parando: erro ao criar a venda.', vendaCriada.error);
    return;
  }

  const saleId = vendaCriada.data.id;

  // ---- 2. Conferir que o estoque do produto foi abatido (20 -> 15) ----

  const produtoAposVenda = await getProductById(productId);
  log('2. Produto após a venda (esperado stock_quantity 15)', produtoAposVenda);

  // ---- 3. Buscar a venda completa (com itens e pagamentos) ----

  const vendaCompleta = await getSaleById(saleId);
  log('3. Venda completa, com itens e pagamentos (deve ter 1 item, 0 pagamentos)', vendaCompleta);

  const saldoInicial = calculateSaleBalance(vendaCompleta.data);
  log('3.1 Saldo devedor inicial (esperado 25)', { saldoInicial });

  // ---- 4. Registrar um pagamento parcial de R$10,00 ----

  const pagamentoParcial = await addCreditPayment(saleId, 10, 'Pagamento parcial de teste');
  log('4. Pagamento parcial registrado (R$10,00)', pagamentoParcial);

  const vendaAposParcial = await getSaleById(saleId);
  log(
    '4.1 Venda após pagamento parcial (esperado payment_status "partial")',
    vendaAposParcial
  );
  log('4.2 Saldo devedor após parcial (esperado 15)', {
    saldo: calculateSaleBalance(vendaAposParcial.data),
  });

  // ---- 5. Registrar o pagamento final de R$15,00 (quita a dívida) ----

  const pagamentoFinal = await addCreditPayment(saleId, 15, 'Quitação de teste');
  log('5. Pagamento final registrado (R$15,00)', pagamentoFinal);

  const vendaQuitada = await getSaleById(saleId);
  log('5.1 Venda quitada (esperado payment_status "paid")', vendaQuitada);
  log('5.2 Saldo devedor final (esperado 0)', {
    saldo: calculateSaleBalance(vendaQuitada.data),
  });

  // ---- 6. Conferir listSales e listOpenCreditSales ----

  const todasVendas = await listSales();
  log('6. listSales (deve conter a venda de teste, já quitada)', todasVendas);

  const vendasEmAberto = await listOpenCreditSales();
  log(
    '6.1 listOpenCreditSales (NÃO deve conter a venda de teste, pois já foi quitada)',
    vendasEmAberto
  );

  // ---- Limpeza: apagar venda, produto e cliente de teste, nessa ordem ----
  // (sales.customer_id e sale_items.product_id NÃO têm "on delete cascade" —
  // só sale_id tem, em sale_items e credit_payments. Por isso, apagamos a
  // venda primeiro: isso já remove os itens e pagamentos dela via cascade,
  // e só depois conseguimos apagar o produto e o cliente sem erro de
  // referência (foreign key).)

  await deleteSale(saleId);
  await deleteProduct(productId);
  await deleteCustomer(customerId);
  log('Limpeza concluída (venda, produto e cliente de teste removidos).', {});

  log('Testes concluídos!', {});
}

runTests();
