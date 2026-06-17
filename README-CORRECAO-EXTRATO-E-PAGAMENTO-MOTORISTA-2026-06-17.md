# Correção — Extrato do motorista e confirmação manual de pagamento

## Corrigido

1. O bloco **Extrato de Entregas Concluídas** agora tem um filtro próprio e visível:
   - Hoje;
   - Esta Semana;
   - Este Mês.

2. O filtro do topo e o filtro do extrato ficam sincronizados para evitar resultados diferentes na mesma página.

3. Motoristas oficiais podem ver o histórico de entregas concluídas, mas continuam sem acesso aos valores de comissão.

4. O fluxo de finalização voltou a exigir a confirmação manual do valor recebido quando o método de pagamento exige cobrança no acto:
   - dinheiro;
   - M-Pesa;
   - e-Mola;
   - mKesh;
   - transferência bancária;
   - POS.

5. Apenas clientes pós-pago/crédito mensal finalizam sem introdução manual de valor no acto.

## Ficheiros principais alterados

- `painel-de-entrega.html`
- `js/driver/driver.js`
- `trago-system.css`
- `backend/controllers/driverController.js`
- `supabase/functions/api/index.ts`

## Publicação necessária

Não há SQL novo.

Como a Edge Function foi corrigida, publicar novamente:

```bash
supabase functions deploy api
```
