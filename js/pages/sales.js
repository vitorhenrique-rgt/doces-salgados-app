// js/pages/sales.js
//
// Orquestra a tela de vendas, que tem DUAS "visões" na mesma página HTML:
// a LISTA (com filtros de cliente/data/situação) e o FORMULÁRIO de nova
// venda (autocomplete de produtos, itens, pagamento). Só uma aparece por
// vez — alternamos entre elas escondendo/mostrando os blocos com o
// atributo "hidden", mesmo padrão já usado em Clientes e Produtos.
//
// A lista continua sendo uma <table> (não cards): a skill de estilo visual
// reserva tabela para telas que já têm uma ação de expandir detalhe por
// linha, que é o caso de Vendas.

import { listCustomers } from '../services/customerService.js';
import { listProducts } from '../services/productService.js';
import { createSale, addCreditPayment, listSales, getSaleById, calculateSaleBalance } from '../services/saleService.js';
import { showConfirmModal } from '../components/confirmModal.js';
import { iconEye, iconTrash, actionButtonContent } from '../components/icons.js';
import { normalizeText } from '../utils/textSearch.js';

// ---- Referências aos elementos do HTML ----
const listViewEl = document.getElementById('listView');
const formViewEl = document.getElementById('formView');
const newSaleButton = document.getElementById('newSaleButton');
const cancelSaleButton = document.getElementById('cancelEditButton');

// Filtros da lista
const saleSearchInput = document.getElementById('saleSearch');
const saleDateFromInput = document.getElementById('saleDateFrom');
const saleDateToInput = document.getElementById('saleDateTo');
const saleStatusFilterSelect = document.getElementById('saleStatusFilter');

const formEl = document.getElementById('saleForm');
const customerSelect = document.getElementById('saleCustomer');
const saleDateInput = document.getElementById('saleDate');
const productSearchInput = document.getElementById('productSearchInput');
const productSearchResultsEl = document.getElementById('productSearchResults');
const saleItemsListEl = document.getElementById('saleItemsList');
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

// "allSales" guarda a lista completa de vendas, carregada do banco — os
// filtros da lista (cliente/data/situação) trabalham em cima desse array,
// mesma ideia já usada em Clientes e Produtos.
let allSales = [];

// "saleItems" guarda os itens que o usuário já adicionou à venda atual.
// Cada item: { productId, name, unitPrice, quantity, stockAvailable }
let saleItems = [];

// ---- Mensagens para o usuário ----

function showFormMessage(text, type) {
  formMessageEl.textContent = text;
  formMessageEl.className = type;
}

function clearFormMessage() {
  formMessageEl.textContent = '';
  formMessageEl.className = '';
}

function formatCurrency(value) {
  return `R$ ${Number(value).toFixed(2)}`;
}

// ---- Alternar entre as duas visões (lista <-> formulário) ----

function showListView() {
  listViewEl.hidden = false;
  formViewEl.hidden = true;
}

function showFormView() {
  listViewEl.hidden = true;
  formViewEl.hidden = false;
  // Ao trocar de visão, a página pode estar rolada lá embaixo (ex: o
  // usuário clicou em "Nova venda" depois de rolar uma lista longa) —
  // voltamos ao topo para o formulário aparecer inteiro.
  window.scrollTo(0, 0);
}

function enterCreateMode() {
  resetForm();
  clearFormMessage();
  showFormView();
}

// Fecha o formulário e volta para a lista, descartando o que estava em
// andamento (sem pedir confirmação — o usuário pode reabrir "Nova venda"
// a qualquer momento, não é uma ação destrutiva sobre dados já salvos).
function exitFormView() {
  resetForm();
  showListView();
}

newSaleButton.addEventListener('click', enterCreateMode);

