// js/pages/customers.js
//
// Esta página orquestra a tela de clientes, que tem DUAS "visões" na mesma
// página HTML: a LISTA (com busca) e o FORMULÁRIO (criar/editar). Só uma
// aparece por vez — alternamos entre elas escondendo/mostrando os blocos
// com o atributo "hidden". Ela NUNCA fala com o Supabase diretamente —
// só usa as funções que o customerService já expõe.

import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../services/customerService.js"
import { showConfirmModal } from "../components/confirmModal.js"
import {
  iconEdit,
  iconTrash,
  actionButtonContent,
} from "../components/icons.js"
import {
  formatPhoneNumber,
  onlyDigits,
  onlyLetters,
  capitalizeName,
} from "../utils/inputMasks.js"
import { normalizeText } from "../utils/textSearch.js"

// ---- Referências aos elementos do HTML ----
const listViewEl = document.getElementById("listView")
const formViewEl = document.getElementById("formView")
const formTitleEl = document.getElementById("formTitle")
const newCustomerButton = document.getElementById("newCustomerButton")
const searchInput = document.getElementById("customerSearch")
const customerListEl = document.getElementById("customerList")

const formEl = document.getElementById("customerForm")
const customerIdInput = document.getElementById("customerId")
const nameInput = document.getElementById("customerName")
const phoneInput = document.getElementById("customerPhone")
const addressInput = document.getElementById("customerAddress")
const cancelEditButton = document.getElementById("cancelEditButton")
const formMessageEl = document.getElementById("formMessage")

// ---- Estado da tela em memória ----
// "allCustomers" guarda a lista completa, carregada do banco. O filtro de
// busca trabalha em cima desse array (sem consultar o Supabase a cada
// letra digitada) — mesma ideia da busca de produtos na tela de vendas.
let allCustomers = []

// ---- Máscaras de input (telefone e nome) ----
//
// Aplica a máscara (11) 98888-7777 conforme a pessoa digita. Reatribuir
// phoneInput.value dentro do próprio listener de "input" é o padrão para
// máscara progressiva: a cada tecla, reformatamos o valor inteiro.
phoneInput.addEventListener("input", () => {
  phoneInput.value = formatPhoneNumber(phoneInput.value)
})

// Filtra em tempo real (só letras, acentos, espaço, hífen e apóstrofo)
// enquanto a pessoa digita o nome...
nameInput.addEventListener("input", () => {
  nameInput.value = onlyLetters(nameInput.value)
})

// ...e capitaliza só quando ela sai do campo (blur), não a cada letra —
// se capitalizássemos a cada tecla, ficaria estranho no meio da digitação.
nameInput.addEventListener("blur", () => {
  nameInput.value = capitalizeName(nameInput.value)
})

// ---- Mensagens para o usuário (sem usar alert(), como definido nas convenções) ----

function showFormMessage(text, type) {
  // type = 'success' | 'error'
  formMessageEl.textContent = text
  formMessageEl.className = type // reaproveita as classes .success/.error do CSS
}

function clearFormMessage() {
  formMessageEl.textContent = ""
  formMessageEl.className = ""
}

// ---- Alternar entre as duas visões (lista <-> formulário) ----

function showListView() {
  listViewEl.hidden = false
  formViewEl.hidden = true
}

function showFormView() {
  listViewEl.hidden = true
  formViewEl.hidden = false
  // Ao trocar de visão, a página pode estar rolada lá embaixo (ex: o
  // usuário clicou em "Editar" no fim de uma lista longa) — voltamos ao
  // topo para o formulário aparecer inteiro.
  window.scrollTo(0, 0)
}

// Abre o formulário vazio, para cadastrar um cliente novo
function enterCreateMode() {
  formEl.reset()
  customerIdInput.value = ""
  formTitleEl.textContent = "Novo cliente"
  clearFormMessage()
  showFormView()
  nameInput.focus()
}

