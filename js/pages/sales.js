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

import { listCustomers } from "../services/customerService.js"
import { listProducts } from "../services/productService.js"
import {
  createSale,
  updateSale,
  deleteSale,
  addCreditPayment,
  listSales,
  getSaleById,
  calculateSaleBalance,
} from "../services/saleService.js"
import { showConfirmModal } from "../components/confirmModal.js"
import {
  iconEdit,
  iconEye,
  iconTrash,
  actionButtonContent,
} from "../components/icons.js"
import { normalizeText } from "../utils/textSearch.js"

// ---- Referências aos elementos do HTML ----
const listViewEl = document.getElementById("listView")
const formViewEl = document.getElementById("formView")
const formTitleEl = document.getElementById("formTitle")
const newSaleButton = document.getElementById("newSaleButton")
const cancelSaleButton = document.getElementById("cancelEditButton")

// Filtros da lista
const saleSearchInput = document.getElementById("saleSearch")
const saleDateFromInput = document.getElementById("saleDateFrom")
const saleDateToInput = document.getElementById("saleDateTo")
const saleStatusFilterSelect = document.getElementById("saleStatusFilter")

const formEl = document.getElementById("saleForm")
const saleIdInput = document.getElementById("saleId")
const customerSearchInput = document.getElementById("customerSearchInput")
const customerSearchResultsEl = document.getElementById("customerSearchResults")
const customerIdInput = document.getElementById("saleCustomer")
const saleDateInput = document.getElementById("saleDate")
const productSearchInput = document.getElementById("productSearchInput")
const productSearchResultsEl = document.getElementById("productSearchResults")
const saleItemsListEl = document.getElementById("saleItemsList")
const noItemsMessageEl = document.getElementById("noItemsMessage")
const discountInput = document.getElementById("saleDiscountInput")
const totalValueEl = document.getElementById("saleTotalValue")
const paymentMethodSelect = document.getElementById("paymentMethodSelect")
const amountReceivedFieldEl = document.getElementById("amountReceivedField")
const amountReceivedInput = document.getElementById("amountReceivedInput")
const formMessageEl = document.getElementById("formMessage")
const salesTableBodyEl = document.getElementById("salesTableBody")

// ---- Estado da tela em memória ----
// "allCustomers" guarda a lista completa de clientes, carregada uma vez ao
// abrir a página — a busca do campo de cliente filtra esse array em
// memória, mesma ideia já usada na busca de produtos logo abaixo.
let allCustomers = []

// "allProducts" guarda a lista completa de produtos, carregada uma vez ao
// abrir a página — a busca filtra esse array em memória, sem precisar
// consultar o Supabase de novo a cada letra digitada.
let allProducts = []

// "allSales" guarda a lista completa de vendas, carregada do banco — os
// filtros da lista (cliente/data/situação) trabalham em cima desse array,
// mesma ideia já usada em Clientes e Produtos.
let allSales = []

// "saleItems" guarda os itens que o usuário já adicionou à venda atual.
// Cada item: { productId, name, unitPrice, quantity, stockAvailable }
let saleItems = []

// ---- Mensagens para o usuário ----

function showFormMessage(text, type) {
  formMessageEl.textContent = text
  formMessageEl.className = type
}

function clearFormMessage() {
  formMessageEl.textContent = ""
  formMessageEl.className = ""
}

function formatCurrency(value) {
  return `R$ ${Number(value).toFixed(2)}`
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
  // usuário clicou em "Nova venda" depois de rolar uma lista longa) —
  // voltamos ao topo para o formulário aparecer inteiro.
  window.scrollTo(0, 0)
}

function enterCreateMode() {
  resetForm()
  clearFormMessage()
  showFormView()
}

