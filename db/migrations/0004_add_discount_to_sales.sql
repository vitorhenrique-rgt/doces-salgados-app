-- Migration: 0004_add_discount_to_sales
-- O que faz: adiciona a coluna de desconto (em R$, não percentual) na
-- tabela sales. Usada principalmente para arredondar o valor cobrado do
-- cliente (ex: trocar R$ 10,50 por R$ 10,00), mas serve para qualquer
-- desconto fixo combinado na hora da venda.
--
-- Importante: sales.total_amount passa a representar o valor FINAL da
-- venda, já com o desconto aplicado (subtotal dos itens - discount_amount).
-- É esse total_amount que todo o resto do sistema (saldo devedor, tela
-- "A Receber", extrato de WhatsApp, etc.) já usa — nenhuma dessas partes
-- precisa mudar por causa desta coluna nova.

alter table sales
  add column discount_amount numeric(10,2) not null default 0;
