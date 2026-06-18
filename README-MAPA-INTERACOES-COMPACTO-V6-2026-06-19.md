# Trago Delivery — Mapa realtime avançado + UI compacta V6

## O que foi alterado

### Painel Admin
- O mapa em tempo real agora tem controlos flutuantes dentro do próprio mapa:
  - **Trilhos**: mostra/oculta o rasto dos motoristas.
  - **Lista**: mostra/oculta o painel lateral da equipa para ganhar espaço.
  - **Mini**: reduz ainda mais a altura do mapa para facilitar o scroll.
- Foi adicionado um card inferior no mapa com foco operacional do motorista seleccionado.
- Popups dos motoristas agora mostram estado, última actualização, tempo decorrido, precisão GPS e coordenadas.
- A lista de motoristas mostra estado + hora + idade da última actualização.
- Trilhos receberam animação subtil.
- O mapa deixou de ocupar quase o ecrã inteiro no mobile; a altura foi reduzida e limitada.
- A barra inferior mobile do admin foi compactada para reduzir aperto e cortes.

### Painel do Motorista
- O mapa interno recebeu uma faixa de orientação com o próximo passo:
  - seguir para recolha;
  - seguir para entrega;
  - aviso quando está muito perto do ponto.
- Foram adicionados novos botões no mapa:
  - **Trilho**: limpa o rasto percorrido;
  - **Mini**: alterna o mapa para modo ainda mais curto.
- O mapa ficou mais baixo por padrão para permitir scroll confortável.
- A navegação inferior, botões, textos, HUD e cartões foram refinados para ficarem mais compactos.
- Foi ajustado o carregamento do Leaflet em mapa curto para evitar atraso por altura mínima excessiva.

## Ficheiros alterados
- `index.html`
- `painel-de-entrega.html`
- `js/admin/adminMap.js`
- `js/driver/driverMap.js`
- `admin-mobile-shell.css`
- `driver.css`

## Validação feita
- `node --check js/admin/adminMap.js`
- `node --check js/driver/driverMap.js`
- `node --check js/driver/driver.js`
- `node --check js/admin/admin.js`

Nenhuma alteração foi feita ao backend, modelos, rotas ou base de dados.
