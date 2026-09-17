-- Seed: dev_sample_data
-- ATENÇÃO: este arquivo é só para o banco de DESENVOLVIMENTO.
-- NUNCA rodar isso no banco de produção — são dados fictícios só para
-- facilitar testes manuais (clientes e produtos de exemplo).
--
-- Diferença para uma "migration": uma migration muda a ESTRUTURA do banco
-- (tabelas, colunas) e deve ser igual em dev e produção. Um "seed" só
-- insere DADOS de exemplo, e cada ambiente pode ter (ou não) seus próprios.

insert into customers (name, phone, address) values
  ('Maria Souza', '11988887777', 'Rua das Flores, 123'),
  ('João Pereira', '11977776666', 'Av. Brasil, 456'),
  ('Ana Lima', '11966665555', 'Rua Sete de Setembro, 789'),
  ('Carlos Santos', '11955554444', ''),
  ('Fernanda Costa', '11944443333', 'Rua das Palmeiras, 321');

insert into products (name, sale_price, category, stock_quantity) values
  ('Bolo de Pote Chocolate', 16.50, 'Bolo de pote', 20),
  ('Bolo de Pote Ninho com Morango', 18.00, 'Bolo de pote', 15),
  ('Coxinha de Frango', 6.00, 'Salgado', 40),
  ('Risole de Camarão', 7.50, 'Salgado', 25),
  ('Brigadeiro Gourmet', 3.50, 'Doce', 50),
  ('Torta de Limão (fatia)', 12.00, 'Doce', 10),
  ('Empada de Frango', 6.50, 'Salgado', 30),
  ('Pão de Queijo (unidade)', 4.00, 'Salgado', 60);