// Abre o formulário preenchido com os dados de uma venda existente. Só é
// chamada para vendas sem pagamento de fiado registrado (o botão de
// editar já vem desabilitado nos outros casos — ver renderSalesTable).
async function enterEditMode(sale) {
  // A lista só tem os dados resumidos (cliente, total, situação) — os
  // itens da venda precisam ser buscados à parte.
  const { data: fullSale, error } = await getSaleById(sale.id)

  if (error) {
    console.error(error)
    showFormMessage(
      "Não foi possível carregar os dados desta venda para edição.",
      "error",
    )
    return
  }

  resetForm()
  saleIdInput.value = fullSale.id
  formTitleEl.textContent = "Editar venda"

  customerIdInput.value = fullSale.customer_id
  customerSearchInput.value = fullSale.customers?.name ?? ""
  saleDateInput.value = fullSale.sale_date
  discountInput.value =
    fullSale.discount_amount > 0 ? fullSale.discount_amount : ""
  paymentMethodSelect.value = fullSale.payment_method ?? "cash"
  updateAmountFieldVisibility()

  // Reconstrói os itens em memória a partir do que está salvo.
  // "stockAvailable" soma de volta a quantidade desta venda ao estoque
  // atual do produto — sem isso, o aviso de "estoque insuficiente"
  // dispararia à toa, já que esta mesma venda já tinha abatido aquele
  // estoque antes de entrarmos no modo de edição.
  saleItems = fullSale.sale_items.map((item) => {
    const currentProduct = allProducts.find(
      (product) => product.id === item.product_id,
    )
    const currentStock = currentProduct ? currentProduct.stock_quantity : 0

    return {
      productId: item.product_id,
      name: item.products?.name ?? "Produto removido",
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      stockAvailable: currentStock + Number(item.quantity),
    }
  })

  renderSaleItems()
  clearFormMessage()
  showFormView()
}

// Fecha o formulário e volta para a lista, descartando o que estava em
// andamento (sem pedir confirmação — o usuário pode reabrir "Nova venda"
// a qualquer momento, não é uma ação destrutiva sobre dados já salvos).
function exitFormView() {
  resetForm()
  showListView()
}

newSaleButton.addEventListener("click", enterCreateMode)

cancelSaleButton.addEventListener("click", () => {
  exitFormView()
  clearFormMessage()
})

// ---- Carregar clientes em memória (para a busca) ----

async function loadCustomers() {
  const { data: customers, error } = await listCustomers()

  if (error) {
    console.error(error)
    showFormMessage("Não foi possível carregar a lista de clientes.", "error")
    return
  }

  allCustomers = customers
}

// ---- Busca de clientes (autocomplete, mesmo padrão da busca de produtos) ----

customerSearchInput.addEventListener("input", () => {
  // Qualquer edição no texto invalida a seleção anterior — só volta a
  // valer um cliente depois que o usuário escolher de novo na lista,
  // evitando enviar um id que não bate mais com o que está escrito.
  customerIdInput.value = ""

  const termoBuscado = customerSearchInput.value.trim().toLowerCase()

  if (termoBuscado === "") {
    customerSearchResultsEl.hidden = true
    customerSearchResultsEl.innerHTML = ""
    return
  }

  const encontrados = allCustomers.filter((customer) =>
    customer.name.toLowerCase().includes(termoBuscado),
  )

  renderCustomerSearchResults(encontrados)
})

function renderCustomerSearchResults(customers) {
  customerSearchResultsEl.innerHTML = ""

  if (customers.length === 0) {
    const emptyItem = document.createElement("li")
    emptyItem.className = "noResultsItem"
    emptyItem.textContent = "Nenhum cliente encontrado."
    customerSearchResultsEl.appendChild(emptyItem)
    customerSearchResultsEl.hidden = false
    return
  }

  // Mesmo limite de 8 resultados por vez do campo de produto — busca
  // rápida, sem virar uma lista gigante rolando na tela do celular.
  for (const customer of customers.slice(0, 8)) {
    const resultItem = document.createElement("li")
    resultItem.className = "customerResultItem"

    // O endereço só aparece se existir — evita uma segunda linha vazia
    // pra clientes sem endereço cadastrado. É essa segunda linha, menor
    // e mais clara, que ajuda a diferenciar clientes com o mesmo nome.
    const addressHtml = customer.address
      ? `<span class="resultCustomerAddress">${customer.address}</span>`
      : ""

    resultItem.innerHTML = `
      <span class="resultCustomerName">${customer.name}</span>
      ${addressHtml}
    `

    resultItem.addEventListener("click", () => {
      customerIdInput.value = customer.id
      customerSearchInput.value = customer.name
      customerSearchResultsEl.hidden = true
      customerSearchResultsEl.innerHTML = ""
    })

    customerSearchResultsEl.appendChild(resultItem)
  }

  customerSearchResultsEl.hidden = false
}

// ---- Carregar produtos em memória (para a busca) ----

