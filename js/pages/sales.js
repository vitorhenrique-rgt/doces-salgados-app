// js/pages/sales.js
//
// Orquestra a tela de registrar venda: carrega clientes e produtos,
// controla a busca de produtos (autocomplete simples), monta a lista de
// itens da venda com quantidade ajustável, calcula o total, e no fim
// chama o saleService para registrar tudo.

import { listCustomers } from '../services/customerService.js';
import { listProducts } from '../services/productService.js';
import { createSale, addCreditPayment, listSales, getSaleById, calculateSaleBalance } from '../services/saleService.js';
import { showConfirmModal } from '../components/confirmModal.js';
import { iconEye, iconTrash, actionButtonContent } from '../components/icons.js';

// ---- Referências aos elementos do HTML ----
const formEl = document.getElementById('saleForm');
const customerSelect = document.getElementById('saleCustomer');
const saleDateInput = document.getElementById('saleDate');
const productSearchInput = document.getElementById('productSearchInput');
const productSearchResultsEl = document.getElementById('productSearchResults');
const itemsTableBodyEl = document.getElementById('saleItemsTableBody');
const noItemsMessageEl = document.getElementById('noItemsMessage');
const totalValueEl = document.getElementById('saleTotalValue');
const paymentMethodSelect = document.getElementById('paymentMethodSelect');
const amountReceivedFieldEl = document.getElementById('amountReceivedField');
const amountReceivedInput = document.getElementById('amountReceivedInput');
const formMessageEl = document.getElementById('formMessage');
const salesTableBodyEl = document.getElementById('salesTableBody');

// ---- Estado da tela em memória ----
// "allProducts" guarda a lista completa de produtos, carregada uma vez ao
// abrir a página — a busca filtra esse array em memória, sem precisar
// consultar o Supabase de novo a cada letra digitada.
let allProducts = [];

// "saleItems" guarda os itens que o usuário já adicionou à venda atual.
// Cada item: { productId, name, unitPrice, quantity, stockAvailable }
let saleItems = [];

// ---- Mensagens para o usuário ----

function showFormMessage(text, type) {
  formMessageEl.textContent = text;
  formMessageEl.className = type;
}

function formatCurrency(value) {
  return `R$ ${Number(value).toFixed(2)}`;
}

// ---- Carregar clientes no <select> ----

async function loadCustomersIntoSelect() {
  const { data: customers, error } = await listCustomers();

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar a lista de clientes.', 'error');
    return;
  }

  for (const customer of customers) {
    const option = document.createElement('option');
    option.value = customer.id;
    option.textContent = customer.name;
    customerSelect.appendChild(option);
  }
}

// ---- Carregar produtos em memória (para a busca) ----

async function loadProducts() {
  const { data: products, error } = await listProducts();

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar a lista de produtos.', 'error');
    return;
  }

  allProducts = products;
}

// ---- Busca de produtos (autocomplete simples) ----

productSearchInput.addEventListener('input', () => {
  const termoBuscado = productSearchInput.value.trim().toLowerCase();

  if (termoBuscado === '') {
    productSearchResultsEl.hidden = true;
    productSearchResultsEl.innerHTML = '';
    return;
  }

  const encontrados = allProducts.filter((product) =>
    product.name.toLowerCase().includes(termoBuscado)
  );

  renderSearchResults(encontrados);
});

function renderSearchResults(products) {
  productSearchResultsEl.innerHTML = '';

  if (products.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'noResultsItem';
    emptyItem.textContent = 'Nenhum produto encontrado.';
    productSearchResultsEl.appendChild(emptyItem);
    productSearchResultsEl.hidden = false;
    return;
  }

  // Mostra no máximo 8 resultados por vez — o suficiente para uma busca
  // rápida, sem virar uma lista gigante rolando na tela do celular.
  for (const product of products.slice(0, 8)) {
    const resultItem = document.createElement('li');
    resultItem.innerHTML = `
      <span class="resultProductName">${product.name}</span>
      <span class="resultProductPrice">${formatCurrency(product.sale_price)}</span>
    `;

    resultItem.addEventListener('click', () => {
      addProductToSale(product);
      productSearchInput.value = '';
      productSearchResultsEl.hidden = true;
      productSearchResultsEl.innerHTML = '';
      productSearchInput.focus();
    });

    productSearchResultsEl.appendChild(resultItem);
  }

  productSearchResultsEl.hidden = false;
}