// Abre o formulário preenchido com os dados de um cliente existente
function enterEditMode(customer) {
  // Guardamos o id do cliente no campo escondido — é isso que o submit
  // vai usar pra saber que agora é uma atualização, não uma criação.
  customerIdInput.value = customer.id
  nameInput.value = customer.name
  // O banco guarda o telefone só com dígitos — formatamos aqui só para
  // exibição no campo, igual já fazemos na lista.
  phoneInput.value = formatPhoneNumber(customer.phone ?? "")
  addressInput.value = customer.address ?? ""
  formTitleEl.textContent = "Editar cliente"
  clearFormMessage()
  showFormView()
  nameInput.focus()
}

// Fecha o formulário e volta para a lista (usado ao salvar e ao cancelar)
function exitFormView() {
  formEl.reset()
  customerIdInput.value = ""
  showListView()
}

newCustomerButton.addEventListener("click", enterCreateMode)

cancelEditButton.addEventListener("click", () => {
  exitFormView()
  clearFormMessage()
})

// ---- Carregar os clientes do banco ----

async function loadCustomers() {
  const { data: customers, error } = await listCustomers()

  if (error) {
    console.error(error)
    showFormMessage("Não foi possível carregar os clientes.", "error")
    return
  }

  allCustomers = customers
  renderCustomerList()
}

// ---- Filtro de busca ----

// Devolve só os clientes que combinam com o que está digitado na busca.
// Busca em nome, endereço e telefone. O telefone é comparado só pelos
// dígitos (o banco guarda sem máscara), então "98888" encontra
// "(11) 98888-7777" mesmo o usuário não digitando parênteses e traço.
function getFilteredCustomers() {
  const rawTerm = searchInput.value.trim()

  if (rawTerm === "") {
    return allCustomers
  }

  const term = normalizeText(rawTerm)
  const termDigits = onlyDigits(rawTerm)

  return allCustomers.filter((customer) => {
    const nameMatches = normalizeText(customer.name).includes(term)
    const addressMatches = normalizeText(customer.address ?? "").includes(term)
    const phoneMatches =
      termDigits !== "" && (customer.phone ?? "").includes(termDigits)

    return nameMatches || addressMatches || phoneMatches
  })
}

// A cada letra digitada, desenhamos a lista de novo já filtrada
searchInput.addEventListener("input", renderCustomerList)

// ---- Desenhar a lista de clientes (cards) ----

function renderCustomerList() {
  // Limpa a lista antes de desenhar de novo, para não duplicar itens
  customerListEl.innerHTML = ""

  // Estado vazio 1: nenhum cliente cadastrado ainda
  if (allCustomers.length === 0) {
    const emptyItem = document.createElement("li")
    emptyItem.className = "emptyState"
    emptyItem.textContent =
      'Você ainda não cadastrou nenhum cliente. Toque em "Novo cliente" para cadastrar o primeiro.'
    customerListEl.appendChild(emptyItem)
    return
  }

  const customers = getFilteredCustomers()

  // Estado vazio 2: existem clientes, mas nenhum combina com a busca
  if (customers.length === 0) {
    const emptyItem = document.createElement("li")
    emptyItem.className = "emptyState"
    emptyItem.textContent = "Nenhum cliente encontrado para essa busca."
    customerListEl.appendChild(emptyItem)
    return
  }

  for (const customer of customers) {
    const item = document.createElement("li")
    item.className = "recordItem"

    // Telefone e endereço só aparecem se existirem — evita linhas vazias
    // no card de clientes que não têm esses dados.
    const phoneText = formatPhoneNumber(customer.phone ?? "")
    const phoneHtml = phoneText
      ? `<span class="recordDetail recordPhone">${phoneText}</span>`
      : ""
    const addressHtml = customer.address
      ? `<span class="recordDetail recordAddress">${customer.address}</span>`
      : ""

    // O nome e o telefone ficam juntos num "bloco primário" (recordPrimary),
    // sempre empilhados um sobre o outro — inclusive em telas grandes. Isso
    // evita que, com nome/telefone/endereço todos na mesma linha, o texto
    // quebre de forma feia quando algum campo é mais longo. O endereço fica
    // como uma segunda coluna, e as ações sempre grudadas à direita.
    item.innerHTML = `
      <div class="recordInfo">
        <div class="recordPrimary">
          <span class="recordTitle">${customer.name}</span>
          ${phoneHtml}
        </div>
        ${addressHtml}
      </div>
      <div class="recordActions">
        <button type="button" class="rowActionButton" data-action="edit">
          ${actionButtonContent(iconEdit, "Editar")}
        </button>
        <button type="button" class="rowActionButton danger" data-action="delete">
          ${actionButtonContent(iconTrash, "Excluir")}
        </button>
      </div>
    `

    // Botão "Editar" deste card: abre o formulário com os dados deste cliente
    item.querySelector('[data-action="edit"]').addEventListener("click", () => {
      enterEditMode(customer)
    })

    // Botão "Excluir" deste card: pede confirmação antes de apagar de vez
    item
      .querySelector('[data-action="delete"]')
      .addEventListener("click", () => {
        handleDeleteCustomer(customer)
      })

    customerListEl.appendChild(item)
  }
}

