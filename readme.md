# backguard

Live server for IoT device control.

## requirements

- Node.js 20+
- npm

## installation

```sh
# clone repository
$ git clone https://github.com/yusshu/backguard

# change directory
$ cd backguard

# install dependencies
$ npm install

# copy environment file (and edit it as needed)
$ cp .env.example .env

# generate Prisma client
$ npm run prisma:generate

# run database migration
$ npm run prisma:migrate
```

## running

```sh
# start server in development mode
$ npm run dev

# type-check
$ npm run typecheck

# build & run production
$ npm run build
$ npm start
```

## database

This migration now uses **Prisma** (`prisma/schema.prisma`) with SQLite by default via `DATABASE_URL`.
