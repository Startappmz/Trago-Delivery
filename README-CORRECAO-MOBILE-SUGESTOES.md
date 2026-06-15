# Correção — Sugestões de endereço no mobile

Esta versão corrige a lista de sugestões dos campos **Ponto de Recolha** e **Ponto de Entrega** no dashboard admin em modo mobile.

## Problema corrigido

Em alguns dispositivos móveis, a lista de sugestões não aparecia porque era renderizada dentro do próprio campo/formulário e podia ficar escondida por `overflow`, `z-index`, cards, modais ou containers responsivos.

## Solução aplicada

- A lista de sugestões agora é renderizada directamente no `body` da página.
- No desktop, a lista aparece alinhada ao campo activo.
- No mobile, a lista abre como um painel inferior compacto, acima de todos os cards.
- Foi adicionado `z-index` alto e bloqueio temporário de scroll enquanto a lista mobile está aberta.
- O clique/toque numa sugestão funciona com `pointerdown`, evitando falhas comuns em browsers móveis.
- O botão `×` fecha a lista no mobile.

## Ficheiros alterados

```txt
js/common/geoPricing.js
dashboard.css
trago-system.css
```

## Teste recomendado

1. Abrir o dashboard admin no telemóvel ou no DevTools em modo mobile.
2. Ir para criação de pedido.
3. Escrever 3 ou mais letras em **Ponto de Recolha**.
4. Confirmar se a lista aparece como painel inferior.
5. Seleccionar uma sugestão.
6. Repetir em **Ponto de Entrega**.
7. Confirmar se distância/taxa/total são calculados depois de seleccionar os dois pontos.
