// js/supabaseClient.js
//
// Este é o ÚNICO arquivo do projeto que deve importar a biblioteca do Supabase
// e criar a conexão com o banco. Todos os outros arquivos (services, páginas)
// importam o "supabase" daqui, em vez de criar a própria conexão.
//
// As credenciais (URL e chave) NÃO ficam mais escritas aqui — elas vêm de
// js/config.js, que:
// - Localmente: você cria na mão (veja js/config.example.js), com as
//   credenciais do banco de DEV. Esse arquivo nunca vai para o Git.
// - Na Vercel: é gerado automaticamente pelo generate-config.js durante o
//   deploy, usando as Environment Variables configuradas no painel da
//   Vercel (Production -> banco de produção, Preview -> banco de dev).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// "anon key" é segura para usar aqui porque o acesso ao banco é controlado
// pelas regras de RLS (Row Level Security) que já configuramos no Supabase.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

