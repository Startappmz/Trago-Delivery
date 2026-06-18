# Trago Driver — Compact UI

Intervenção aplicada ao painel de motorista para deixar a interface mais compacta e mais parecida com aplicativo móvel.

## Ficheiros alterados

- `painel-de-entrega.html`
- `driver.css`
- `js/driver/driver.js`

## O que mudou

- Activado modo compacto com `body.driver-compact-ui`.
- Header mais baixo e logotipo menor.
- Bottom navigation mais baixa e mais leve.
- Títulos, textos, chips, botões e ícones reduzidos.
- Cards de entregas, ganhos, configurações e detalhe mais densos.
- Mapa e blocos operacionais com menos altura no mobile.
- Textos de interface encurtados sem alterar dados vindos da API.
- Mantidos IDs, endpoints e fluxo JavaScript existentes.

## Validação

- `node -c js/driver/driver.js`
- `node -c js/driver/driverTracking.js`
- `node -c js/driver/driverMap.js`
- verificação simples de IDs duplicados em `painel-de-entrega.html`
