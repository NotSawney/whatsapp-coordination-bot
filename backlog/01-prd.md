# PRD — Bot de préstamo de activos por WhatsApp

**Fecha:** 2026-10-06 · **Estado:** definido (pre-implementación)

## Qué es
Producto interno: empleados de una empresa coordinan el **préstamo de equipos/activos**
(notebooks, proyectores, herramientas) conversando en lenguaje natural por WhatsApp. Un LLM
interpreta la intención y ejecuta acciones sobre el sistema de activos de la empresa.

## Decisiones (decision log)
| # | Decisión | Valor |
|---|----------|-------|
| 1 | Objetivo | Producto real usable (pieza de portafolio) |
| 2 | Dominio | Préstamo interno de equipos/activos |
| 3 | Arquitectura | Monorepo, módulos por capa (dominio + canal), 1 deploy |
| 4 | Interacción | LLM lenguaje natural + tool-calling |
| 5 | Stack | TypeScript / Node, Vitest |
| 6 | Canal | Baileys (no oficial) detrás de interfaz `Channel` |
| 7 | LLM | OpenRouter / Nemotron free, detrás de interfaz `Agent` (SDK `openai` + `baseURL`) |
| 8 | Persistencia | SQLite (`better-sqlite3`), archivo |
| 9 | Identidad | Empleados + admin, seedeados; número desconocido = rechazado |
| 10 | Memoria conversación | En memoria, últimos N turnos (se pierde al reiniciar) |
| 11 | Modelo de préstamo | Unificado: todo es reserva `[inicio, fin)`. Check-out = reserva desde ahora; check-in = cierre anticipado; regla única de no-solapamiento por activo |
| 12 | Alcance MVP | Núcleo + admin completo, sin recordatorios |
| 13 | Tests | Dominio+tools duro (determinista, `pnpm test`) + evals del agente opt-in (`pnpm test:evals`) |

## Riesgos registrados
- **Baileys:** va contra los TOS de Meta; la sesión QR es frágil (se cae, re-escaneo). Aislado tras
  la interfaz `Channel` para no contaminar dominio ni tests.
- **Tool-calling en modelos free:** irregular. Mitigación: interfaz `Agent` swappable por config +
  parse defensivo/fallback cuando el modelo no emite un tool-call limpio. Verificar soporte de tools
  del modelo en el primer spike.

## Alcance MVP
**Empleado:** ver activos disponibles · reservar (inmediato o a futuro) con detección de choques ·
ver mis reservas · devolver (check-in).
**Admin:** alta de activo · forzar devolución · ver todas las reservas · dar de baja activo.
**Fuera de MVP:** recordatorios/notificaciones salientes (scheduler), auto-registro de usuarios.

## Historias (con criterios de aceptación)
- **H1 — Ver disponibles:** empleado pregunta qué hay; el bot lista activos sin reserva activa en la
  ventana pedida. *AC:* no muestra activos dados de baja ni ocupados en esa franja.
- **H2 — Reservar:** empleado pide un activo para un rango; se crea la reserva. *AC:* rechaza si se
  solapa con otra reserva del mismo activo; rechaza rango inválido (fin ≤ inicio).
- **H3 — Mis reservas:** empleado consulta lo suyo. *AC:* solo ve sus propias reservas activas/futuras.
- **H4 — Devolver:** empleado cierra su préstamo antes de fin. *AC:* la reserva queda cerrada; el
  activo vuelve a estar disponible desde ese momento.
- **H5 — Admin alta/baja:** admin crea o da de baja un activo. *AC:* solo admin; baja no borra
  historial.
- **H6 — Admin forzar devolución / ver todo:** admin cierra la reserva de otro y ve todas. *AC:*
  empleado común no puede; queda registro de quién forzó.
- **H7 — Identidad:** número desconocido es rechazado con mensaje claro. *AC:* ninguna acción de
  dominio se ejecuta para un no-empleado.
