# Trago Delivery — Mapa em Tempo Real + Interações

Alterações aplicadas sem mexer no backend, endpoints, autenticação ou base de dados.

## Painel Admin

- Novo shell do mapa em tempo real com toolbar compacta.
- Botões: Actualizar, Ver todos, Maputo e Seguir motorista focado.
- Estatísticas rápidas do mapa: todos, livres, ocupados e inactivos.
- Filtros por estado dos motoristas.
- Lista lateral/mobile de motoristas rastreados.
- Toque num motorista para focar no mapa e abrir popup.
- Marcadores com pulso visual por estado.
- Movimento suave do marcador entre coordenadas.
- Trilho visual recente por motorista.
- Detecção visual de motorista inactivo por localização antiga.
- Estado de sincronização no canto do mapa.

## Painel Motorista

- HUD sobre o mapa com distância até recolha, entrega e precisão GPS.
- Botão “Seguir” para manter o mapa centrado na posição do motorista.
- Movimento suave do marcador do motorista.
- Trilho recente da posição do motorista.
- Animação da linha da rota.
- Microinterações nos botões, cards e bottom navigation.

## Ficheiros alterados

- `index.html`
- `painel-de-entrega.html`
- `admin-mobile-shell.css`
- `driver.css`
- `js/admin/adminMap.js`
- `js/driver/driverMap.js`

## Validação feita

- JavaScript validado com `node -c` em `js/admin`, `js/driver` e `js/common`.
- IDs duplicados verificados em `index.html` e `painel-de-entrega.html`.