// ---- Adicionar/remover/ajustar itens da venda ----

function addProductToSale(product) {
  // Se o produto já está na lista, só aumenta a quantidade em 1, em vez
  // de criar uma linha duplicada para o mesmo produto.
  const itemExistente = saleItems.find((item) => item.productId === product.id);

  if (itemExistente) {
    itemExistente.quantity += 1;
  } else {
    saleItems.push({
      productId: product.id,
      name: product.name,
      unitPrice: Number(product.sale_price),
      quantity: 1,
      stockAvailable: product.stock_quantity,
    });
  }

  renderSaleItems();
}

function changeItemQuantity(productId, delta) {
  const item = saleItems.find((item) => item.productId === productId);
  if (!item) return;

  const novaQuantidade = item.quantity + delta;

  if (novaQuantidade < 1) {
    // Diminuir abaixo de 1 remove o item da venda — não faz sentido um
    // item com quantidade zero na lista.
    saleItems = saleItems.filter((item) => item.productId !== productId);
  } else {
    item.quantity = novaQuantidade;
  }

  renderSaleItems();
}

function removeItem(productId) {
  saleItems = saleItems.filter((item) => item.productId !== productId);
  renderSaleItems();
}

function renderSaleItems() {
  itemsTableBodyEl.innerHTML = '';

  if (saleItems.length === 0) {
    noItemsMessageEl.hidden = false;
    updateTotal();
    return;
  }

  noItemsMessageEl.hidden = true;

  for (const item of saleItems) {
    const subtotal = item.quantity * item.unitPrice;
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${item.name}</td>
      <td>
        <div class="qtyStepper">
          <button type="button" data-action="decrease">−</button>
          <span class="qtyValue">${item.quantity}</span>
          <button type="button" data-action="increase">+</button>
        </div>
      </td>
      <td>${formatCurrency(subtotal)}</td>
      <td>
        <button type="button" class="removeItemButton">
          ${actionButtonContent(iconTrash, 'Remover')}
        </button>
      </td>
    `;

    row.querySelector('[data-action="decrease"]').addEventListener('click', () => {
      changeItemQuantity(item.productId, -1);
    });

    row.querySelector('[data-action="increase"]').addEventListener('click', () => {
      changeItemQuantity(item.productId, 1);
    });

    row.querySelector('.removeItemButton').addEventListener('click', () => {
      removeItem(item.productId);
    });

    itemsTableBodyEl.appendChild(row);
  }

  updateTotal();
}

function updateTotal() {
  const total = saleItems.reduce(
    (soma, item) => soma + item.quantity * item.unitPrice,
    0
  );
  totalValueEl.textContent = formatCurrency(total);
}

// ---- Lista de vendas já registradas ----

// Mapeia o status salvo no banco (em inglês) para o texto e a classe de
// badge que aparecem na tela (em português, seguindo a skill de estilo visual)
const paymentStatusLabels = {
  paid: { text: 'Pago', badgeClass: 'badge--paid' },
  partial: { text: 'Parcial', badgeClass: 'badge--partial' },
  credit: { text: 'A receber', badgeClass: 'badge--credit' },
};

function formatDate(isoDate) {
  // O banco guarda a data como 'YYYY-MM-DD' — convertemos para 'DD/MM/YYYY',
  // formato mais comum de se ler no Brasil.
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function loadSales() {
  const { data: sales, error } = await listSales();

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar a lista de vendas.', 'error');
    return;
  }

  renderSalesTable(sales);
}

function renderSalesTable(sales) {
  salesTableBodyEl.innerHTML = '';

  if (sales.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="5" class="emptyState">
        Nenhuma venda registrada ainda. Use o formulário acima para registrar a primeira.
      </td>
    `;
    salesTableBodyEl.appendChild(emptyRow);
    return;
  }

  for (const sale of sales) {
    const row = document.createElement('tr');
    const statusInfo = paymentStatusLabels[sale.payment_status];

    row.innerHTML = `
      <td>${formatDate(sale.sale_date)}</td>
      <td>${sale.customers?.name ?? '—'}</td>
      <td>${formatCurrency(sale.total_amount)}</td>
      <td><span class="badge ${statusInfo.badgeClass}">${statusInfo.text}</span></td>
      <td>
        <button type="button" class="viewSaleDetailsButton">
          ${actionButtonContent(iconEye, 'Ver detalhes')}
        </button>
      </td>
    `;

    row.querySelector('.viewSaleDetailsButton').addEventListener('click', () => {
      toggleSaleDetails(sale.id, row);
    });

    salesTableBodyEl.appendChild(row);
  }
}

