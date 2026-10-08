// js/pages/products.js
//
// Esta página orquestra a tela de produtos, que tem DUAS "visões" na mesma
// página HTML: a LISTA (com busca) e o FORMULÁRIO (criar/editar, sem mexer
// em estoque). Só uma aparece por vez — alternamos entre elas escondendo/
// mostrando os blocos com o atributo "hidden". A ação de "Repor estoque"
// é separada: abre um mini-formulário embutido dentro da própria lista,
// logo abaixo do produto (mesma ideia que já usávamos na tabela antiga).

import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  increaseStock,
  setStock,
} from '../services/productService.js';
import { showConfirmModal } from '../components/confirmModal.js';
import { iconEdit, iconPlus, iconTrash, actionButtonContent } from '../components/icons.js';
import { enforceIntegerString } from '../utils/inputMasks.js';
import { normalizeText } from '../utils/textSearch.js';
import { formatCurrency } from '../utils/formatCurrency.js';

// ---- Referências aos elementos do HTML ----
const listViewEl = document.getElementById('listView');
const formViewEl = document.getElementById('formView');
const formTitleEl = document.getElementById('formTitle');
const newProductButton = document.getElementById('newProductButton');
const searchInput = document.getElementById('productSearch');
const productListEl = document.getElementById('productList');

const formEl = document.getElementById('productForm');
const productIdInput = document.getElementById('productId');
const nameInput = document.getElementById('productName');
const salePriceInput = document.getElementById('productSalePrice');
const categoryInput = document.getElementById('productCategory');
const initialStockInput = document.getElementById('productInitialStock');
const initialStockFieldEl = document.getElementById('initialStockField');
const cancelEditButton = document.getElementById('cancelEditButton');
const formMessageEl = document.getElementById('formMessage');

// ---- Estado da tela em memória ----
// "allProducts" guarda a lista completa, carregada do banco. O filtro de
// busca trabalha em cima desse array (sem consultar o Supabase a cada
// letra digitada).
let allProducts = [];

// ---- Máscara do campo de estoque inicial ----
//
// Estoque é sempre unidade inteira (não existe "12.5 unidades prontas").
// enforceIntegerString corta a parte decimal em vez de só remover o ponto
// (evita que "12.5" vire "125" por engano) — ver comentário na própria
// função, em js/utils/inputMasks.js.
initialStockInput.addEventListener('input', () => {
  initialStockInput.value = enforceIntegerString(initialStockInput.value);
});

// ---- Mensagens para o usuário ----

function showFormMessage(text, type) {
  formMessageEl.textContent = text;
  formMessageEl.className = type;
}

function clearFormMessage() {
  formMessageEl.textContent = '';
  formMessageEl.className = '';
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
  // usuário clicou em "Editar" no fim de uma lista longa) — voltamos ao
  // topo para o formulário aparecer inteiro.
  window.scrollTo(0, 0);
}

// Abre o formulário vazio, para cadastrar um produto novo
function enterCreateMode() {
  formEl.reset();
  productIdInput.value = '';
  formTitleEl.textContent = 'Novo produto';
  // Ao criar, o campo de estoque inicial aparece — é o único momento em
  // que o formulário pode definir stock_quantity diretamente.
  initialStockFieldEl.hidden = false;
  clearFormMessage();
  showFormView();
  nameInput.focus();
}

// Abre o formulário preenchido com os dados de um produto existente
function enterEditMode(product) {
  productIdInput.value = product.id;
  nameInput.value = product.name;
  salePriceInput.value = product.sale_price;
  categoryInput.value = product.category ?? '';
  formTitleEl.textContent = 'Editar produto';

  // Ao editar, escondemos o campo de estoque inicial — reposição de
  // estoque é feita separadamente, direto na lista (ver openRestockRow).
  // Isso evita que o usuário apague o estoque atual sem querer ao editar
  // só o nome ou o preço.
  initialStockFieldEl.hidden = true;

  clearFormMessage();
  showFormView();
  nameInput.focus();
}

// Fecha o formulário e volta para a lista (usado ao salvar e ao cancelar)
function exitFormView() {
  formEl.reset();
  productIdInput.value = '';
  showListView();
}

newProductButton.addEventListener('click', enterCreateMode);

cancelEditButton.addEventListener('click', () => {
  exitFormView();
  clearFormMessage();
});

// ---- Carregar os produtos do banco ----

async function loadProducts() {
  const { data: products, error } = await listProducts();

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar os produtos.', 'error');
    return;
  }

  allProducts = products;
  renderProductList();
}

// ---- Filtro de busca ----