async function loadProducts() {
  const { data: products, error } = await listProducts()

  if (error) {
    console.error(error)
    showFormMessage("Não foi possível carregar a lista de produtos.", "error")
    return
  }

  allProducts = products
}

// ---- Busca de produtos (autocomplete simples) ----

productSearchInput.addEventListener("input", () => {
  const termoBuscado = productSearchInput.value.trim().toLowerCase()

  if (termoBuscado === "") {
    productSearchResultsEl.hidden = true
    productSearchResultsEl.innerHTML = ""
    return
  }

  const encontrados = allProducts.filter((product) =>
    product.name.toLowerCase().includes(termoBuscado),
  )

  renderSearchResults(encontrados)
})

function renderSearchResults(products) {
  productSearchResultsEl.innerHTML = ""

  if (products.length === 0) {
    const emptyItem = document.createElement("li")
    emptyItem.className = "noResultsItem"
    emptyItem.textContent = "Nenhum produto encontrado."
    productSearchResultsEl.appendChild(emptyItem)
    productSearchResultsEl.hidden = false
    return
  }

  // Mostra no máximo 8 resultados por vez — o suficiente para uma busca
  // rápida, sem virar uma lista gigante rolando na tela do celular.
  for (const product of products.slice(0, 8)) {
    const resultItem = document.createElement("li")
    resultItem.innerHTML = `
      <span class="resultProductName">${product.name}</span>
      <span class="resultProductPrice">${formatCurrency(product.sale_price)}</span>
    `

    resultItem.addEventListener("click", () => {
      addProductToSale(product)
      productSearchInput.value = ""
      productSearchResultsEl.hidden = true
      productSearchResultsEl.innerHTML = ""
      productSearchInput.focus()
    })

    productSearchResultsEl.appendChild(resultItem)
  }

  productSearchResultsEl.hidden = false
}

// ---- Adicionar/remover/ajustar itens da venda ----

function addProductToSale(product) {
  // Se o produto já está na lista, só aumenta a quantidade em 1, em vez
  // de criar uma linha duplicada para o mesmo produto.
  const itemExistente = saleItems.find((item) => item.productId === product.id)

  if (itemExistente) {
    itemExistente.quantity += 1
  } else {
    saleItems.push({
      productId: product.id,
      name: product.name,
      unitPrice: Number(product.sale_price),
      quantity: 1,
      stockAvailable: product.stock_quantity,
    })
  }

  renderSaleItems()
}

function changeItemQuantity(productId, delta) {
  const item = saleItems.find((item) => item.productId === productId)
  if (!item) return

  const novaQuantidade = item.quantity + delta

  if (novaQuantidade < 1) {
    // Diminuir abaixo de 1 remove o item da venda — não faz sentido um
    // item com quantidade zero na lista.
    saleItems = saleItems.filter((item) => item.productId !== productId)
  } else {
    item.quantity = novaQuantidade
  }

  renderSaleItems()
}

function removeItem(productId) {
  saleItems = saleItems.filter((item) => item.productId !== productId)
  renderSaleItems()
}

