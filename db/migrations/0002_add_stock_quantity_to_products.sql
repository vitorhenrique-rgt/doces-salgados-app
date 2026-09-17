-- Migration: 0002_add_stock_quantity_to_products
-- O que faz: adiciona a coluna de estoque de unidades prontas em products,
-- que tinha sido esquecida na migration 0001. Necessária para as
-- funcionalidades de reposição/abate de estoque (productService.js).

alter table products
  add column stock_quantity integer not null default 0;
