// js/pages/credit.js
//
// Orquestra a tela de controle de fiado: busca todas as vendas em aberto
// (status "credit" ou "partial"), agrupa por cliente para mostrar quem
// deve e quanto deve, permite filtrar por nome do cliente, e permite
// registrar UM pagamento por cliente — que é distribuído automaticamente
// entre as vendas em aberto dele, da mais antiga para a mais nova (ver
// payCustomerCredit no saleService).

import {
  listOpenCreditSales,
  calculateSaleBalance,
  payCustomerCredit,
} from "../services/saleService.js"
import { formatCurrency } from "../utils/formatCurrency.js"
import {
  iconEye,
  iconMessage,
  actionButtonContent,
} from "../components/icons.js"
import { normalizeText } from "../utils/textSearch.js"
import { buildWhatsAppUrl } from "../utils/whatsapp.js"

const searchInput = document.getElementById("creditSearch")
const tableBodyEl = document.getElementById("creditTableBody")
const formMessageEl = document.getElementById("formMessage")

// ---- Estado da tela em memória ----
// "allCustomerGroups" guarda todos os clientes com pendência, já agrupados.
// O filtro de busca trabalha em cima desse array (sem reconsultar o banco
// a cada letra digitada) — mesma ideia já usada em Clientes e Produtos.
let allCustomerGroups = []

function showFormMessage(text, type) {
  formMessageEl.textContent = text
  formMessageEl.className = type
}

function formatDate(isoDate) {
  const [ano, mes, dia] = isoDate.split("-")
  return `${dia}/${mes}/${ano}`
}

const paymentStatusLabels = {
  partial: { text: "Parcial", badgeClass: "badge--partial" },
  credit: { text: "A receber", badgeClass: "badge--credit" },
}

// ---- Agrupar as vendas em aberto por cliente ----
//
// listOpenCreditSales() devolve uma lista "achatada" de vendas — aqui
// juntamos essas vendas por cliente, somando o saldo devedor de cada uma,
// para responder a pergunta "quanto cada cliente deve no total".
function groupSalesByCustomer(sales) {
  const groupsByCustomerId = {}

  for (const sale of sales) {
    // Arredondamos para 2 casas decimais aqui: sem isso, subtrações com
    // números decimais podem gerar pequenas imprecisões (ex: 14.999999999999998
    // em vez de 15), o que atrapalharia o campo "valor máximo" do formulário
    // de pagamento mais abaixo.
    const balance = Math.round(calculateSaleBalance(sale) * 100) / 100
    const customerId = sale.customer_id

    if (!groupsByCustomerId[customerId]) {
      groupsByCustomerId[customerId] = {
        customerId,
        customerName: sale.customers?.name ?? "Cliente removido",
        customerPhone: sale.customers?.phone ?? "",
        totalOwed: 0,
        sales: [],
      }
    }

    groupsByCustomerId[customerId].totalOwed += balance
    groupsByCustomerId[customerId].sales.push({ ...sale, balance })
  }

  // Object.values transforma o objeto (agrupado por id) numa lista simples,
  // que é o formato que a função de renderizar a tabela espera receber.
  const groups = Object.values(groupsByCustomerId)

  // Arredonda o total também, pelo mesmo motivo de precisão decimal —
  // somar vários valores já arredondados ainda pode gerar erros pequenos.
  for (const group of groups) {
    group.totalOwed = Math.round(group.totalOwed * 100) / 100
  }

  return groups
}

// ---- Enviar o resumo do débito por WhatsApp ----

// Largura de cada coluna da "tabela" da mensagem (em caracteres) — usado
// com padEnd/padStart para montar o alinhamento manualmente.
const CREDIT_MESSAGE_COLUMNS = {
  date: 11,
  total: 10,
  balance: 12,
}

