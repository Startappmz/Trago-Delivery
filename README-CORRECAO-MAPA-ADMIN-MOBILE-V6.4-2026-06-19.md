# Trago Delivery · Correção V6.4 — Mapa Admin Mobile

## Pedido corrigido
O ajuste do "Mapa em Tempo Real" deveria afectar apenas o modo mobile, não o desktop.

## Alteração aplicada
- `admin-mobile-shell.css`
  - Removido o override global que afectava também desktop.
  - Adicionado override apenas em `@media (max-width: 820px)`.
  - No mobile, o `#live-map-container` do admin passa a espelhar o mapa do motorista:
    - normal: `clamp(156px, 27dvh, 198px)`
    - mini: `clamp(126px, 21dvh, 158px)`
    - ecrãs até 380px: `146px`
  - Também foi corrigido o `min-height` do card do mapa no mobile para evitar que o shell continue grande por causa de regras antigas.

## O que fica intacto
- Desktop do admin.
- Lógica do mapa realtime.
- JS do admin e do motorista.
- Tamanho do mapa do motorista.
