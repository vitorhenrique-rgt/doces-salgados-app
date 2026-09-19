// js/components/nav.js
//
// Desenha o menu de navegação no topo de toda página do sistema. Cada
// página HTML só precisa ter uma <div id="mainNav"></div> e importar este
// arquivo — assim, se um dia adicionarmos uma tela nova (ex: relatórios,
// na Fase 3), mudamos a lista de links só aqui, em vez de editar o HTML
// de cada uma das páginas existentes.

const links = [
  { href: 'index.html', label: 'Início' },
  { href: 'customers.html', label: 'Clientes' },
  { href: 'products.html', label: 'Produtos' },
  { href: 'sales.html', label: 'Vendas' },
  { href: 'credit.html', label: 'A receber' },
];

function renderNav() {
  const navContainerEl = document.getElementById('mainNav');

  // Segurança: se alguma página esquecer de incluir a <div id="mainNav">,
  // isso não deve quebrar o resto da página — só não desenha o menu.
  if (!navContainerEl) return;

  // Descobre em qual página estamos, olhando o final do endereço atual
  // (ex: ".../products.html" -> "products.html") — usamos isso para
  // destacar visualmente o link da tela em que o usuário já está.
  const currentPage = window.location.pathname.split('/').pop();

  const linksHtml = links
    .map((link) => {
      const isActive = link.href === currentPage;
      const activeClass = isActive ? ' navLink--active' : '';
      return `<a href="${link.href}" class="navLink${activeClass}">${link.label}</a>`;
    })
    .join('');

  // Em telas pequenas, os links ficam escondidos dentro de um menu que só
  // abre ao tocar no botão hamburguer (ver CSS: .navLinks fica "hidden"
  // por padrão no mobile, e "flex" quando o botão adiciona a classe
  // .navLinks--open). Em telas maiores, o CSS já mostra os links direto,
  // então o botão hamburguer nem aparece.
  navContainerEl.innerHTML = `
    <nav class="mainNav">
      <button type="button" class="navToggle" aria-label="Abrir menu" aria-expanded="false" aria-controls="navLinks">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>
      <div class="navLinks" id="navLinks">${linksHtml}</div>
    </nav>
  `;

  const toggleButton = navContainerEl.querySelector('.navToggle');
  const navLinksEl = navContainerEl.querySelector('.navLinks');

  function closeMenu() {
    navLinksEl.classList.remove('navLinks--open');
    toggleButton.setAttribute('aria-expanded', 'false');
  }

  toggleButton.addEventListener('click', () => {
    const isOpen = navLinksEl.classList.toggle('navLinks--open');
    toggleButton.setAttribute('aria-expanded', String(isOpen));
  });

  // Fecha o menu se o usuário tocar fora dele (mesmo comportamento que o
  // modal de confirmação já usa, para manter consistência)
  document.addEventListener('click', (event) => {
    const menuAberto = navLinksEl.classList.contains('navLinks--open');
    const cliqueDentroDoMenu = navLinksEl.contains(event.target) || toggleButton.contains(event.target);

    if (menuAberto && !cliqueDentroDoMenu) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navLinksEl.classList.contains('navLinks--open')) {
      closeMenu();
      toggleButton.focus();
    }
  });
}

renderNav();
