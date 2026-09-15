// js/pages/credit.js
//
// Orquestra a tela de controle de fiado: busca todas as vendas em aberto
// (status "credit" ou "partial"), agrupa por cliente para mostrar quem
// deve e quanto deve, e permite registrar UM pagamento por cliente — que é
// distribuído automaticamente entre as vendas em aberto dele, da mais
// antiga para a mais nova (ver payCustomerCredit no saleService).

import {
  listOpenCreditSales,
  calculateSaleBalance,
  payCustomerCredit,
} from '../services/saleService.js';
import { formatCurrency } from '../utils/formatCurrency.js';

const tableBodyEl = document.getElementById('creditTableBody');
const formMessageEl = document.getElementById('formMessage');

function showFormMessage(text, type) {
  formMessageEl.textContent = text;
  formMessageEl.className = type;
}

function formatDate(isoDate) {
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
}

const paymentStatusLabels = {
  partial: { text: 'Parcial', badgeClass: 'badge--partial' },
  credit: { text: 'Fiado', badgeClass: 'badge--credit' },
};

// ---- Agrupar as vendas em aberto por cliente ----
//
// listOpenCreditSales() devolve uma lista "achatada" de vendas — aqui
// juntamos essas vendas por cliente, somando o saldo devedor de cada uma,
// para responder a pergunta "quanto cada cliente deve no total".
function groupSalesByCustomer(sales) {
  const groupsByCustomerId = {};

  for (const sale of sales) {
    // Arredondamos para 2 casas decimais aqui: sem isso, subtrações com
    // números decimais podem gerar pequenas imprecisões (ex: 14.999999999999998
    // em vez de 15), o que atrapalharia o campo "valor máximo" do formulário
    // de pagamento mais abaixo.
    const balance = Math.round(calculateSaleBalance(sale) * 100) / 100;
    const customerId = sale.customer_id;

    if (!groupsByCustomerId[customerId]) {
      groupsByCustomerId[customerId] = {
        customerId,
        customerName: sale.customers?.name ?? 'Cliente removido',
        totalOwed: 0,
        sales: [],
      };
    }

    groupsByCustomerId[customerId].totalOwed += balance;
    groupsByCustomerId[customerId].sales.push({ ...sale, balance });
  }

  // Object.values transforma o objeto (agrupado por id) numa lista simples,
  // que é o formato que a função de renderizar a tabela espera receber.
  const groups = Object.values(groupsByCustomerId);

  // Arredonda o total também, pelo mesmo motivo de precisão decimal —
  // somar vários valores já arredondados ainda pode gerar erros pequenos.
  for (const group of groups) {
    group.totalOwed = Math.round(group.totalOwed * 100) / 100;
  }

  return groups;
}

// ---- Carregar e desenhar a lista de clientes com pendência ----

async function loadCreditData() {
  const { data: sales, error } = await listOpenCreditSales();

  if (error) {
    console.error(error);
    showFormMessage('Não foi possível carregar as vendas em aberto.', 'error');
    return;
  }

  const customerGroups = groupSalesByCustomer(sales);
  renderCreditTable(customerGroups);
}

function renderCreditTable(customerGroups) {
  tableBodyEl.innerHTML = '';

  if (customerGroups.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="3" class="emptyState">
        Nenhum cliente com pendência no momento. 🎉
      </td>
    `;
    tableBodyEl.appendChild(emptyRow);
    return;
  }

  // Ordena do que mais deve para o que menos deve — geralmente é a
  // informação mais útil de bater o olho primeiro.
  customerGroups.sort((a, b) => b.totalOwed - a.totalOwed);

  for (const group of customerGroups) {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${group.customerName}</td>
      <td class="creditTotalOwed">${formatCurrency(group.totalOwed)}</td>
      <td><button type="button" class="rowActionButton" data-action="toggle">Ver detalhes</button></td>
    `;

    row.querySelector('[data-action="toggle"]').addEventListener('click', () => {
      toggleCustomerDetails(group, row);
    });

    tableBodyEl.appendChild(row);
  }
}

// ---- Expandir/recolher os detalhes de um cliente: vendas em aberto (só
// para consulta) + um único formulário de pagamento para o total devido ----

function toggleCustomerDetails(customerGroup, customerRow) {
  const proximaLinha = customerRow.nextElementSibling;
  if (proximaLinha && proximaLinha.classList.contains('creditDetailsRow')) {
    proximaLinha.remove();
    return;
  }

  closeAnyOpenCustomerDetails();

  const detailsRow = document.createElement('tr');
  detailsRow.className = 'creditDetailsRow';

  // Lista as vendas em aberto do cliente — só para o usuário ter contexto
  // de origem da dívida. Não tem ação individual aqui: o pagamento é
  // sempre registrado de uma vez só, para o total do cliente.
  const salesHtml = customerGroup.sales
    .map((sale) => {
      const statusInfo = paymentStatusLabels[sale.payment_status];
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
      `;
    })
    .join('');

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
  `;

  customerRow.after(detailsRow);

  const paymentFormEl = detailsRow.querySelector('.paymentForm');
  const amountInput = paymentFormEl.querySelector('input[type="number"]');
  const methodSelect = paymentFormEl.querySelector('select');
  const notesInput = paymentFormEl.querySelector('input[type="text"]');

  paymentFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();

    const amount = Number(amountInput.value);
    const paymentMethod = methodSelect.value;
    const notes = notesInput.value.trim() || null;

    const { data: resultado, error } = await payCustomerCredit(
      customerGroup.customerId,
      amount,
      paymentMethod,
      notes
    );

    if (error) {
      console.error(error);
      showFormMessage('Não foi possível registrar o pagamento.', 'error');
      return;
    }

    // Caso raro: o valor pago foi maior que a dívida total do cliente.
    // Avisamos, em vez de simplesmente "perder" essa sobra silenciosamente.
    if (resultado.valorNaoAlocado > 0) {
      showFormMessage(
        `Pagamento registrado, mas R$ ${resultado.valorNaoAlocado.toFixed(2)} não foi ` +
          `alocado, pois é maior que a dívida total do cliente.`,
        'error'
      );
    } else {
      showFormMessage('Pagamento registrado com sucesso.', 'success');
    }

    // Recarrega tudo do zero — isso já atualiza os totais e remove
    // vendas/clientes da lista automaticamente se ficarem totalmente quitados.
    loadCreditData();
  });
}

function closeAnyOpenCustomerDetails() {
  const existingRow = tableBodyEl.querySelector('.creditDetailsRow');
  if (existingRow) {
    existingRow.remove();
  }
}

// ---- Carrega a lista assim que a página abre ----
loadCreditData();
