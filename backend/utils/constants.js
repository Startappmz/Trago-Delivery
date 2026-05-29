// backend/utils/constants.js

const ADMIN_ROOM = 'admin_room';

const DRIVER_STATUS = Object.freeze({
  ONLINE_FREE: 'online_livre',
  ONLINE_BUSY: 'online_ocupado',
  PICKUP: 'em_recolha',        // novo: em processo de recolha
  DELIVERY: 'em_entrega',      // novo: em processo de entrega
  OFFLINE: 'offline'
});

const ORDER_STATUS = Object.freeze({
  PENDING: 'pendente',
  ASSIGNED: 'atribuido',

  // legado / genérico (podes continuar a usar onde quiseres algo geral)
  IN_PROGRESS: 'em_progresso',

  // novos estados detalhados para controlo de fluxo
  PICKUP_IN_PROGRESS: 'recolha_em_progresso',     // motorista saiu da central para recolher
  PICKUP_DONE: 'recolha_concluida',              // chegou ao cliente e recolheu

  DELIVERY_IN_PROGRESS: 'entrega_em_progresso',  // a caminho do ponto de entrega

  COMPLETED: 'concluido',
  CANCELED: 'cancelado'
});

const FINANCIAL = Object.freeze({
  DEFAULT_COMMISSION_RATE: 20
});

module.exports = {
  ADMIN_ROOM,
  DRIVER_STATUS,
  ORDER_STATUS,
  FINANCIAL
};
