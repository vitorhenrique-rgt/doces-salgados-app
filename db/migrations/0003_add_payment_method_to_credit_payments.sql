-- Migration: 0003_add_payment_method_to_credit_payments
-- O que faz: adiciona a coluna de forma de pagamento (dinheiro/pix/cartão)
-- em credit_payments. Necessária para a tela "A Receber" registrar como
-- cada pagamento de fiado foi recebido.

alter table credit_payments
  add column payment_method text; -- 'cash' | 'pix' | 'card'
