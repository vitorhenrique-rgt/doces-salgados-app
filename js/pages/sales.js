// js/pages/sales.js
//
// Orquestra a tela de registrar venda: carrega clientes e produtos,
// controla a busca de produtos (autocomplete simples), monta a lista de
// itens da venda com quantidade ajustável, calcula o total, e no fim
// chama o saleService para registrar tudo.

import { listCustomers } from '../services/customerService.js';
import { listProducts } from '../services/productService.js';
import { createSale, addCreditPayment } from '../services/saleService.js';

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
const paymentStatusSelect = document.getElementById('paymentStatusSelect');
const initialPaymentFieldEl = document.getElementById('initialPaymentField');
const initialPaymentInput = document.getElementById('initialPaymentInput');
const formMessageEl = document.getElementById('formMessage');

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
      <td><button type="button" class="removeItemButton">Remover</button></td>
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

// ---- Mostrar/esconder campo de "valor recebido agora" conforme a situação ----

paymentStatusSelect.addEventListener('change', () => {
  const isFiado = paymentStatusSelect.value === 'credit';
  initialPaymentFieldEl.hidden = !isFiado;

  if (!isFiado) {
    initialPaymentInput.value = '';
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
    const confirmou = confirm(
      `Estoque insuficiente para: ${nomesItens}. Confirma a venda mesmo assim?`
    );

    if (!confirmou) {
      return;
    }
  }

  const saleData = {
    customerId: customerSelect.value,
    saleDate: saleDateInput.value,
    paymentMethod: paymentMethodSelect.value,
    // A venda sempre nasce como "paid" ou "credit" — o status "partial" só
    // acontece depois, automaticamente, se um pagamento parcial for
    // registrado (ver addCreditPayment logo abaixo).
    paymentStatus: paymentStatusSelect.value,
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

  // Se a venda é fiado e o usuário informou um valor recebido no ato,
  // registramos esse pagamento agora — isso já ajusta o status para
  // "partial" (ou "paid", se o valor cobrir o total) automaticamente.
  const valorRecebidoAgora = Number(initialPaymentInput.value);

  if (saleData.paymentStatus === 'credit' && valorRecebidoAgora > 0) {
    const { error: paymentError } = await addCreditPayment(
      sale.id,
      valorRecebidoAgora,
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
      return;
    }
  }

  showFormMessage('Venda registrada com sucesso!', 'success');
  resetForm();
});

function resetForm() {
  formEl.reset();
  saleItems = [];
  renderSaleItems();
  initialPaymentFieldEl.hidden = true;
  saleDateInput.value = new Date().toISOString().slice(0, 10);
}

// ---- Inicialização da página ----

async function init() {
  // Data da venda já começa preenchida com hoje, para agilizar o registro
  saleDateInput.value = new Date().toISOString().slice(0, 10);

  await loadCustomersIntoSelect();
  await loadProducts();
  renderSaleItems();
}

init();
