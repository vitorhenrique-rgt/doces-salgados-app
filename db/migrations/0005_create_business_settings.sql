-- Migration: 0005_create_business_settings
-- O que faz: cria a tabela de configurações do negócio — uma tabela com
-- UMA linha só, guardando dados que antes não existiam no projeto:
-- chave Pix, nome do recebedor e cidade. Necessários para gerar a
-- cobrança Pix copia-e-cola na tela "A Receber".
--
-- Por que uma tabela em vez de um arquivo de configuração (config.js):
-- diferente das credenciais do Supabase (que são por ambiente, editadas
-- só por quem mexe em código), isso é um dado de NEGÓCIO que o usuário
-- deve poder editar direto pela tela, sem precisar de deploy.

create table business_settings (
  id uuid primary key default gen_random_uuid(),
  pix_key text,
  receiver_name text,
  receiver_city text,
  updated_at timestamptz default now()
);

-- Mesma política temporária "liberar tudo para a chave anon" das outras
-- tabelas (ver skill doces-salgados-modelo-de-dados, seção Segurança).
alter table business_settings enable row level security;

create policy "allow all for anon - business_settings" on business_settings
  for all using (true) with check (true);
