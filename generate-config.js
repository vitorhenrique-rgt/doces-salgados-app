// generate-config.js
//
// Este script roda automaticamente na Vercel, como "Build Command", ANTES
// do site ir ao ar — não precisa ser rodado localmente. Ele lê as
// Environment Variables configuradas no painel da Vercel (Settings >
// Environment Variables) e gera o arquivo js/config.js com os valores
// certos:
// - Deploy de Production (branch main) -> usa as variáveis marcadas como
//   "Production" -> aponta para o banco de PRODUÇÃO.
// - Deploy de Preview (qualquer outra branch/PR) -> usa as variáveis
//   marcadas como "Preview" -> aponta para o banco de DEV, assim toda
//   branch é testada contra dados de teste antes do merge na main.
//
// Localmente, este script não roda: você cria seu próprio js/config.js na
// mão (veja js/config.example.js).

const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Erro: SUPABASE_URL e SUPABASE_ANON_KEY precisam estar configuradas ' +
      'nas Environment Variables do projeto na Vercel.'
  );
  process.exit(1);
}

const conteudoDoArquivo = `// js/config.js
//
// ATENÇÃO: este arquivo foi GERADO AUTOMATICAMENTE pelo generate-config.js
// durante o deploy na Vercel, a partir das Environment Variables
// configuradas no painel. Não edite este arquivo na mão em produção — a
// próxima build sobrescreve qualquer edição manual.

export const SUPABASE_URL = '${supabaseUrl}';
export const SUPABASE_ANON_KEY = '${supabaseAnonKey}';
`;

fs.writeFileSync('js/config.js', conteudoDoArquivo);
console.log('js/config.js gerado com sucesso a partir das Environment Variables da Vercel.');
