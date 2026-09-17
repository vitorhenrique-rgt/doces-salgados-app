-- Migration: 0001_create_initial_schema
-- O que faz: cria as 5 tabelas do MVP (Fase 1) e habilita RLS com uma
-- policy temporária de "liberar tudo para a chave anon" (aceitável só
-- para teste fechado com poucas pessoas — ver skill 02-modelo-de-dados).
--
-- Nota: este arquivo reconstrói o schema inicial já aplicado manualmente
-- no banco de dev, para servir como linha de base do histórico a partir
-- de agora. Novas mudanças de schema devem SEMPRE virar um novo arquivo
-- nesta pasta antes de serem rodadas no SQL Editor do Supabase.

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sale_price numeric(10,2) not null,
  category text,
  active boolean default true,
  created_at timestamptz default now()
  -- stock_quantity é adicionado na migration 0002 (foi esquecido aqui
  -- originalmente — ver 0002_add_stock_quantity_to_products.sql)
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  sale_date date not null default current_date,
  total_amount numeric(10,2) not null,
  payment_method text, -- 'cash' | 'pix' | 'card' | 'credit'
  payment_status text not null default 'paid', -- 'paid' | 'credit' | 'partial'
  created_at timestamptz default now()
);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete cascade,
  product_id uuid references products(id),
  quantity numeric(10,2) not null,
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null
);

create table credit_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete cascade,
  amount_paid numeric(10,2) not null,
  payment_date date not null default current_date,
  notes text
  -- payment_method é adicionado na migration 0003
);

-- Habilitar Row Level Security (RLS) em todas as tabelas
alter table customers enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table credit_payments enable row level security;

-- Policies temporárias: liberar tudo para a chave anon
-- (ok para teste fechado com poucas pessoas; revisar quando o projeto
-- crescer e precisar de Supabase Auth multiusuário)
create policy "allow all for anon - customers" on customers
  for all using (true) with check (true);

create policy "allow all for anon - products" on products
  for all using (true) with check (true);

create policy "allow all for anon - sales" on sales
  for all using (true) with check (true);

create policy "allow all for anon - sale_items" on sale_items
  for all using (true) with check (true);

create policy "allow all for anon - credit_payments" on credit_payments
  for all using (true) with check (true);
