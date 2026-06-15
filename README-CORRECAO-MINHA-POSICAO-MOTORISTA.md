# Correção — marcador da posição do motorista

Esta versão corrige o comportamento do botão **Minha posição** no painel do motorista.

## O que foi corrigido

- O mapa agora mostra um marcador visual claro para a localização actual do motorista.
- O marcador usa um ponto azul com pulso, independente dos ícones FontAwesome.
- Foi adicionada uma área de precisão do GPS ao redor do marcador.
- O botão **Minha posição** continua a centralizar o mapa, mas agora também garante que o marcador seja criado/actualizado.
- O mapa foi isolado em termos de `z-index` para não se sobrepor ao cabeçalho, botões ou cards operacionais.

## Ficheiros alterados

- `js/driver/driverMap.js`
- `driver.css`

## Supabase

Não é necessário executar SQL novo nem alterar Edge Functions para esta correção.
