// js/pages/testCustomerService.js
//
// Este arquivo é TEMPORÁRIO — serve só para confirmar que a conexão com o
// Supabase está funcionando e que cada função do customerService se comporta
// como esperado. Depois que confirmarmos, podemos apagar (ou manter guardado,
// já que é um jeito rápido de testar de novo no futuro se algo quebrar).

import {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../services/customerService.js';

// Elemento da página onde vamos escrever um resumo visual do teste
const outputEl = document.getElementById('output');

// Função auxiliar só para não repetir "console.log" + escrever na tela toda hora
function log(mensagem, dado) {
  console.log(mensagem, dado);
  outputEl.textContent += `\n${mensagem}\n${JSON.stringify(dado, null, 2)}\n`;
}

// async/await: cada "await" pausa a execução até aquela operação no banco
// terminar, antes de seguir pra próxima linha. Isso evita "correr" pra frente
// sem saber se o passo anterior deu certo.
async function runTests() {
  // 1. Listar clientes (deve vir vazio na primeira vez que rodarmos)
  const listaInicial = await listCustomers();
  log('1. Lista inicial de clientes:', listaInicial);

  // 2. Criar um cliente de teste
  const novoCliente = await createCustomer({
    name: 'Cliente Teste',
    phone: '11999999999',
    address: 'Rua Exemplo, 123',
  });
  log('2. Cliente criado:', novoCliente);

  // Se der erro na criação, não faz sentido continuar os próximos testes
  if (novoCliente.error) {
    log('Parando testes: erro ao criar cliente.', novoCliente.error);
    return;
  }

  const idCriado = novoCliente.data[0].id;

  // 3. Buscar esse cliente específico pelo id
  const clienteBuscado = await getCustomerById(idCriado);
  log('3. Cliente buscado por id:', clienteBuscado);

  // 4. Atualizar o telefone desse cliente
  const clienteAtualizado = await updateCustomer(idCriado, {
    phone: '11888888888',
  });
  log('4. Cliente atualizado:', clienteAtualizado);

  // 5. Listar de novo, para confirmar que o cliente aparece na lista
  const listaComCliente = await listCustomers();
  log('5. Lista de clientes (deve conter o cliente de teste):', listaComCliente);

  // 6. Apagar o cliente de teste, para não deixar "lixo" no banco
  const resultadoExclusao = await deleteCustomer(idCriado);
  log('6. Resultado da exclusão:', resultadoExclusao);

  // 7. Listar mais uma vez, para confirmar que o cliente sumiu
  const listaFinal = await listCustomers();
  log('7. Lista final (deve estar sem o cliente de teste):', listaFinal);

  log('Testes concluídos!', {});
}

runTests();
