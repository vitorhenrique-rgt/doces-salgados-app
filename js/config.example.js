// js/config.example.js
//
// Modelo de configuração local. Copie este arquivo para "js/config.js"
// (sem o ".example") e preencha com as credenciais do seu banco de
// DESENVOLVIMENTO no Supabase (Project Settings > API > Project URL /
// chave "anon" ou "Publishable key").
//
// js/config.js NUNCA deve ser commitado no Git — ele já está listado no
// .gitignore. Em produção (Vercel), esse arquivo é gerado automaticamente
// pelo generate-config.js a partir das Environment Variables configuradas
// no painel (ver skill de deploy/produção).

export const SUPABASE_URL = 'https://seu-projeto-dev.supabase.co';
export const SUPABASE_ANON_KEY = 'sua-chave-anon-de-dev-aqui';
