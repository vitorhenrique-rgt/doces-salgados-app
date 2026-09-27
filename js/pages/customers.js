// js/pages/customers.js
//
// Esta página orquestra a tela de clientes: busca os dados através do
// customerService, desenha a tabela na tela, e trata os eventos do
// formulário (criar e editar). Ela NUNCA fala com o Supabase diretamente —
// só usa as funções que o customerService já expõe.

import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../services/customerService.js';
import { showConfirmModal } from '../components/confirmModal.js';
import { iconEdit, iconTrash, actionButtonContent } from '../components/icons.js';
import {
  formatPhoneNumber,
  onlyDigits,
  onlyLetters,
  capitalizeName,
} from '../utils/inputMasks.js';

// ---- Referências aos elementos do HTML ----
const formEl = document.getElementById('customerForm');
const customerIdInput = document.getElementById('customerId');
const nameInput = document.getElementById('customerName');
const phoneInput = document.getElementById('customerPhone');
const addressInput = document.getElementById('customerAddress');
const cancelEditButton = document.getElementById('cancelEditButton');
const formMessageEl = document.getElementById('formMessage');
const tableBodyEl = document.getElementById('customerTableBody');

// ---- Máscaras de input (telefone e nome) ----
//
// Aplica a máscara (11) 98888-7777 conforme a pessoa digita. Reatribuir
// phoneInput.value dentro do próprio listener de "input" é o padrão para
// máscara progressiva: a cada tecla, reformatamos o valor inteiro.
phoneInput.addEventListener('input', () => {
  phoneInput.value = formatPhoneNumber(phoneInput.value);
});

// Filtra em tempo real (só letras, acentos, espaço, hífen e apóstrofo)
// enquanto a pessoa digita o nome...
nameInput.addEventListener('input', () => {
  nameInput.value = onlyLetters(nameInput.value);
});

// ...e capitaliza só quando ela sai do campo (blur), não a cada letra —
// se capitalizássemos a cada tecla, ficaria estranho no meio da digitação
// (ex: usuário digitando "maria" letra a letra veria "M", "Ma", "Mar"...
// virando maiúscula toda hora de forma incômoda).
nameInput.addEventListener('blur', () => {
  nameInput.value = capitalizeName(nameInput.value);
});

// ---- Mensagens para o usuário (sem usar alert(), como definido nas convenções) ----

function showFormMessage(text, type) {
  // type = 'success' | 'error'
  formMessageEl.textContent = text;
  formMessageEl.className = type; // reaproveita as classes .success/.error do CSS
}

function clearFormMessage() {
  formMessageEl.textContent = '';
  formMessageEl.className = '';
}

// ---- Alternar entre "modo criar" e "modo editar" no mesmo formulário ----

function enterEditMode(customer) {
  // Preenchemos o formulário com os dados do cliente escolhido, e guardamos
  // o id dele no campo escondido — é isso que o submit vai usar pra saber
  // que agora é uma atualização, não uma criação.
  customerIdInput.value = customer.id;
  nameInput.value = customer.name;
  // O banco guarda o telefone só com dígitos — formatamos aqui só para
  // exibição no campo, igual já fazemos na tabela.
  phoneInput.value = formatPhoneNumber(customer.phone ?? '');
  addressInput.value = customer.address ?? '';
  cancelEditButton.hidden = false;
}

function exitEditMode() {
  // Volta o formulário ao estado "cliente novo": limpa tudo e esconde o
  // campo id e o botão de cancelar.
  formEl.reset();
  customerIdInput.value = '';
  cancelEditButton.hidden = true;
}

cancelEditButton.addEventListener('click', () => {
  exitEditMode();
  clearFormMessage();
});

// ---- Carregar e desenhar a lista de clientes ----

async function loadCustomers() {
  const { data: customers, error } = await listCustomers();

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar os clientes.', 'error');
    return;
  }

  renderCustomerTable(customers);
}

function renderCustomerTable(customers) {
  // Limpa a tabela antes de desenhar de novo, para não duplicar linhas
  tableBodyEl.innerHTML = '';

  if (customers.length === 0) {
    // Estado vazio: orienta o usuário sobre a próxima ação, em vez de só
    // dizer "nenhum cliente encontrado" (conforme a skill de estilo visual)
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="4" class="emptyState">
        Você ainda não cadastrou nenhum cliente. Use o formulário acima para cadastrar o primeiro.
      </td>
    `;
    tableBodyEl.appendChild(emptyRow);
    return;
  }

  for (const customer of customers) {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${customer.name}</td>
      <td>${formatPhoneNumber(customer.phone ?? '')}</td>
      <td>${customer.address ?? ''}</td>
      <td>
        <button type="button" class="rowActionButton" data-action="edit">
          ${actionButtonContent(iconEdit, 'Editar')}
        </button>
        <button type="button" class="rowActionButton danger" data-action="delete">
          ${actionButtonContent(iconTrash, 'Excluir')}
        </button>
      </td>
    `;

    // Botão "Editar" desta linha: entra no modo edição com os dados deste cliente
    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      enterEditMode(customer);
      clearFormMessage();
    });

    // Botão "Excluir" desta linha: pede confirmação antes de apagar de vez
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      handleDeleteCustomer(customer);
    });

    tableBodyEl.appendChild(row);
  }
}

// ---- Excluir cliente ----

async function handleDeleteCustomer(customer) {
  // Modal estilizado, no lugar do confirm() nativo do navegador — é uma
  // ação destrutiva (perigosa), por isso danger: true (botão vermelho).
  const confirmou = await showConfirmModal({
    message: `Excluir o cliente "${customer.name}"? Essa ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    danger: true,
  });

  if (!confirmou) {
    return;
  }

  const { error } = await deleteCustomer(customer.id);

  if (error) {
    console.error(error);
    // Erro mais comum aqui: cliente já tem vendas vinculadas (foreign key).
    // Vamos tratar essa mensagem de forma mais amigável quando chegarmos na tela de vendas.
    showFormMessage('Não foi possível excluir este cliente.', 'error');
    return;
  }

  showFormMessage('Cliente excluído com sucesso.', 'success');
  loadCustomers();
}

// ---- Criar ou atualizar cliente (o mesmo formulário serve para os dois casos) ----

formEl.addEventListener('submit', async (event) => {
  // Impede o comportamento padrão do formulário, que seria recarregar a página
  event.preventDefault();

  // capitalizeName() aqui de novo (além do listener de blur) é uma
  // segurança extra: cobre o caso do usuário colar um texto e enviar o
  // formulário sem nunca sair do campo (sem disparar o blur).
  // onlyDigits() garante que o banco recebe só números, sem a máscara
  // visual "(11) 98888-7777" — a formatação é só para exibição na tela.
  const customerData = {
    name: capitalizeName(nameInput.value.trim()),
    phone: onlyDigits(phoneInput.value),
    address: addressInput.value.trim(),
  };

  const idEmEdicao = customerIdInput.value;

  // Se já existe um id no campo escondido, estamos EDITANDO um cliente existente.
  // Caso contrário, estamos CRIANDO um cliente novo.
  const { error } = idEmEdicao
    ? await updateCustomer(idEmEdicao, customerData)
    : await createCustomer(customerData);

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível salvar o cliente. Tente novamente.', 'error');
    return;
  }

  showFormMessage(
    idEmEdicao ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.',
    'success'
  );

  exitEditMode();
  loadCustomers();
});

// ---- Carrega a lista assim que a página abre ----
loadCustomers();
