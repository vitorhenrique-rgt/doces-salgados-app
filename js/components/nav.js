// js/components/nav.js
//
// Desenha o menu de navegação no topo de toda página do sistema. Cada
// página HTML só precisa ter uma <div id="mainNav"></div> e importar este
// arquivo — assim, se um dia adicionarmos uma tela nova (ex: relatórios,
// na Fase 3), mudamos a lista de links só aqui, em vez de editar o HTML
// de cada uma das páginas existentes.

const links = [
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

  navContainerEl.innerHTML = `<nav class="mainNav">${linksHtml}</nav>`;
}

renderNav();
