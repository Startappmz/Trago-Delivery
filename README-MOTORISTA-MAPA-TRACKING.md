# Trago Delivery — Painel do Motorista com Mapa Interno e Tracking Corrigido

## O que foi aplicado

1. **Mapa interno no painel do motorista**
   - O motorista já não precisa sair do painel para ver a rota.
   - O mapa mostra:
     - ponto de recolha;
     - ponto de entrega;
     - rota calculada pela Edge Function;
     - posição actual do motorista.
   - O mapa usa Leaflet + OpenStreetMap no front-end.
   - A rota real é pedida ao backend em `/api/geo/route`, que usa `TRAGO_ORS_API_KEY` no Supabase.

2. **Fluxo correcto de localização**
   - A localização deixa de iniciar de forma duplicada.
   - O motorista só fica online depois da primeira coordenada GPS válida.
   - Se a permissão de localização for negada, o motorista permanece offline.
   - O botão “Reativar Partilha de Localização” volta a abrir o fluxo de permissão.

3. **Logout corrigido**
   - Antes de limpar o token, o front-end chama a função de offline.
   - Também chama `/api/auth/logout`.
   - `pagehide` e `beforeunload` tentam marcar offline com `keepalive`.
   - O admin recebe `driver_disconnected_broadcast` e remove o marcador do mapa.

4. **Endpoint novo**

```txt
POST /api/geo/route
```

Payload:

```json
{
  "origin": { "lat": -25.96, "lng": 32.57 },
  "destination": { "lat": -25.92, "lng": 32.49 }
}
```

Resposta:

```json
{
  "geometry": { "type": "LineString", "coordinates": [[32.57, -25.96], [32.49, -25.92]] },
  "distance_km": 11.6,
  "duration_min": 18,
  "delivery_fee": 200,
  "source": "openrouteservice"
}
```

## O que actualizar no Supabase

1. Substituir a função:

```txt
supabase/functions/api/index.ts
```

2. Confirmar que a secret existe:

```env
TRAGO_ORS_API_KEY=SUA_CHAVE_OPENROUTESERVICE
```

3. Confirmar que a função `api` está com:

```txt
Verify JWT = OFF
```

4. Clicar em:

```txt
Deploy updates
```

## Ficheiros alterados

```txt
painel-de-entrega.html
js/driver/driverMap.js
js/driver/driverTracking.js
js/driver/driver.js
js/common/auth.js
js/common/supabaseRealtime.js
driver.css
supabase/functions/api/index.ts
backend/utils/geoPricing.js
backend/routes/geoRoutes.js
```