// Devolve só os produtos que combinam com o que está digitado na busca.
// Busca em nome e categoria (não faz sentido buscar por preço/estoque aqui).
function getFilteredProducts() {
  const rawTerm = searchInput.value.trim();

  if (rawTerm === '') {
    return allProducts;
  }

  const term = normalizeText(rawTerm);

  return allProducts.filter((product) => {
    const nameMatches = normalizeText(product.name).includes(term);
    const categoryMatches = normalizeText(product.category ?? '').includes(term);

    return nameMatches || categoryMatches;
  });
}

// A cada letra digitada, desenhamos a lista de novo já filtrada
searchInput.addEventListener('input', renderProductList);

// ---- Desenhar a lista de produtos (cards) ----

function renderProductList() {
  // Limpa a lista antes de desenhar de novo, para não duplicar itens
  productListEl.innerHTML = '';

  // Estado vazio 1: nenhum produto cadastrado ainda
  if (allProducts.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'emptyState';
    emptyItem.textContent =
      'Você ainda não cadastrou nenhum produto. Toque em "Novo produto" para cadastrar o primeiro.';
    productListEl.appendChild(emptyItem);
    return;
  }

  const products = getFilteredProducts();

  // Estado vazio 2: existem produtos, mas nenhum combina com a busca
  if (products.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'emptyState';
    emptyItem.textContent = 'Nenhum produto encontrado para essa busca.';
    productListEl.appendChild(emptyItem);
    return;
  }

  for (const product of products) {
    const item = document.createElement('li');
    item.className = 'recordItem';

    // Categoria só aparece se existir — evita "undefined" ou uma linha
    // vazia em produtos sem categoria definida.
    const categoryHtml = product.category
      ? `<span class="recordDetail">${product.category}</span>`
      : '';

    // Preço e estoque ficam na segunda coluna (equivalente ao "endereço"
    // no padrão de Clientes), cada um em sua própria linha — sem separador
    // entre eles, para não gastar espaço horizontal à toa no mobile.
    item.innerHTML = `
      <div class="recordInfo">
        <div class="recordPrimary">
          <span class="recordTitle">${product.name}</span>
          ${categoryHtml}
        </div>
        <div class="recordSecondary">
          <span class="recordDetail">${formatCurrency(product.sale_price)}</span>
          <span class="recordDetail stockValue">${product.stock_quantity} un.</span>
        </div>
      </div>
      <div class="recordActions">
        <button type="button" class="rowActionButton" data-action="edit">
          ${actionButtonContent(iconEdit, 'Editar')}
        </button>
        <button type="button" class="rowActionButton" data-action="restock">
          ${actionButtonContent(iconPlus, 'Estoque')}
        </button>
        <button type="button" class="rowActionButton danger" data-action="delete">
          ${actionButtonContent(iconTrash, 'Excluir')}
        </button>
      </div>
    `;

    item.querySelector('[data-action="edit"]').addEventListener('click', () => {
      enterEditMode(product);
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', () => {
      handleDeleteProduct(product);
    });

    item.querySelector('[data-action="restock"]').addEventListener('click', () => {
      openRestockRow(product, item);
    });

    productListEl.appendChild(item);
  }
}

// ---- Reposição de estoque (item inline logo abaixo do produto na lista) ----