function renderSaleItems() {
  saleItemsListEl.innerHTML = ""

  if (saleItems.length === 0) {
    noItemsMessageEl.hidden = false
    updateTotal()
    return
  }

  noItemsMessageEl.hidden = true

  for (const item of saleItems) {
    const subtotal = item.quantity * item.unitPrice
    const row = document.createElement("li")
    row.className = "saleItemRow"

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
          ${actionButtonContent(iconTrash, "Remover")}
        </button>
      </div>
    `

    row
      .querySelector('[data-action="decrease"]')
      .addEventListener("click", () => {
        changeItemQuantity(item.productId, -1)
      })

    row
      .querySelector('[data-action="increase"]')
      .addEventListener("click", () => {
        changeItemQuantity(item.productId, 1)
      })

    // O valor TOTAL da linha é editável clicando nele (ex: desconto
    // combinado verbalmente com o cliente, ou correção de um preço
    // desatualizado). Isso NÃO altera o sale_price cadastrado do produto,
    // vale só para esta venda. Como o banco guarda preço por unidade
    // (sale_items.unit_price), calculamos esse valor por trás das cenas
    // como "total digitado ÷ quantidade" — quem usa a tela só pensa em
    // termos de total, nunca precisa fazer essa conta na cabeça.
    const subtotalSpan = row.querySelector(".saleItemSubtotal")

    function enterSubtotalEditMode() {
      const subtotalInput = document.createElement("input")
      subtotalInput.type = "number"
      subtotalInput.step = "0.01"
      subtotalInput.min = "0"
      subtotalInput.className = "saleItemSubtotalInput"
      subtotalInput.value = (item.quantity * item.unitPrice).toFixed(2)
      subtotalInput.setAttribute("aria-label", `Valor total de ${item.name}`)

      subtotalSpan.replaceWith(subtotalInput)
      subtotalInput.focus()
      subtotalInput.select()

      // Evita que o Escape (cancelar) também dispare o "commit" do blur
      // que acontece automaticamente quando o input sai da tela.
      let cancelado = false

      function commitEdit() {
        if (cancelado) return

        const novoTotal = Number(subtotalInput.value)
        const totalValido =
          Number.isNaN(novoTotal) || novoTotal < 0 ? 0 : novoTotal

        // Nota: dividir o total por uma quantidade que não é múltiplo
        // exato pode gerar um preço unitário com mais casas decimais do
        // que o banco guarda (só 2 casas) — ao reabrir a venda depois,
        // o total pode aparecer com 1 centavo de diferença. Pra uso do
        // dia a dia isso não costuma ser perceptível.
        item.unitPrice = item.quantity > 0 ? totalValido / item.quantity : 0

        subtotalInput.replaceWith(subtotalSpan)
        subtotalSpan.textContent = formatCurrency(totalValido)
        updateTotal()
      }

      function cancelEdit() {
        cancelado = true
        subtotalInput.replaceWith(subtotalSpan)
      }

      subtotalInput.addEventListener("blur", commitEdit)
      subtotalInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          subtotalInput.blur() // dispara commitEdit através do blur acima
        } else if (event.key === "Escape") {
          event.preventDefault()
          cancelEdit()
        }
      })
    }

    subtotalSpan.addEventListener("click", enterSubtotalEditMode)
    subtotalSpan.addEventListener("keydown", (event) => {
      // Acessibilidade: quem navega só com teclado também consegue
      // entrar no modo de edição, com Enter ou espaço (mesmo padrão de
      // ativação de um botão comum).
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        enterSubtotalEditMode()
      }
    })

    row.querySelector(".removeItemButton").addEventListener("click", () => {
      removeItem(item.productId)
    })

    saleItemsListEl.appendChild(row)
  }

  updateTotal()
}

// Lê o desconto digitado, tratando campo vazio/inválido/negativo como 0 —
// desconto nunca é obrigatório, e nunca pode ser um valor negativo (isso
// aumentaria o total em vez de diminuir).
function getDiscountAmount() {
  const valor = Number(discountInput.value)
  return Number.isNaN(valor) || valor < 0 ? 0 : valor
}

function updateTotal() {
  const subtotal = saleItems.reduce(
    (soma, item) => soma + item.quantity * item.unitPrice,
    0,
  )
  const desconto = getDiscountAmount()

  // O desconto é de edição livre — o usuário decide o valor, inclusive
  // zerando o total (ex: dar o produto de brinde). Math.max só protege
  // contra um desconto digitado maior que o subtotal, pra não ficar
  // negativo na tela.
  const total = Math.max(subtotal - desconto, 0)
  totalValueEl.textContent = formatCurrency(total)
}

// A cada vez que o desconto muda, recalculamos o total exibido
discountInput.addEventListener("input", updateTotal)

// ---- Lista de vendas já registradas ----

// Mapeia o status salvo no banco (em inglês) para o texto e a classe de
// badge que aparecem na tela (em português, seguindo a skill de estilo visual)
const paymentStatusLabels = {
  paid: { text: "Pago", badgeClass: "badge--paid" },
  partial: { text: "Parcial", badgeClass: "badge--partial" },
  credit: { text: "A receber", badgeClass: "badge--credit" },
}

// Usado para descrever a forma de pagamento de uma venda paga na hora
// (sem nenhuma linha em credit_payments), na seção de pagamentos dos
// detalhes — ver toggleSaleDetails, mais abaixo.
const paymentMethodLabels = {
  cash: "Dinheiro",
  pix: "Pix",
  card: "Cartão",
}

function formatDate(isoDate) {
  // O banco guarda a data como 'YYYY-MM-DD' — convertemos para 'DD/MM/YYYY',
  // formato mais comum de se ler no Brasil.
  const [ano, mes, dia] = isoDate.split("-")
  return `${dia}/${mes}/${ano}`
}

async function loadSales() {
  const { data: sales, error } = await listSales()

  if (error) {
    console.error(error)
    showFormMessage("Não foi possível carregar a lista de vendas.", "error")
    return
  }

  allSales = sales
  renderSalesTable()
}

// ---- Filtros da lista (cliente, período e situação) ----
//
// Todos os filtros trabalham em cima de "allSales" (já carregado em
// memória) e são combinados com "E" — ex: se a pessoa preenche cliente
// E data, só aparecem vendas que combinam com os dois ao mesmo tempo.
function getFilteredSales() {
  const searchTerm = normalizeText(saleSearchInput.value.trim())
  const dateFrom = saleDateFromInput.value // 'YYYY-MM-DD' ou ''
  const dateTo = saleDateToInput.value
  const statusFilter = saleStatusFilterSelect.value

  return allSales.filter((sale) => {
    const customerName = sale.customers?.name ?? ""
    const matchesCustomer =
      searchTerm === "" || normalizeText(customerName).includes(searchTerm)

    // Comparação de datas em formato 'YYYY-MM-DD' funciona direto como
    // texto (ordem alfabética = ordem cronológica nesse formato), sem
    // precisar converter para objeto Date.
    const matchesDateFrom = dateFrom === "" || sale.sale_date >= dateFrom
    const matchesDateTo = dateTo === "" || sale.sale_date <= dateTo

    const matchesStatus =
      statusFilter === "" || sale.payment_status === statusFilter

    return matchesCustomer && matchesDateFrom && matchesDateTo && matchesStatus
  })
}

// A cada mudança em qualquer filtro, desenhamos a tabela de novo já filtrada
saleSearchInput.addEventListener("input", renderSalesTable)
saleDateFromInput.addEventListener("change", renderSalesTable)
saleDateToInput.addEventListener("change", renderSalesTable)
saleStatusFilterSelect.addEventListener("change", renderSalesTable)

function renderSalesTable() {
  salesTableBodyEl.innerHTML = ""

  // Estado vazio 1: nenhuma venda registrada ainda (nem os filtros importam aqui)
  if (allSales.length === 0) {
    const emptyRow = document.createElement("tr")
    emptyRow.innerHTML = `
      <td colspan="5" class="emptyState">
        Nenhuma venda registrada ainda. Toque em "Nova venda" para registrar a primeira.
      </td>
    `
    salesTableBodyEl.appendChild(emptyRow)
    return
  }

  const sales = getFilteredSales()

  // Estado vazio 2: existem vendas, mas nenhuma combina com os filtros aplicados
  if (sales.length === 0) {
    const emptyRow = document.createElement("tr")
    emptyRow.innerHTML = `
      <td colspan="5" class="emptyState">
        Nenhuma venda encontrada para os filtros selecionados.
      </td>
    `
    salesTableBodyEl.appendChild(emptyRow)
    return
  }

  for (const sale of sales) {
    const row = document.createElement("tr")
    // A classe "saleRow" é o que o CSS usa para reorganizar as células em
    // duas linhas (data/total | cliente/situação | ação) em telas
    // estreitas, via CSS Grid — ver style.css, seção "Lista de vendas em
    // telas estreitas". A linha de detalhes expandidos (.saleDetailsRow)
    // não tem essa classe, por isso continua um bloco único.
    row.className = "saleRow"
    const statusInfo = paymentStatusLabels[sale.payment_status]

    // Vendas que já têm pagamento de fiado registrado não podem ser
    // editadas nem excluídas (decisão do usuário, 2026-10-03) — evita ter
    // que decidir o que fazer com dinheiro que o cliente já pagou. Além
    // disso, uma venda já marcada como "paga" (pagamento à vista, no
    // momento da venda) também não pode ser EDITADA — o dinheiro já foi
    // recebido pelos itens originais, então editar os itens não faz
    // sentido. Excluir uma venda paga ainda é permitido (ex: corrigir um
    // registro feito por engano), desde que não tenha pagamento de fiado.
    const temPagamento = (sale.credit_payments ?? []).length > 0
    const vendaPaga = sale.payment_status === "paid"

    const editDesabilitado = temPagamento || vendaPaga
    const deleteDesabilitado = temPagamento

    // O "title" explica o motivo certo pra cada botão, em vez de uma
    // mensagem genérica — ajuda o usuário a entender a regra sem precisar
    // perguntar.
    const motivoEdicao = temPagamento
      ? "Esta venda já tem pagamento de fiado registrado."
      : "Vendas já pagas não podem ser editadas."
    const motivoExclusao = "Esta venda já tem pagamento de fiado registrado."

    row.innerHTML = `
      <td>${formatDate(sale.sale_date)}</td>
      <td>${sale.customers?.name ?? "—"}</td>
      <td>${formatCurrency(sale.total_amount)}</td>
      <td><span class="badge ${statusInfo.badgeClass}">${statusInfo.text}</span></td>
      <td>
        <button
          type="button"
          class="rowActionButton"
          data-action="edit"
          ${editDesabilitado ? `disabled title="${motivoEdicao}"` : ""}
        >
          ${actionButtonContent(iconEdit, "Editar")}
        </button>
        <button
          type="button"
          class="rowActionButton danger"
          data-action="delete"
          ${deleteDesabilitado ? `disabled title="${motivoExclusao}"` : ""}
        >
          ${actionButtonContent(iconTrash, "Excluir")}
        </button>
        <button type="button" class="viewSaleDetailsButton">
          ${actionButtonContent(iconEye, "Ver detalhes")}
        </button>
      </td>
    `

    row
      .querySelector(".viewSaleDetailsButton")
      .addEventListener("click", () => {
        toggleSaleDetails(sale.id, row)
      })

    if (!editDesabilitado) {
      row
        .querySelector('[data-action="edit"]')
        .addEventListener("click", () => {
          enterEditMode(sale)
        })
    }

    if (!deleteDesabilitado) {
      row
        .querySelector('[data-action="delete"]')
        .addEventListener("click", () => {
          handleDeleteSale(sale)
        })
    }

    salesTableBodyEl.appendChild(row)
  }
}

// ---- Excluir venda ----

async function handleDeleteSale(sale) {
  const confirmou = await showConfirmModal({
    message: `Excluir a venda de ${formatDate(sale.sale_date)} (${sale.customers?.name ?? "cliente removido"})? O estoque abatido será devolvido. Essa ação não pode ser desfeita.`,
    confirmLabel: "Excluir",
    danger: true,
  })

  if (!confirmou) {
    return
  }

  const { error } = await deleteSale(sale.id)

  if (error) {
    console.error(error)
    showFormMessage(
      error.message ?? "Não foi possível excluir esta venda.",
      "error",
    )
    return
  }

  showFormMessage(
    "Venda excluída com sucesso. O estoque foi devolvido.",
    "success",
  )
  loadSales()
}

// ---- Expandir/recolher os detalhes de uma venda (itens + pagamentos) ----

async function toggleSaleDetails(saleId, saleRow) {
  // Se já existe uma linha de detalhes logo depois desta, o clique é para
  // FECHAR — só remove e para por aqui.
  const proximaLinha = saleRow.nextElementSibling
  if (proximaLinha && proximaLinha.classList.contains("saleDetailsRow")) {
    proximaLinha.remove()
    return
  }

  // Fecha qualquer outra linha de detalhes que esteja aberta, para não
  // acumular vários detalhes abertos ao mesmo tempo na tela.
  closeAnyOpenSaleDetails()

  const { data: sale, error } = await getSaleById(saleId)

  if (error) {
    console.error(error)
    showFormMessage(
      "Não foi possível carregar os detalhes desta venda.",
      "error",
    )
    return
  }

  const detailsRow = document.createElement("tr")
  detailsRow.className = "saleDetailsRow"

  const itemsHtml = sale.sale_items
    .map(
      (item) => `
        <li>
          <span>(${item.quantity}x) ${item.products?.name ?? "Produto removido"}</span>
          <span>${formatCurrency(item.subtotal)}</span>
        </li>
      `,
    )
    .join("")

  // Mostramos o histórico de pagamentos em QUALQUER venda que já teve
  // algum valor recebido — de forma padrão, sempre que existir pagamento,
  // exibe (decisão do usuário, 2026-10-04). Isso cobre dois casos:
  // 1) vendas com linhas de verdade em credit_payments (fiado pago aos
  //    poucos, ou um valor recebido no momento da venda via "Valor
  //    recebido agora");
  // 2) vendas pagas de uma vez só no ato, que NÃO geram linha em
  //    credit_payments (o pagamento já nasce como "paid" direto) — nesse
  //    caso, montamos uma linha "sintética" representando esse pagamento,
  //    com a data da venda e a forma de pagamento usada, para a tela
  //    nunca ficar sem mostrar o valor pago.
  const temPagamentosRegistrados = (sale.credit_payments ?? []).length > 0
  const foiPagaNaHora =
    sale.payment_status === "paid" && !temPagamentosRegistrados

  let pagamentosHtml = ""
  if (temPagamentosRegistrados || foiPagaNaHora) {
    // Mesmo formato em qualquer linha, pra ficar padronizado: data — forma
    // de pagamento, valor à direita. Nem a linha real (credit_payments)
    // nem a sintética (venda paga na hora) mostram observações/texto
    // extra aqui — só o essencial.
    const listaPagamentos = temPagamentosRegistrados
      ? sale.credit_payments
          .map(
            (pagamento) => `
              <li>
                <span>${formatDate(pagamento.payment_date)} — ${paymentMethodLabels[pagamento.payment_method] ?? pagamento.payment_method}</span>
                <span>${formatCurrency(pagamento.amount_paid)}</span>
              </li>
            `,
          )
          .join("")
      : `
          <li>
            <span>${formatDate(sale.sale_date)} — ${paymentMethodLabels[sale.payment_method] ?? sale.payment_method}</span>
            <span>${formatCurrency(sale.total_amount)}</span>
          </li>
        `

    const saldoDevedor = calculateSaleBalance(sale)

    pagamentosHtml = `
      <h3>Pagamentos recebidos</h3>
      <ul>${listaPagamentos}</ul>
      <p class="saleDetailsBalance">Saldo devedor: ${formatCurrency(saldoDevedor)}</p>
    `
  }

  detailsRow.innerHTML = `
    <td colspan="5">
      <div class="saleDetailsContent">
        <h3>Itens da venda</h3>
        <ul>${itemsHtml}</ul>
        ${pagamentosHtml}
      </div>
    </td>
  `

  saleRow.after(detailsRow)
}

function closeAnyOpenSaleDetails() {
  const existingRow = salesTableBodyEl.querySelector(".saleDetailsRow")
  if (existingRow) {
    existingRow.remove()
  }
}

// ---- Mostrar/esconder o campo de "valor recebido" conforme a forma de pagamento ----

function updateAmountFieldVisibility() {
  const isCredit = paymentMethodSelect.value === "credit"
  amountReceivedFieldEl.hidden = isCredit
}

paymentMethodSelect.addEventListener("change", () => {
  updateAmountFieldVisibility()

  if (paymentMethodSelect.value === "credit") {
    amountReceivedInput.value = ""
  }
})

// ---- Verificação de estoque insuficiente antes de confirmar a venda ----

function encontrarItensComEstoqueInsuficiente() {
  return saleItems.filter((item) => item.quantity > item.stockAvailable)
}

// ---- Registrar a venda ----

formEl.addEventListener("submit", async (event) => {
  event.preventDefault()

  // Como o campo de cliente agora é um autocomplete (não um <select>
  // nativo), o navegador não valida sozinho que um cliente de verdade foi
  // escolhido — o usuário pode ter só digitado um texto sem clicar em
  // nenhum resultado. Conferimos isso na mão, olhando o campo escondido
  // que só é preenchido quando um resultado da lista é clicado.
  if (!customerIdInput.value) {
    showFormMessage(
      "Selecione um cliente da lista antes de registrar a venda.",
      "error",
    )
    customerSearchInput.focus()
    return
  }

  if (saleItems.length === 0) {
    showFormMessage(
      "Adicione pelo menos um produto antes de registrar a venda.",
      "error",
    )
    return
  }

  // Regra da skill de modelo de dados: avisar sobre estoque insuficiente,
  // mas não bloquear a venda — o usuário decide se confirma mesmo assim.
  const itensSemEstoque = encontrarItensComEstoqueInsuficiente()

  if (itensSemEstoque.length > 0) {
    const nomesItens = itensSemEstoque.map((item) => item.name).join(", ")
    const confirmou = await showConfirmModal({
      title: "Estoque insuficiente",
      message: `Estoque insuficiente para: ${nomesItens}. Confirma a venda mesmo assim?`,
      confirmLabel: "Confirmar venda",
      cancelLabel: "Revisar itens",
    })

    if (!confirmou) {
      return
    }
  }

  const paymentMethod = paymentMethodSelect.value
  const isCredit = paymentMethod === "credit"

  // O total que importa para decidir a situação de pagamento é o total
  // COM o desconto já aplicado — é esse valor que o cliente efetivamente
  // precisa pagar, não o subtotal dos itens.
  const subtotalDaVenda = saleItems.reduce(
    (soma, item) => soma + item.quantity * item.unitPrice,
    0,
  )
  const discountAmount = getDiscountAmount()
  const totalDaVenda = Math.max(subtotalDaVenda - discountAmount, 0)

  // Se a forma de pagamento é "A receber", a venda inteira fica pendente e
  // nenhum valor foi recebido agora. Para qualquer outra forma, olhamos o
  // campo "Valor recebido agora": em branco significa pagamento total;
  // um valor menor que o total significa que sobrou pendência parcial.
  const valorDigitado = amountReceivedInput.value.trim()
  const valorRecebido = isCredit
    ? 0
    : valorDigitado === ""
      ? totalDaVenda
      : Number(valorDigitado)

  const paymentStatus = isCredit
    ? "credit"
    : valorRecebido >= totalDaVenda
      ? "paid"
      : "partial"

  const saleData = {
    customerId: customerIdInput.value,
    saleDate: saleDateInput.value,
    paymentMethod,
    paymentStatus,
    discountAmount,
    items: saleItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  }

  // Se já existe um id no campo escondido, estamos EDITANDO uma venda
  // existente. Caso contrário, estamos CRIANDO uma venda nova. Os dois
  // casos devolvem { data, error } no mesmo formato, então o resto do
  // fluxo (registrar pagamento inicial, mensagens, recarregar a lista)
  // funciona igual para ambos.
  const idEmEdicao = saleIdInput.value

  const { data: sale, error } = idEmEdicao
    ? await updateSale(idEmEdicao, saleData)
    : await createSale(saleData)

  if (error) {
    console.error(error)
    showFormMessage(
      error.message ??
        (idEmEdicao
          ? "Não foi possível salvar as alterações desta venda. Tente novamente."
          : "Não foi possível registrar a venda. Tente novamente."),
      "error",
    )
    return
  }

  // Se ficou algum valor pendente (status "credit" ou "partial") e algo já
  // foi recebido agora, registramos esse valor como o primeiro pagamento
  // de fiado dessa venda — reaproveitando a mesma lógica que já usamos na
  // tela de controle de fiado. Isso vale tanto para criar quanto para
  // editar, já que só é possível editar vendas que ainda não têm nenhum
  // pagamento registrado (ver updateSale, em saleService.js).
  if (paymentStatus !== "paid" && valorRecebido > 0) {
    const { error: paymentError } = await addCreditPayment(
      sale.id,
      valorRecebido,
      paymentMethod,
      "Pagamento recebido no momento da venda",
    )

    if (paymentError) {
      console.error(paymentError)
      // A venda já foi registrada/atualizada com sucesso — só o pagamento
      // inicial que falhou. Avisamos o usuário, mas não tratamos isso
      // como erro fatal.
      showFormMessage(
        "Venda salva, mas houve um problema ao registrar o valor recebido agora.",
        "error",
      )
      exitFormView()
      loadSales()
      return
    }
  }

  exitFormView()
  showFormMessage(
    idEmEdicao
      ? "Venda atualizada com sucesso!"
      : "Venda registrada com sucesso!",
    "success",
  )
  loadSales()
})

function resetForm() {
  formEl.reset()
  saleIdInput.value = ""
  formTitleEl.textContent = "Nova venda"
  customerSearchResultsEl.hidden = true
  customerSearchResultsEl.innerHTML = ""
  saleItems = []
  renderSaleItems()
  amountReceivedInput.value = ""
  updateAmountFieldVisibility()
  // Data da venda já começa preenchida com hoje, para agilizar o registro
  saleDateInput.value = new Date().toISOString().slice(0, 10)
}

// ---- Inicialização da página ----

async function init() {
  updateAmountFieldVisibility()

  await loadCustomers()
  await loadProducts()
  renderSaleItems()
  loadSales()
}

init()
