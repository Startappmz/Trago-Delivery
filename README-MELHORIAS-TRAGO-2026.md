# Trago Delivery — melhorias implementadas

Este pacote inclui a intervenção solicitada sobre o projecto mais actualizado.

## O que foi implementado

1. **Visão geral financeira por período**
   - A visão geral agora permite consultar receitas/ganhos por **dia**, **semana** e **mês**.
   - O endpoint `/api/stats/financials` aceita `?period=day|week|month`.

2. **Dados completos do ponto de recolha**
   - Pedido agora aceita responsável da recolha, contacto e notas/orientação.
   - Estes dados aparecem no painel do motorista em “Orientação da Recolha”.

3. **Novas categorias de serviço**
   - Comida de restaurante.
   - Mercadoria C/P.
   - Refeição Restaurante P.

4. **Novos métodos de pagamento**
   - Transferência bancária.
   - POS.
   - Cliente pós-pago/crédito para clientes com faturação mensal.

5. **Tipos de motorista**
   - Motorista freelancer: mantém comissão/ganhos.
   - Motorista oficial Trago: comissão bloqueada em 0 e painel de ganhos ocultado.

6. **Confirmação rigorosa de pagamento**
   - Depois do código de validação do cliente, o motorista recebe um popup com o valor total.
   - A entrega só finaliza se o motorista introduzir exactamente o valor apresentado.
   - Entregas com pagamento por confirmar geram alertas periódicos para motorista e admin.
   - Motorista pode adicionar comentários/detalhes da entrega.

7. **Clientes pós-pago com crédito mensal**
   - Cliente pode ser marcado como pós-pago.
   - Admin define crédito atribuído.
   - O crédito disponível reduz automaticamente quando pedidos são criados para esse cliente.
   - Extrato do cliente mostra crédito usado/disponível.

8. **Veículos e custos por matrícula**
   - Nova gestão de veículos por matrícula.
   - Motoristas podem ser vinculados a veículos registados.
   - Custos da empresa podem ser atribuídos a veículos/matrículas.

## Migração obrigatória no Supabase

Antes de publicar o novo backend/front-end, execute no Supabase SQL Editor:

```sql
backend/supabase/2026_06_trago_delivery_improvements.sql
```

Esse ficheiro cria/actualiza as tabelas e campos necessários: veículos, tipo de motorista, crédito de clientes, campos de recolha, confirmação de pagamento e custos por veículo.

## Validação feita

Foram executadas validações de sintaxe em todos os ficheiros JavaScript do backend e front-end com `node -c`.
Também foi verificado que `index.html` e `painel-de-entrega.html` não têm IDs HTML duplicados.

## Observação importante

Não foram executados testes end-to-end contra uma base Supabase real nesta sessão. Depois de aplicar a migração, faça um ciclo de teste real com:

1. Criar veículo.
2. Criar motorista freelancer e oficial.
3. Criar cliente pós-pago com crédito.
4. Criar pedido para esse cliente.
5. Atribuir motorista.
6. Finalizar entrega com confirmação de pagamento.
7. Confirmar actualização de receitas, custos, crédito e histórico.
