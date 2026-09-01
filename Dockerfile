# One image, three processes.
#
# The web app, the admin portal and the background worker all run from this
# same image with different commands. They share a build, so there is no way
# for them to drift apart, and one `docker compose build` covers all three.
#
# Debian rather than Alpine on purpose: sharp and @node-rs/argon2 are native
# modules that ship prebuilt binaries for glibc. On musl they get compiled from
# source, which needs a toolchain in the image and turns a two minute build
# into a twenty minute one.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app


# ---------------------------------------------------------------- dependencies
# Only the manifests are copied here, so this layer is rebuilt when a
# dependency changes and reused when only source changes. That is the
# difference between a thirty second rebuild and a five minute one.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json          apps/web/
COPY apps/admin/package.json        apps/admin/
COPY apps/worker/package.json       apps/worker/
COPY packages/db/package.json       packages/db/
COPY packages/media/package.json    packages/media/
COPY packages/booking/package.json  packages/booking/
COPY tests/package.json             tests/
RUN pnpm install --frozen-lockfile


# ---------------------------------------------------------------------- build
# `next build` prerenders the ISR pages, and prerendering runs the page code,
# which opens the database. There is no database during an image build, so this
# stage starts a throwaway one, applies the migrations to it, and stops it
# again. Nothing from it reaches the final image — the point is only to give
# Prisma a real schema to talk to.
#
# Migrations, not seeds: the prerendered HTML is only a first frame. Every one
# of those pages carries `revalidate = 300`, so the first request regenerates
# it from the real database. Seeding here would double the build time to bake
# in content that gets replaced on the first hit.
FROM deps AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql postgresql-client \
 && rm -rf /var/lib/apt/lists/*

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle by `next build`, not
# read at run time. Changing the domain therefore means rebuilding the image —
# setting it in .env alone will not move it.
ARG NEXT_PUBLIC_SITE_URL="http://localhost"
ARG NEXT_PUBLIC_MEDIA_URL_BASE=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_MEDIA_URL_BASE=$NEXT_PUBLIC_MEDIA_URL_BASE

RUN pnpm --filter @fantazia/db exec prisma generate

RUN set -eux; \
    pg_ctlcluster "$(ls /etc/postgresql)" main start; \
    su postgres -c "psql -qc \"CREATE USER build WITH PASSWORD 'build' SUPERUSER\""; \
    su postgres -c "createdb -O build build"; \
    export DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public&connection_limit=5"; \
    pnpm --filter @fantazia/db exec prisma migrate deploy; \
    pnpm build; \
    pg_ctlcluster "$(ls /etc/postgresql)" main stop


# -------------------------------------------------------------------- runtime
# Dev dependencies stay: the worker runs TypeScript through tsx, and the
# release step runs the Prisma CLI. Pruning them saves a few hundred megabytes
# and breaks both.
FROM base AS runtime
ENV NODE_ENV=production
ENV MEDIA_ROOT=/media

# --chown on the copy itself, not a chown afterwards: a later `chown -R` over
# a two gigabyte tree rewrites every file into a second layer, doubling the
# image.
COPY --from=build --chown=node:node /app /app
COPY --from=build --chown=node:node /app/infra/docker/*.sh /usr/local/bin/

# Created here, owned by node, so the named volume Docker mounts over it
# inherits that ownership. Otherwise the volume arrives root-owned and the
# first upload fails with EACCES.
#
# Next writes regenerated ISR pages into .next/cache, so that has to be
# writable by the same user too — it is, by the copy above.
RUN mkdir -p /media && chown node:node /media

USER node
EXPOSE 3000 3001
CMD ["pnpm", "--filter", "@fantazia/web", "start"]
