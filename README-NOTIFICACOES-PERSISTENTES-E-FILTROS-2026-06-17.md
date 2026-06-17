# Trago Delivery — Notificações Persistentes + Filtros de Histórico

## O que foi corrigido

1. As notificações do admin deixaram de depender do `localStorage` do navegador.
2. Foi criada a tabela `system_notifications` no Supabase.
3. As notificações agora persistem entre dispositivos até serem marcadas como lidas.
4. Cada notificação relevante mostra:
   - Código do pedido (`#xxxxxx`);
   - Código de verificação, quando existir;
   - Valor/mensagem operacional.
5. O botão “Marcar como lida” grava a leitura no banco de dados.
6. O botão “Marcar todas como lidas” também actualiza o banco de dados.
7. O “Extrato de Entregas Concluídas” no painel do motorista agora filtra por:
   - Hoje;
   - Esta Semana;
   - Este Mês.
8. O “Histórico de Encomendas” no painel admin também filtra por:
   - Hoje;
   - Esta Semana;
   - Este Mês.

## SQL obrigatório

Executar no Supabase SQL Editor:

```sql
backend/supabase/2026_06_trago_delivery_persistent_notifications_history_filters.sql
```

## Deploy obrigatório

Como a Edge Function foi alterada, publicar novamente:

```bash
supabase functions deploy api
```

## Ficheiros principais alterados

- `supabase/functions/api/index.ts`
- `js/admin/admin.js`
- `js/admin/adminApi.js`
- `js/driver/driver.js`
- `index.html`
- `painel-de-entrega.html`
- `trago-system.css`
- `backend/supabase/2026_06_trago_delivery_persistent_notifications_history_filters.sql`
- `backend/controllers/notificationController.js`
- `backend/routes/notificationRoutes.js`
- `backend/models/SystemNotification.js`
- `backend/utils/notifications.js`

## Validação feita

- `node -c` nos ficheiros JS do front-end.
- `node -c` nos ficheiros JS do backend.
- Parse/bundle da Edge Function com `esbuild`, mantendo imports remotos como externos.