function openRestockRow(product, productItemEl) {
  // Antes de abrir uma nova, fecha qualquer linha de reposição que já
  // esteja aberta — evita ter dois formulários de reposição abertos ao
  // mesmo tempo, o que confundiria qual produto está sendo alterado.
  closeAnyOpenRestockRow();

  // Dois modos no mesmo formulário: "Adicionar produzido" (soma ao estoque
  // atual, é o comportamento original) e "Corrigir estoque atual"
  // (sobrescreve para o valor exato digitado — usado quando uma reposição
  // anterior foi registrada errada). O modo "add" começa marcado por
  // padrão, para não mudar o comportamento de quem já está acostumado.
  const restockItem = document.createElement('li');
  restockItem.className = 'restockRow';
  restockItem.innerHTML = `
    <form class="restockForm">
      <div class="restockModeToggle">
        <label class="restockModeOption">
          <input type="radio" name="restockMode-${product.id}" value="add" checked />
          Adicionar produzido
        </label>
        <label class="restockModeOption">
          <input type="radio" name="restockMode-${product.id}" value="set" />
          Corrigir estoque atual
        </label>
      </div>
      <label for="restockAmount-${product.id}" id="restockLabel-${product.id}">
        Repor estoque de "${product.name}" — quantidade produzida:
      </label>
      <input type="number" id="restockAmount-${product.id}" min="1" step="1" required />
      <button type="submit" class="confirmRestockButton">Confirmar</button>
      <button type="button" class="cancelRestockButton">Cancelar</button>
    </form>
  `;

  // Insere o item de reposição logo depois do item do produto
  productItemEl.after(restockItem);

  const restockFormEl = restockItem.querySelector('.restockForm');
  const modeRadios = restockItem.querySelectorAll('input[type="radio"]');
  const labelEl = restockItem.querySelector(`#restockLabel-${product.id}`);
  const amountInput = restockItem.querySelector('input[type="number"]');
  const cancelButton = restockItem.querySelector('.cancelRestockButton');

  amountInput.focus();

  // Mesma máscara de número inteiro do estoque inicial — como este campo
  // é criado dinamicamente a cada clique em "Repor estoque", o listener
  // precisa ser registrado aqui dentro, e não junto dos outros no topo do
  // arquivo (o elemento ainda não existe até este ponto do código rodar).
  amountInput.addEventListener('input', () => {
    amountInput.value = enforceIntegerString(amountInput.value);
  });

  // Ao trocar de modo, o texto do campo e as regras mudam: "Adicionar"
  // pede uma quantidade produzida (mínimo 1, começa vazio); "Corrigir"
  // pede o novo valor total do estoque (pode ser 0, e já vem preenchido
  // com o estoque atual como ponto de partida, para o usuário só ajustar).
  for (const radio of modeRadios) {
    radio.addEventListener('change', () => {
      const isSetMode = restockFormEl.querySelector('input[type="radio"]:checked').value === 'set';

      if (isSetMode) {
        labelEl.textContent = `Corrigir estoque de "${product.name}" para:`;
        amountInput.min = '0';
        amountInput.value = product.stock_quantity;
      } else {
        labelEl.textContent = `Repor estoque de "${product.name}" — quantidade produzida:`;
        amountInput.min = '1';
        amountInput.value = '';
      }

      amountInput.focus();
    });
  }

  cancelButton.addEventListener('click', () => {
    restockItem.remove();
  });

  restockFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();

    const mode = restockFormEl.querySelector('input[type="radio"]:checked').value;
    const amount = Number(amountInput.value);

    // "add" soma ao estoque atual (increaseStock); "set" sobrescreve para
    // o valor exato digitado (setStock) — ver productService.js.
    const { error } =
      mode === 'set' ? await setStock(product.id, amount) : await increaseStock(product.id, amount);

    if (error) {
      console.error(error);
      showFormMessage('Não foi possível atualizar o estoque deste produto.', 'error');
      return;
    }

    showFormMessage(`Estoque de "${product.name}" atualizado com sucesso.`, 'success');
    loadProducts();
  });
}

function closeAnyOpenRestockRow() {
  const existingRow = productListEl.querySelector('.restockRow');
  if (existingRow) {
    existingRow.remove();
  }
}

// ---- Excluir produto ----

async function handleDeleteProduct(product) {
  const confirmou = await showConfirmModal({
    message: `Excluir o produto "${product.name}"? Essa ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    danger: true,
  });

  if (!confirmou) {
    return;
  }

  const { error } = await deleteProduct(product.id);

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível excluir este produto.', 'error');
    return;
  }

  showFormMessage('Produto excluído com sucesso.', 'success');
  loadProducts();
}

// ---- Criar ou atualizar produto ----

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const idEmEdicao = productIdInput.value;

  if (idEmEdicao) {
    // Modo edição: só dados gerais, NUNCA stock_quantity
    const updatedFields = {
      name: nameInput.value.trim(),
      sale_price: Number(salePriceInput.value),
      category: categoryInput.value.trim(),
    };

    const { error } = await updateProduct(idEmEdicao, updatedFields);

    if (error) {
      console.error(error);
      showFormMessage('Não foi possível salvar o produto. Tente novamente.', 'error');
      return;
    }

    exitFormView();
    showFormMessage('Produto atualizado com sucesso.', 'success');
  } else {
    // Modo criação: inclui o estoque inicial
    const newProduct = {
      name: nameInput.value.trim(),
      sale_price: Number(salePriceInput.value),
      category: categoryInput.value.trim(),
      stock_quantity: Number(initialStockInput.value),
    };

    const { error } = await createProduct(newProduct);

    if (error) {
      console.error(error);
      showFormMessage('Não foi possível salvar o produto. Tente novamente.', 'error');
      return;
    }

    exitFormView();
    showFormMessage('Produto cadastrado com sucesso.', 'success');
  }

  loadProducts();
});

// ---- Carrega a lista assim que a página abre ----
loadProducts();