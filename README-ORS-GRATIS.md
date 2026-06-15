# Trago Delivery — OpenRouteService gratuito

Esta versão remove a dependência de Google Maps para o cálculo de distância.

## O que usa agora

- Sugestões de endereço no front-end: OpenStreetMap/Nominatim.
- Cálculo de distância por estrada no backend/Edge Function: OpenRouteService Directions.
- Fallback: se a ORS falhar ou a chave não estiver configurada, o sistema usa estimativa local por coordenadas.

## Secret obrigatória no Supabase

No Supabase Dashboard:

Edge Functions → Secrets

Adicionar:

```env
TRAGO_ORS_API_KEY=SUA_CHAVE_GRATUITA_OPENROUTESERVICE
```

Não é necessário configurar:

```env
TRAGO_GOOGLE_MAPS_API_KEY
```

## Depois de adicionar a secret

1. Abrir Edge Functions → api → Code.
2. Substituir o conteúdo pelo ficheiro `supabase/functions/api/index.ts` desta versão.
3. Confirmar em Settings que `Verify JWT` está OFF.
4. Clicar em `Deploy updates`.
5. Testar a criação de pedido no Admin.

## SQL necessário

Executar no SQL Editor:

```txt
backend/supabase/distance_pricing.sql
```

## Política de preço

- 200 MZN até 11,6 km.
- +15 MZN por cada km excedente.
- Total do pedido = preço do serviço + taxa por distância.

## Observação técnica

OpenRouteService não tem perfil dedicado a motorizadas/ciclomotores como `TWO_WHEELER` do Google. Nesta versão, a rota usa o perfil `driving-car` como proxy rodoviário gratuito para MVP. Quando houver verba para Google Maps ou servidor próprio OSRM/GraphHopper, pode-se trocar a engine de rota sem alterar o fluxo do Admin.
