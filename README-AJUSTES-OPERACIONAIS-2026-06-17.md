# Trago Delivery — Ajustes operacionais 2026-06-17

Alterações aplicadas nesta versão:

1. **Categorias de custos substituídas** por:
   - Manutenção
   - Combustível
   - Empréstimo
   - Crédito
   - Taxa Trans/Levant
   - Consumíveis
   - Despesas aplicativo
   - Diversos

2. **Página Motoristas** agora inclui controlo e visualização de veículos registados:
   - matrícula;
   - tipo;
   - estado;
   - marca/modelo;
   - apagar veículo.

3. **Ícone de tema substituído por notificações** no painel admin:
   - novos pedidos pendentes;
   - pagamentos pendentes de confirmação;
   - entregas finalizadas;
   - notificações só saem da lista quando marcadas como lidas.

4. **Mapa em tempo real** passou a usar pontos em vez de imagens de veículos:
   - verde: motorista livre;
   - laranja: motorista ocupado/em recolha/em entrega;
   - vermelho: offline/última posição conhecida.

5. **Botões + Novo Motorista e + Novo Cliente corrigidos**:
   - agora abrem automaticamente a página Cargos e mostram o formulário certo.

## Migração Supabase obrigatória

Depois de publicar o front-end/backend, execute no Supabase SQL Editor:

```sql
backend/supabase/2026_06_trago_delivery_cost_categories_vehicle_notifications.sql
```

Esta migração actualiza as restrições de categorias de custos e normaliza categorias antigas para a nova estrutura.

- Correção mobile do painel de notificações: agora o pop-up fica fixo no viewport, respeita margens laterais, safe-area e ajusta itens/botões em ecrãs pequenos.
