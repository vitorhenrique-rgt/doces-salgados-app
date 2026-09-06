// js/supabaseClient.js
//
// Este é o ÚNICO arquivo do projeto que deve importar a biblioteca do Supabase
// e criar a conexão com o banco. Todos os outros arquivos (services, páginas)
// importam o "supabase" daqui, em vez de criar a própria conexão.
//
// Por quê? Se um dia precisarmos trocar a URL, a chave, ou até de banco de dados,
// só mudamos em um lugar só.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wykzhfknvjmqonyfupkq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5a3poZmtudmptcW9ueWZ1cGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzkxNDEsImV4cCI6MjEwNDIxNTE0MX0.bBq9SDv7gTY3ssz0G25RAIAt9fRaaJ73LXoVzinEfkc';

// "anon key" é segura para usar aqui porque o acesso ao banco é controlado
// pelas regras de RLS (Row Level Security) que já configuramos no Supabase.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