// ---- Expandir/recolher os detalhes de uma venda (itens + pagamentos) ----

async function toggleSaleDetails(saleId, saleRow) {
  // Se já existe uma linha de detalhes logo depois desta, o clique é para
  // FECHAR — só remove e para por aqui.
  const proximaLinha = saleRow.nextElementSibling;
  if (proximaLinha && proximaLinha.classList.contains('saleDetailsRow')) {
    proximaLinha.remove();
    return;
  }

  // Fecha qualquer outra linha de detalhes que esteja aberta, para não
  // acumular vários detalhes abertos ao mesmo tempo na tela.
  closeAnyOpenSaleDetails();

  const { data: sale, error } = await getSaleById(saleId);

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar os detalhes desta venda.', 'error');
    return;
  }

  const detailsRow = document.createElement('tr');
  detailsRow.className = 'saleDetailsRow';

  const itemsHtml = sale.sale_items
    .map(
      (item) => `
        <li>
          <span>${item.products?.name ?? 'Produto removido'} (${item.quantity}x)</span>
          <span>${formatCurrency(item.subtotal)}</span>
        </li>
      `
    )
    .join('');

  // Para vendas fiado ou parciais, mostramos também o histórico de
  // pagamentos já feitos e o saldo que ainda falta receber.
  let pagamentosHtml = '';
  if (sale.payment_status === 'credit' || sale.payment_status === 'partial') {
    const listaPagamentos = sale.credit_payments.length
      ? sale.credit_payments
          .map(
            (pagamento) => `
              <li>
                <span>${formatDate(pagamento.payment_date)}${pagamento.notes ? ` — ${pagamento.notes}` : ''}</span>
                <span>${formatCurrency(pagamento.amount_paid)}</span>
              </li>
            `
          )
          .join('')
      : '<li>Nenhum pagamento registrado ainda.</li>';

    const saldoDevedor = calculateSaleBalance(sale);

    pagamentosHtml = `
      <h3>Pagamentos recebidos</h3>
      <ul>${listaPagamentos}</ul>
      <p class="saleDetailsBalance">Saldo devedor: ${formatCurrency(saldoDevedor)}</p>
    `;
  }

  detailsRow.innerHTML = `
    <td colspan="5">
      <div class="saleDetailsContent">
        <h3>Itens da venda</h3>
        <ul>${itemsHtml}</ul>
        ${pagamentosHtml}
      </div>
    </td>
  `;

  saleRow.after(detailsRow);
}

function closeAnyOpenSaleDetails() {
  const existingRow = salesTableBodyEl.querySelector('.saleDetailsRow');
  if (existingRow) {
    existingRow.remove();
  }
}

// ---- Mostrar/esconder o campo de "valor recebido" conforme a forma de pagamento ----

function updateAmountFieldVisibility() {
  const isCredit = paymentMethodSelect.value === 'credit';
  amountReceivedFieldEl.hidden = isCredit;
}

