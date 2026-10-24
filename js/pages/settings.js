// js/pages/settings.js
//
// Orquestra a tela de Configurações — um formulário único (não tem
// "lista", já que só existe uma linha de configurações no banco). Ao
// abrir a página, carrega os dados já salvos (se existirem) e preenche o
// formulário; ao salvar, decide sozinho se cria ou atualiza (ver
// settingsService.js).

import {
  getBusinessSettings,
  saveBusinessSettings,
} from "../services/settingsService.js"

const formEl = document.getElementById("settingsForm")
const pixKeyInput = document.getElementById("pixKeyInput")
const receiverNameInput = document.getElementById("receiverNameInput")
const receiverCityInput = document.getElementById("receiverCityInput")
const formMessageEl = document.getElementById("formMessage")

function showFormMessage(text, type) {
  formMessageEl.textContent = text
  formMessageEl.className = type
}

function clearFormMessage() {
  formMessageEl.textContent = ""
  formMessageEl.className = ""
}

// ---- Carrega as configurações já salvas, se existirem ----

async function loadSettings() {
  const { data: settings, error } = await getBusinessSettings()

  if (error) {
    console.error(error)
    showFormMessage("Não foi possível carregar as configurações.", "error")
    return
  }

  // "settings" vem null se o usuário ainda nunca configurou nada — nesse
  // caso, o formulário só fica vazio, esperando o primeiro preenchimento.
  if (settings) {
    pixKeyInput.value = settings.pix_key ?? ""
    receiverNameInput.value = settings.receiver_name ?? ""
    receiverCityInput.value = settings.receiver_city ?? ""
  }
}

// ---- Salvar configurações ----

formEl.addEventListener("submit", async (event) => {
  event.preventDefault()

  const settingsData = {
    pix_key: pixKeyInput.value.trim(),
    receiver_name: receiverNameInput.value.trim(),
    receiver_city: receiverCityInput.value.trim(),
  }

  const { error } = await saveBusinessSettings(settingsData)

  if (error) {
    console.error(error)
    showFormMessage(
      "Não foi possível salvar as configurações. Tente novamente.",
      "error",
    )
    return
  }

  showFormMessage("Configurações salvas com sucesso.", "success")
})

clearFormMessage()
loadSettings()
