# FLACSO Zoom Salas (Next.js + Prisma)

Sistema web para gestión institucional de solicitudes Zoom, cobertura de asistencia, asignaciones y base económica.

## Estado actual

- UI principal en SPA (`/`)
- Capa PWA básica (manifest + service worker)
- Autenticación con Auth.js (`next-auth@beta`)
- Backend inicial `api/v1` orientado al nuevo dominio
- Base relacional con entidades operativas y económicas

## Roles

- `ADMINISTRADOR` (usuario maestro, puede actuar como todos)
- `CONTADURIA`
- `DOCENTE`
- `ASISTENTE_ZOOM` (operación de asistencia)
- Alias legacy: `SOPORTE_ZOOM` se normaliza automáticamente a `ASISTENTE_ZOOM`

## Reglas centrales implementadas

- Las solicitudes intentan provisionarse automáticamente.
- Una solicitud usa la misma cuenta Zoom asignada.
- Se prioriza un único ID de reunión por solicitud.
- Si no se logra ID único, pasa a `PENDIENTE_RESOLUCION_MANUAL_ID` y se notifica a administración.
- Tarifas por modalidad de reunión (`HIBRIDA`, `VIRTUAL`).

## Endpoints v1 disponibles

- `GET /api/v1/auth/me`
- `GET /api/v1/dashboard`
- `GET/POST /api/v1/solicitudes-sala`
- `GET /api/v1/provision-manual/pendientes`
- `POST /api/v1/provision-manual/:solicitudId/resolver`
- `GET /api/v1/agenda-soporte/abierta`
- `POST /api/v1/eventos-zoom/:eventoId/intereses`
- `POST /api/v1/eventos-zoom/:eventoId/asignaciones`
- `GET/POST /api/v1/tarifas-asistencia`

## Stack

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- Auth.js + credenciales
- PWA básica (service worker manual)

## Setup local

1. Instalar dependencias:

```bash
nvm install
nvm use
npm install
```

2. Configurar entorno en `.env`.

3. Sincronizar esquema y cliente Prisma:

```bash
npm run db:generate
npm run db:push
```

4. Ejecutar:

```bash
npm run dev
```

## Documentación funcional y técnica

- [docs/fase-6-estructura-repositorio.md](docs/fase-6-estructura-repositorio.md)
- [docs/fase-7-plan-implementacion.md](docs/fase-7-plan-implementacion.md)