cancelSaleButton.addEventListener('click', () => {
  exitFormView();
  clearFormMessage();
});

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
  saleItemsListEl.innerHTML = '';

  if (saleItems.length === 0) {
    noItemsMessageEl.hidden = false;
    updateTotal();
    return;
  }

  noItemsMessageEl.hidden = true;

  for (const item of saleItems) {
    const subtotal = item.quantity * item.unitPrice;
    const row = document.createElement('li');
    row.className = 'saleItemRow';

    // Duas partes dentro do item: o nome do produto (primeira linha no
    // mobile) e os controles — quantidade, subtotal (clicável para
    // editar) e excluir (segunda linha no mobile; tudo numa linha só no
    // desktop, ver CSS .saleItemRow e o media query de 480px).
    row.innerHTML = `
      <span class="saleItemName">${item.name}</span>
      <div class="saleItemControls">
        <div class="qtyStepper">
          <button type="button" data-action="decrease">−</button>
          <span class="qtyValue">${item.quantity}</span>
          <button type="button" data-action="increase">+</button>
        </div>
        <span
          class="saleItemSubtotal"
          tabindex="0"
          role="button"
          title="Clique para editar o valor total deste item"
          aria-label="Valor total de ${item.name}, clique para editar"
        >${formatCurrency(subtotal)}</span>
        <button type="button" class="removeItemButton">
          ${actionButtonContent(iconTrash, 'Remover')}
        </button>
      </div>
    `;

    row.querySelector('[data-action="decrease"]').addEventListener('click', () => {
      changeItemQuantity(item.productId, -1);
    });

    row.querySelector('[data-action="increase"]').addEventListener('click', () => {
      changeItemQuantity(item.productId, 1);
    });

    // O valor TOTAL da linha é editável clicando nele (ex: desconto
    // combinado verbalmente com o cliente, ou correção de um preço
    // desatualizado). Isso NÃO altera o sale_price cadastrado do produto,
    // vale só para esta venda. Como o banco guarda preço por unidade
    // (sale_items.unit_price), calculamos esse valor por trás das cenas
    // como "total digitado ÷ quantidade" — quem usa a tela só pensa em
    // termos de total, nunca precisa fazer essa conta na cabeça.
    const subtotalSpan = row.querySelector('.saleItemSubtotal');

    function enterSubtotalEditMode() {
      const subtotalInput = document.createElement('input');
      subtotalInput.type = 'number';
      subtotalInput.step = '0.01';
      subtotalInput.min = '0';
      subtotalInput.className = 'saleItemSubtotalInput';
      subtotalInput.value = (item.quantity * item.unitPrice).toFixed(2);
      subtotalInput.setAttribute('aria-label', `Valor total de ${item.name}`);

      subtotalSpan.replaceWith(subtotalInput);
      subtotalInput.focus();
      subtotalInput.select();

      // Evita que o Escape (cancelar) também dispare o "commit" do blur
      // que acontece automaticamente quando o input sai da tela.
      let cancelado = false;

      function commitEdit() {
        if (cancelado) return;

        const novoTotal = Number(subtotalInput.value);
        const totalValido = Number.isNaN(novoTotal) || novoTotal < 0 ? 0 : novoTotal;

        // Nota: dividir o total por uma quantidade que não é múltiplo
        // exato pode gerar um preço unitário com mais casas decimais do
        // que o banco guarda (só 2 casas) — ao reabrir a venda depois,
        // o total pode aparecer com 1 centavo de diferença. Pra uso do
        // dia a dia isso não costuma ser perceptível.
        item.unitPrice = item.quantity > 0 ? totalValido / item.quantity : 0;

        subtotalInput.replaceWith(subtotalSpan);
        subtotalSpan.textContent = formatCurrency(totalValido);
        updateTotal();
      }

      function cancelEdit() {
        cancelado = true;
        subtotalInput.replaceWith(subtotalSpan);
      }

      subtotalInput.addEventListener('blur', commitEdit);
      subtotalInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          subtotalInput.blur(); // dispara commitEdit através do blur acima
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
      });
    }

    subtotalSpan.addEventListener('click', enterSubtotalEditMode);
    subtotalSpan.addEventListener('keydown', (event) => {
      // Acessibilidade: quem navega só com teclado também consegue
      // entrar no modo de edição, com Enter ou espaço (mesmo padrão de
      // ativação de um botão comum).
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        enterSubtotalEditMode();
      }
    });

    row.querySelector('.removeItemButton').addEventListener('click', () => {
      removeItem(item.productId);
    });

    saleItemsListEl.appendChild(row);
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

  allSales = sales;
  renderSalesTable();
}