// ---- Excluir cliente ----

async function handleDeleteCustomer(customer) {
  // Modal estilizado, no lugar do confirm() nativo do navegador — é uma
  // ação destrutiva (perigosa), por isso danger: true (botão vermelho).
  const confirmou = await showConfirmModal({
    message: `Excluir o cliente "${customer.name}"? Essa ação não pode ser desfeita.`,
    confirmLabel: "Excluir",
    danger: true,
  })

  if (!confirmou) {
    return
  }

  const { error } = await deleteCustomer(customer.id)

  if (error) {
    console.error(error)
    // Erro mais comum aqui: cliente já tem vendas vinculadas (foreign key).
    showFormMessage("Não foi possível excluir este cliente.", "error")
    return
  }

  showFormMessage("Cliente excluído com sucesso.", "success")
  loadCustomers()
}

// ---- Criar ou atualizar cliente (o mesmo formulário serve para os dois casos) ----

formEl.addEventListener("submit", async (event) => {
  // Impede o comportamento padrão do formulário, que seria recarregar a página
  event.preventDefault()

  // capitalizeName() aqui de novo (além do listener de blur) é uma
  // segurança extra: cobre o caso do usuário colar um texto e enviar o
  // formulário sem nunca sair do campo (sem disparar o blur).
  // onlyDigits() garante que o banco recebe só números, sem a máscara
  // visual "(11) 98888-7777" — a formatação é só para exibição na tela.
  const customerData = {
    name: capitalizeName(nameInput.value.trim()),
    phone: onlyDigits(phoneInput.value),
    address: addressInput.value.trim(),
  }

  const idEmEdicao = customerIdInput.value

  // Se já existe um id no campo escondido, estamos EDITANDO um cliente existente.
  // Caso contrário, estamos CRIANDO um cliente novo.
  const { error } = idEmEdicao
    ? await updateCustomer(idEmEdicao, customerData)
    : await createCustomer(customerData)

  if (error) {
    console.error(error)
    // Em caso de erro, ficamos no formulário para o usuário não perder o
    // que digitou e poder tentar de novo.
    showFormMessage(
      "Não foi possível salvar o cliente. Tente novamente.",
      "error",
    )
    return
  }

  // Deu certo: volta para a lista, onde a mensagem de sucesso aparece no topo
  exitFormView()
  showFormMessage(
    idEmEdicao
      ? "Cliente atualizado com sucesso."
      : "Cliente cadastrado com sucesso.",
    "success",
  )
  loadCustomers()
})

// ---- Carrega a lista assim que a página abre ----
loadCustomers()