paymentMethodSelect.addEventListener('change', () => {
  updateAmountFieldVisibility();

  if (paymentMethodSelect.value === 'credit') {
    amountReceivedInput.value = '';
  }
});

// ---- Verificação de estoque insuficiente antes de confirmar a venda ----

function encontrarItensComEstoqueInsuficiente() {
  return saleItems.filter((item) => item.quantity > item.stockAvailable);
}

// ---- Registrar a venda ----

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (saleItems.length === 0) {
    showFormMessage('Adicione pelo menos um produto antes de registrar a venda.', 'error');
    return;
  }

  // Regra da skill de modelo de dados: avisar sobre estoque insuficiente,
  // mas não bloquear a venda — o usuário decide se confirma mesmo assim.
  const itensSemEstoque = encontrarItensComEstoqueInsuficiente();

  if (itensSemEstoque.length > 0) {
    const nomesItens = itensSemEstoque.map((item) => item.name).join(', ');
    const confirmou = await showConfirmModal({
      title: 'Estoque insuficiente',
      message: `Estoque insuficiente para: ${nomesItens}. Confirma a venda mesmo assim?`,
      confirmLabel: 'Confirmar venda',
      cancelLabel: 'Revisar itens',
    });

    if (!confirmou) {
      return;
    }
  }

  const paymentMethod = paymentMethodSelect.value;
  const isCredit = paymentMethod === 'credit';

  const totalDaVenda = saleItems.reduce(
    (soma, item) => soma + item.quantity * item.unitPrice,
    0
  );

  // Se a forma de pagamento é "A receber", a venda inteira fica pendente e
  // nenhum valor foi recebido agora. Para qualquer outra forma, olhamos o
  // campo "Valor recebido agora": em branco significa pagamento total;
  // um valor menor que o total significa que sobrou pendência parcial.
  const valorDigitado = amountReceivedInput.value.trim();
  const valorRecebido = isCredit
    ? 0
    : valorDigitado === ''
      ? totalDaVenda
      : Number(valorDigitado);

  const paymentStatus = isCredit
    ? 'credit'
    : valorRecebido >= totalDaVenda
      ? 'paid'
      : 'partial';

  const saleData = {
    customerId: customerSelect.value,
    saleDate: saleDateInput.value,
    paymentMethod,
    paymentStatus,
    items: saleItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };

  const { data: sale, error } = await createSale(saleData);

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível registrar a venda. Tente novamente.', 'error');
    return;
  }

  // Se ficou algum valor pendente (status "credit" ou "partial") e algo já
  // foi recebido agora, registramos esse valor como o primeiro pagamento
  // de fiado dessa venda — reaproveitando a mesma lógica que já usamos na
  // tela de controle de fiado (quando chegarmos lá).
  if (paymentStatus !== 'paid' && valorRecebido > 0) {
    const { error: paymentError } = await addCreditPayment(
      sale.id,
      valorRecebido,
      paymentMethod,
      'Pagamento recebido no momento da venda'
    );

    if (paymentError) {
      console.error(paymentError);
      // A venda já foi registrada com sucesso — só o pagamento inicial que
      // falhou. Avisamos o usuário, mas não tratamos isso como erro fatal.
      showFormMessage(
        'Venda registrada, mas houve um problema ao registrar o valor recebido agora.',
        'error'
      );
      resetForm();
      loadSales();
      return;
    }
  }

  showFormMessage('Venda registrada com sucesso!', 'success');
  resetForm();
  loadSales();
});

function resetForm() {
  formEl.reset();
  saleItems = [];
  renderSaleItems();
  amountReceivedInput.value = '';
  updateAmountFieldVisibility();
  saleDateInput.value = new Date().toISOString().slice(0, 10);
}

// ---- Inicialização da página ----

async function init() {
  // Data da venda já começa preenchida com hoje, para agilizar o registro
  saleDateInput.value = new Date().toISOString().slice(0, 10);
  updateAmountFieldVisibility();

  await loadCustomersIntoSelect();
  await loadProducts();
  renderSaleItems();
  loadSales();
}

init();
