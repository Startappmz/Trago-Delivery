# Correção Edge Supabase · Rotas e dados operacionais

Esta correção resolve os problemas vistos no painel real quando o front-end usa `SUPABASE_URL/functions/v1/api`:

1. `POST /api/orders/:id/payment-preview` agora existe na Edge Function.
2. `GET/POST/PUT/DELETE /api/vehicles` agora existe na Edge Function.
3. Dados de orientação da recolha agora são gravados e devolvidos ao painel do motorista:
   - `pickup_contact_name`
   - `pickup_contact_phone`
   - `pickup_notes`
4. Clientes pós-pago agora guardam e devolvem:
   - `billing_type`
   - `credit_limit`
   - `credit_balance`
   - `credit_used`
5. Ao criar pedido para cliente pós-pago, o método passa automaticamente para `postpaid_credit` e o crédito é consumido.
6. Finalização da entrega agora valida o valor recebido antes de marcar como pago.
7. Motoristas oficiais continuam sem comissão financeira.
8. Custos podem ser associados a veículos/matrículas.

## Publicação obrigatória

Depois de subir estes ficheiros, publicar novamente a Edge Function:

```bash
supabase functions deploy api
```

Confirmar também que a migração SQL já foi executada no Supabase SQL Editor:

```sql
backend/supabase/2026_06_trago_delivery_improvements.sql
```

Sem redeploy da Edge Function, o front-end continuará a receber `Rota não encontrada` mesmo que o código do backend Express esteja correto.