// Monta o texto da mensagem num formato parecido com um extrato: data da
// venda, valor total dela e quanto ainda falta receber (pode ser menor
// que o total, se já houve um pagamento parcial), uma linha por venda, e
// o total geral no final.
//
// O trecho entre crase tripla (```) é o que faz o WhatsApp exibir esse
// pedaço da mensagem em fonte monoespaçada (toda letra com a mesma
// largura) — sem isso, as colunas não ficariam alinhadas de verdade na
// tela, porque a fonte normal do WhatsApp é proporcional.
function buildCreditMessage(customerGroup) {
  const {
    date: colDate,
    total: colTotal,
    balance: colBalance,
  } = CREDIT_MESSAGE_COLUMNS

  const header =
    "Data".padEnd(colDate) +
    "Total".padStart(colTotal) +
    "A receber".padStart(colBalance)
  const separador = "-".repeat(colDate + colTotal + colBalance)

  const linhasVendas = customerGroup.sales
    .map((sale) => {
      const dataFormatada = formatDate(sale.sale_date)
      const totalFormatado = formatCurrency(sale.total_amount)
      const saldoFormatado = formatCurrency(sale.balance)

      return (
        dataFormatada.padEnd(colDate) +
        totalFormatado.padStart(colTotal) +
        saldoFormatado.padStart(colBalance)
      )
    })
    .join("\n")

  const linhaTotal =
    "Total:".padEnd(colDate + colTotal) +
    formatCurrency(customerGroup.totalOwed).padStart(colBalance)

  const tabela = [
    "```",
    header,
    separador,
    linhasVendas,
    separador,
    linhaTotal,
    "```",
  ].join("\n")

  return (
    `Olá, ${customerGroup.customerName}! Aqui está um resumo do que está em aberto:\n\n` +
    `${tabela}\n\n` +
    `Qualquer dúvida, é só chamar!`
  )
}

function handleSendWhatsApp(customerGroup) {
  // Sem telefone cadastrado não tem como montar o link — avisamos em vez
  // de abrir um WhatsApp "quebrado" sem destinatário nenhum.
  if (!customerGroup.customerPhone) {
    showFormMessage(
      `${customerGroup.customerName} não tem telefone cadastrado — não é possível enviar pelo WhatsApp.`,
      "error",
    )
    return
  }

  const message = buildCreditMessage(customerGroup)
  const url = buildWhatsAppUrl(customerGroup.customerPhone, message)

  // Abre em nova aba — o WhatsApp Web ou o app já carrega com a mensagem
  // pronta, mas quem envia de fato é o usuário, conferindo antes.
  window.open(url, "_blank")
}

// ---- Carregar e desenhar a lista de clientes com pendência ----

async function loadCreditData() {
  const { data: sales, error } = await listOpenCreditSales()

  if (error) {
    console.error(error)
    showFormMessage("Não foi possível carregar as vendas em aberto.", "error")
    return
  }

  allCustomerGroups = groupSalesByCustomer(sales)
  renderCreditTable()
}

// ---- Filtro de busca (por nome do cliente) ----

function getFilteredCustomerGroups() {
  const rawTerm = searchInput.value.trim()

  if (rawTerm === "") {
    return allCustomerGroups
  }

  const term = normalizeText(rawTerm)

  return allCustomerGroups.filter((group) =>
    normalizeText(group.customerName).includes(term),
  )
}

// A cada letra digitada, desenhamos a tabela de novo já filtrada
searchInput.addEventListener("input", renderCreditTable)

function renderCreditTable() {
  tableBodyEl.innerHTML = ""

  // Estado vazio 1: nenhum cliente com pendência (nem a busca importa aqui)
  if (allCustomerGroups.length === 0) {
    const emptyRow = document.createElement("tr")
    emptyRow.innerHTML = `
      <td colspan="3" class="emptyState">
        Nenhum cliente com pendência no momento. 🎉
      </td>
    `
    tableBodyEl.appendChild(emptyRow)
    return
  }

  const customerGroups = getFilteredCustomerGroups()

  // Estado vazio 2: existem pendências, mas nenhuma combina com a busca
  if (customerGroups.length === 0) {
    const emptyRow = document.createElement("tr")
    emptyRow.innerHTML = `
      <td colspan="3" class="emptyState">
        Nenhum cliente encontrado para essa busca.
      </td>
    `
    tableBodyEl.appendChild(emptyRow)
    return
  }

  // Ordena do que mais deve para o que menos deve — geralmente é a
  // informação mais útil de bater o olho primeiro.
  customerGroups.sort((a, b) => b.totalOwed - a.totalOwed)

  for (const group of customerGroups) {
    const row = document.createElement("tr")

    row.innerHTML = `
      <td>${group.customerName}</td>
      <td class="creditTotalOwed">${formatCurrency(group.totalOwed)}</td>
      <td>
        <button type="button" class="rowActionButton" data-action="whatsapp">
          ${actionButtonContent(iconMessage, "WhatsApp")}
        </button>
        <button type="button" class="rowActionButton" data-action="toggle">
          ${actionButtonContent(iconEye, "Ver detalhes")}
        </button>
      </td>
    `

    row
      .querySelector('[data-action="whatsapp"]')
      .addEventListener("click", () => {
        handleSendWhatsApp(group)
      })

    row
      .querySelector('[data-action="toggle"]')
      .addEventListener("click", () => {
        toggleCustomerDetails(group, row)
      })

    tableBodyEl.appendChild(row)
  }
}

