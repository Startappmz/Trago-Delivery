# Correção — pagamento obrigatório no painel do motorista

Correção aplicada após validação do fluxo de finalização da entrega.

## Problema
O fluxo podia permitir a finalização sem forçar, de forma fiável, que o motorista digitasse manualmente o valor recebido.

## Correção aplicada

### Front-end — `js/driver/driver.js`
- O campo de valor recebido agora abre sempre vazio para pagamentos imediatos.
- O campo recebe `data-user-typed="false"` ao abrir o popup.
- Só passa para `true` quando existe evento real de digitação no campo.
- A colagem de valor foi bloqueada.
- O botão de finalizar valida:
  1. se o motorista digitou manualmente;
  2. se o valor é numérico;
  3. se o valor digitado é exactamente igual ao total apresentado.
- Se qualquer regra falhar, a entrega não é finalizada.

### HTML — `painel-de-entrega.html`
- O input de pagamento deixou de ser `number` e passou a ser `text` com `inputmode="decimal"`, para evitar preenchimentos/normalizações automáticas do browser.
- O script `driver.js` recebeu cache-buster para evitar execução de versão antiga em dispositivos já usados.

### Backend Express — `backend/controllers/orderController.js`
- O backend agora rejeita explicitamente `payment_amount_confirmed` vazio, ausente ou inválido.

### Supabase Edge Function — `supabase/functions/api/index.ts`
- A Edge Function agora rejeita explicitamente `payment_amount_confirmed` vazio, ausente ou inválido.

## Excepção mantida
Clientes com pagamento `postpaid_credit` continuam sem cobrança no acto, por regra de negócio de pós-pago.
