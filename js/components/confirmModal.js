// js/components/confirmModal.js
//
// Modal de confirmação estilizado — substitui o confirm() nativo do
// navegador (que é feio e não segue a identidade visual do projeto).
//
// Como usar (repare no "await" — é assim que esperamos a resposta do
// usuário antes de continuar, parecido com esperar uma resposta do banco):
//
//   const confirmou = await showConfirmModal({
//     message: 'Excluir este cliente?',
//     confirmLabel: 'Excluir',
//     danger: true, // deixa o botão de confirmar em vermelho, para ações destrutivas
//   });
//   if (!confirmou) return;
//
// A função devolve uma "Promise" (uma promessa de valor futuro) que só é
// resolvida quando o usuário clica em Confirmar, Cancelar, aperta Esc, ou
// clica fora da caixa — por isso o código que chama precisa usar "await".

export function showConfirmModal({
  title = 'Confirmar ação',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modalOverlay';

    const dialog = document.createElement('div');
    dialog.className = 'modalDialog';
    // Esses atributos "aria-*" ajudam leitores de tela a entenderem que
    // isso é uma caixa de diálogo que interrompe o fluxo normal da página.
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');

    dialog.innerHTML = `
      <h2 class="modalTitle">${title}</h2>
      <p class="modalMessage">${message}</p>
      <div class="modalActions">
        <button type="button" class="modalCancelButton">${cancelLabel}</button>
        <button type="button" class="modalConfirmButton${danger ? ' modalConfirmButton--danger' : ''}">${confirmLabel}</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
      resolve(result);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') close(false);
    }

    document.addEventListener('keydown', onKeyDown);

    // Clicar no fundo escurecido (fora da caixa) cancela — comportamento
    // esperado de qualquer modal
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });

    dialog.querySelector('.modalCancelButton').addEventListener('click', () => close(false));
    dialog.querySelector('.modalConfirmButton').addEventListener('click', () => close(true));

    // Em ações destrutivas (danger), o foco inicial vai para "Cancelar" —
    // assim, se o usuário apertar Enter sem querer, não corre o risco de
    // confirmar uma exclusão sem querer.
    const focusTarget = danger
      ? dialog.querySelector('.modalCancelButton')
      : dialog.querySelector('.modalConfirmButton');
    focusTarget.focus();
  });
}