// ---- Expandir/recolher os detalhes de um cliente: vendas em aberto (só
// para consulta) + um único formulário de pagamento para o total devido ----

function toggleCustomerDetails(customerGroup, customerRow) {
  const proximaLinha = customerRow.nextElementSibling
  if (proximaLinha && proximaLinha.classList.contains("creditDetailsRow")) {
    proximaLinha.remove()
    return
  }

  closeAnyOpenCustomerDetails()

  const detailsRow = document.createElement("tr")
  detailsRow.className = "creditDetailsRow"

  // Lista as vendas em aberto do cliente — só para o usuário ter contexto
  // de origem da dívida. Não tem ação individual aqui: o pagamento é
  // sempre registrado de uma vez só, para o total do cliente.
  const salesHtml = customerGroup.sales
    .map((sale) => {
      const statusInfo = paymentStatusLabels[sale.payment_status]
      return `
        <li class="creditSaleItem">
          <div class="creditSaleInfo">
            <span class="creditSaleDate">
              ${formatDate(sale.sale_date)} — Total ${formatCurrency(sale.total_amount)}
              <span class="badge ${statusInfo.badgeClass}">${statusInfo.text}</span>
            </span>
            <span class="creditSaleBalance">Saldo: ${formatCurrency(sale.balance)}</span>
          </div>
        </li>
      `
    })
    .join("")

  detailsRow.innerHTML = `
    <td colspan="3">
      <div class="creditDetailsContent">
        <h3>Vendas em aberto de ${customerGroup.customerName}</h3>
        <ul>${salesHtml}</ul>

        <h3>Registrar pagamento</h3>
        <form class="paymentForm">
          <label for="paymentAmount-${customerGroup.customerId}">Valor recebido</label>
          <input
            type="number"
            id="paymentAmount-${customerGroup.customerId}"
            step="0.01"
            min="0.01"
            max="${customerGroup.totalOwed}"
            required
          />

          <label for="paymentMethod-${customerGroup.customerId}">Forma de pagamento</label>
          <select id="paymentMethod-${customerGroup.customerId}" required>
            <option value="cash">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="card">Cartão</option>
          </select>

          <label for="paymentNotes-${customerGroup.customerId}">Observação</label>
          <input type="text" id="paymentNotes-${customerGroup.customerId}" placeholder="Opcional" />

          <button type="submit" class="confirmPaymentButton">Confirmar pagamento</button>
        </form>
      </div>
    </td>
  `

  customerRow.after(detailsRow)

  const paymentFormEl = detailsRow.querySelector(".paymentForm")
  const amountInput = paymentFormEl.querySelector('input[type="number"]')
  const methodSelect = paymentFormEl.querySelector("select")
  const notesInput = paymentFormEl.querySelector('input[type="text"]')

  paymentFormEl.addEventListener("submit", async (event) => {
    event.preventDefault()

    const amount = Number(amountInput.value)
    const paymentMethod = methodSelect.value
    const notes = notesInput.value.trim() || null

    const { data: resultado, error } = await payCustomerCredit(
      customerGroup.customerId,
      amount,
      paymentMethod,
      notes,
    )

    if (error) {
      console.error(error)
      showFormMessage("Não foi possível registrar o pagamento.", "error")
      return
    }

    // Caso raro: o valor pago foi maior que a dívida total do cliente.
    // Avisamos, em vez de simplesmente "perder" essa sobra silenciosamente.
    if (resultado.valorNaoAlocado > 0) {
      showFormMessage(
        `Pagamento registrado, mas R$ ${resultado.valorNaoAlocado.toFixed(2)} não foi ` +
          `alocado, pois é maior que a dívida total do cliente.`,
        "error",
      )
    } else {
      showFormMessage("Pagamento registrado com sucesso.", "success")
    }

    // Recarrega tudo do zero — isso já atualiza os totais e remove
    // vendas/clientes da lista automaticamente se ficarem totalmente quitados.
    loadCreditData()
  })
}

function closeAnyOpenCustomerDetails() {
  const existingRow = tableBodyEl.querySelector(".creditDetailsRow")
  if (existingRow) {
    existingRow.remove()
  }
}

// ---- Carrega a lista assim que a página abre ----
loadCreditData()
