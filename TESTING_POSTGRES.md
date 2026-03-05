# PostgreSQL Integration Testing

Arkorm includes real PostgreSQL integration tests in [tests/postgres.spec.ts](tests/postgres.spec.ts).

## 1) Set database URL

Use a PostgreSQL database dedicated for tests:

```bash
export DATABASE_URL="postgresql://<user>:<password>@localhost:5432/arkorm_test?schema=public"
```

## 2) Generate Prisma client

```bash
pnpm prisma:generate
```

## 3) Apply migrations

```bash
pnpm prisma migrate dev --name init-postgres-test-schema
```

Or for already-created migrations:

```bash
pnpm db:migrate:test
```

## 4) Run PostgreSQL tests

```bash
pnpm test:postgres
```
