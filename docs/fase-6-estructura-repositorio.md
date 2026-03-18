# Fase 6 - Estructura del Repositorio

## Objetivo
Organizar el proyecto para separar dominio, API, UI y soporte operacional.

## Estructura propuesta

- app/
  - api/v1/
    - auth/
    - dashboard/
    - solicitudes-sala/
    - eventos-zoom/
    - agenda-soporte/
    - provision-manual/
    - tarifas-asistencia/
  - page.tsx
  - layout.tsx
  - manifest.ts
- components/
  - pwa-register.tsx
- prisma/
  - schema.prisma
- src/
  - lib/
    - db.ts
    - env.ts
    - api-auth.ts
  - modules/
    - salas/
      - service.ts
- public/
  - sw.js
  - icon.svg
- docs/
  - fase-6-estructura-repositorio.md
  - fase-7-plan-implementacion.md

## Criterios de separación

- app/api/v1: capa HTTP (controladores)
- src/modules: lógica de negocio y casos de uso
- prisma: modelo de datos y migraciones
- components: UI reutilizable
- docs: decisiones de arquitectura y plan