// ---- Filtros da lista (cliente, período e situação) ----
//
// Todos os filtros trabalham em cima de "allSales" (já carregado em
// memória) e são combinados com "E" — ex: se a pessoa preenche cliente
// E data, só aparecem vendas que combinam com os dois ao mesmo tempo.
function getFilteredSales() {
  const searchTerm = normalizeText(saleSearchInput.value.trim());
  const dateFrom = saleDateFromInput.value; // 'YYYY-MM-DD' ou ''
  const dateTo = saleDateToInput.value;
  const statusFilter = saleStatusFilterSelect.value;

  return allSales.filter((sale) => {
    const customerName = sale.customers?.name ?? '';
    const matchesCustomer = searchTerm === '' || normalizeText(customerName).includes(searchTerm);

    // Comparação de datas em formato 'YYYY-MM-DD' funciona direto como
    // texto (ordem alfabética = ordem cronológica nesse formato), sem
    // precisar converter para objeto Date.
    const matchesDateFrom = dateFrom === '' || sale.sale_date >= dateFrom;
    const matchesDateTo = dateTo === '' || sale.sale_date <= dateTo;

    const matchesStatus = statusFilter === '' || sale.payment_status === statusFilter;

    return matchesCustomer && matchesDateFrom && matchesDateTo && matchesStatus;
  });
}

// A cada mudança em qualquer filtro, desenhamos a tabela de novo já filtrada
saleSearchInput.addEventListener('input', renderSalesTable);
saleDateFromInput.addEventListener('change', renderSalesTable);
saleDateToInput.addEventListener('change', renderSalesTable);
saleStatusFilterSelect.addEventListener('change', renderSalesTable);

function renderSalesTable() {
  salesTableBodyEl.innerHTML = '';

  // Estado vazio 1: nenhuma venda registrada ainda (nem os filtros importam aqui)
  if (allSales.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="5" class="emptyState">
        Nenhuma venda registrada ainda. Toque em "Nova venda" para registrar a primeira.
      </td>
    `;
    salesTableBodyEl.appendChild(emptyRow);
    return;
  }

  const sales = getFilteredSales();

  // Estado vazio 2: existem vendas, mas nenhuma combina com os filtros aplicados
  if (sales.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="5" class="emptyState">
        Nenhuma venda encontrada para os filtros selecionados.
      </td>
    `;
    salesTableBodyEl.appendChild(emptyRow);
    return;
  }

  for (const sale of sales) {
    const row = document.createElement('tr');
    // A classe "saleRow" é o que o CSS usa para reorganizar as células em
    // duas linhas (data/total | cliente/situação | ação) em telas
    // estreitas, via CSS Grid — ver style.css, seção "Lista de vendas em
    // telas estreitas". A linha de detalhes expandidos (.saleDetailsRow)
    // não tem essa classe, por isso continua um bloco único.
    row.className = 'saleRow';
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
          <span>(${item.quantity}x) ${item.products?.name ?? 'Produto removido'}</span>
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
  // tela de controle de fiado.
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
      exitFormView();
      loadSales();
      return;
    }
  }

  exitFormView();
  showFormMessage('Venda registrada com sucesso!', 'success');
  loadSales();
});

function resetForm() {
  formEl.reset();
  saleItems = [];
  renderSaleItems();
  amountReceivedInput.value = '';
  updateAmountFieldVisibility();
  // Data da venda já começa preenchida com hoje, para agilizar o registro
  saleDateInput.value = new Date().toISOString().slice(0, 10);
}

// ---- Inicialização da página ----

async function init() {
  updateAmountFieldVisibility();

  await loadCustomersIntoSelect();
  await loadProducts();
  renderSaleItems();
  loadSales();
}

init();
