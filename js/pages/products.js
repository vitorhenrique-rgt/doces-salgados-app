// js/pages/products.js
//
// Orquestra a tela de produtos: cadastro/edição (sem mexer em estoque),
// listagem, exclusão, e a ação separada de "Repor estoque" — que é um
// mini-formulário que aparece embutido na própria linha da tabela.

import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  increaseStock,
} from '../services/productService.js';

// ---- Referências aos elementos do HTML ----
const formEl = document.getElementById('productForm');
const productIdInput = document.getElementById('productId');
const nameInput = document.getElementById('productName');
const salePriceInput = document.getElementById('productSalePrice');
const categoryInput = document.getElementById('productCategory');
const initialStockInput = document.getElementById('productInitialStock');
const initialStockFieldEl = document.getElementById('initialStockField');
const cancelEditButton = document.getElementById('cancelEditButton');
const formMessageEl = document.getElementById('formMessage');
const tableBodyEl = document.getElementById('productTableBody');

// ---- Mensagens para o usuário ----

function showFormMessage(text, type) {
  formMessageEl.textContent = text;
  formMessageEl.className = type;
}

function clearFormMessage() {
  formMessageEl.textContent = '';
  formMessageEl.className = '';
}

// ---- Alternar entre "modo criar" e "modo editar" ----

function enterEditMode(product) {
  productIdInput.value = product.id;
  nameInput.value = product.name;
  salePriceInput.value = product.sale_price;
  categoryInput.value = product.category ?? '';
  cancelEditButton.hidden = false;

  // Ao editar, escondemos o campo de estoque inicial — reposição de
  // estoque é feita separadamente, direto na lista (ver handleRestockClick).
  initialStockFieldEl.hidden = true;
}

function exitEditMode() {
  formEl.reset();
  productIdInput.value = '';
  cancelEditButton.hidden = true;

  // Volta a mostrar o campo de estoque inicial, já que agora o formulário
  // está pronto para cadastrar um produto novo de novo.
  initialStockFieldEl.hidden = false;
}

cancelEditButton.addEventListener('click', () => {
  exitEditMode();
  clearFormMessage();
});

// ---- Carregar e desenhar a lista de produtos ----

async function loadProducts() {
  const { data: products, error } = await listProducts();

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar os produtos.', 'error');
    return;
  }

  renderProductTable(products);
}

function renderProductTable(products) {
  tableBodyEl.innerHTML = '';

  if (products.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="5" class="emptyState">
        Você ainda não cadastrou nenhum produto. Use o formulário acima para cadastrar o primeiro.
      </td>
    `;
    tableBodyEl.appendChild(emptyRow);
    return;
  }

  for (const product of products) {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.category ?? ''}</td>
      <td>R$ ${Number(product.sale_price).toFixed(2)}</td>
      <td class="stockValue">${product.stock_quantity}</td>
      <td>
        <button type="button" class="rowActionButton" data-action="edit">Editar</button>
        <button type="button" class="rowActionButton" data-action="restock">Repor estoque</button>
        <button type="button" class="rowActionButton danger" data-action="delete">Excluir</button>
      </td>
    `;

    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      enterEditMode(product);
      clearFormMessage();
    });

    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      handleDeleteProduct(product);
    });

    row.querySelector('[data-action="restock"]').addEventListener('click', () => {
      openRestockRow(product, row);
    });

    tableBodyEl.appendChild(row);
  }
}

// ---- Reposição de estoque (formulário inline embaixo da linha do produto) ----

function openRestockRow(product, productRow) {
  // Antes de abrir uma nova, fecha qualquer linha de reposição que já
  // esteja aberta — evita ter dois formulários de reposição abertos ao
  // mesmo tempo, o que confundiria qual produto está sendo alterado.
  closeAnyOpenRestockRow();

  const restockRow = document.createElement('tr');
  restockRow.className = 'restockRow';
  restockRow.innerHTML = `
    <td colspan="5">
      <form class="restockForm">
        <label for="restockAmount-${product.id}">Repor estoque de "${product.name}" — quantidade produzida:</label>
        <input type="number" id="restockAmount-${product.id}" min="1" step="1" required />
        <button type="submit" class="confirmRestockButton">Confirmar</button>
        <button type="button" class="cancelRestockButton">Cancelar</button>
      </form>
    </td>
  `;

  // Insere a linha de reposição logo depois da linha do produto
  productRow.after(restockRow);

  const restockFormEl = restockRow.querySelector('.restockForm');
  const amountInput = restockRow.querySelector('input[type="number"]');
  const cancelButton = restockRow.querySelector('.cancelRestockButton');

  amountInput.focus();

  cancelButton.addEventListener('click', () => {
    restockRow.remove();
  });

  restockFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();

    const amount = Number(amountInput.value);

    const { error } = await increaseStock(product.id, amount);

    if (error) {
      console.error(error);
      showFormMessage('Não foi possível repor o estoque deste produto.', 'error');
      return;
    }

    showFormMessage(`Estoque de "${product.name}" atualizado com sucesso.`, 'success');
    loadProducts();
  });
}

function closeAnyOpenRestockRow() {
  const existingRow = tableBodyEl.querySelector('.restockRow');
  if (existingRow) {
    existingRow.remove();
  }
}

// ---- Excluir produto ----

async function handleDeleteProduct(product) {
  const confirmou = confirm(`Excluir o produto "${product.name}"? Essa ação não pode ser desfeita.`);

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

    showFormMessage('Produto cadastrado com sucesso.', 'success');
  }

  exitEditMode();
  loadProducts();
});

// ---- Carrega a lista assim que a página abre ----
loadProducts();
