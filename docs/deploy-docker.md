# Running on a plain Ubuntu server with Docker

> **بالعربي:** نفس الخطوات بالتفصيل في
> [`التشغيل-بالدوكر.md`](./التشغيل-بالدوكر.md).

The other two guides put this on cPanel. This one replaces all of it with a
server you control and one command.

```bash
curl -fsSL https://get.docker.com | sh
git clone -b <branch> <repo> /opt/fantazia && cd /opt/fantazia
cp .env.docker.example .env && nano .env      # four values
docker compose up -d --build
```

What that removes, compared to `deploy-subdomain.md`: installing Node, pnpm,
PM2 and PostgreSQL by hand; creating domains and running AutoSSL; four Apache
files in a userdata directory that WHM can silently regenerate over; `pm2
startup`; a media directory inside a document root; and the whole class of
mistakes where a path or a port is wrong and the failure is invisible.

The real difference is not the command count. It is that you stop repairing a
running server: the image builds completely or it fails, and a half-applied
configuration never exists.

## Requirements

- Ubuntu 22.04 or 24.04, **4 GB RAM minimum** (the build is the heavy part,
  not the running), 20 GB disk
- Ports 80 and 443 open
- Both hostnames already resolving to the server **before you start** — Let's
  Encrypt validates over port 80, and issuance fails if DNS has not propagated

## What the stack is

| Service | Does |
| --- | --- |
| `db` | PostgreSQL 16, no published port — reachable only from the other containers |
| `release` | Migrations, then seeds **only if the database is empty**, then tops up interface strings. Runs to completion before the apps start |
| `web` `admin` | The two Next apps, from one image so they cannot drift apart |
| `worker` | Retries and outbound email. Not optional — without it a paid booking whose confirmation failed is never retried and no email leaves the outbox |
| `caddy` | The only thing on a public port. Obtains and renews certificates unprompted, and serves `/media` off the shared volume so Node never sees an image request |
| `warmup` | Replaces the build-time placeholder HTML before the first visitor arrives |

## Three things that will bite otherwise

**Changing the domain needs a rebuild, not a restart.** `NEXT_PUBLIC_SITE_URL`
is inlined into the client bundle by `next build`. Editing `.env` alone does
not move it — run `docker compose up -d --build`.

**`docker compose down -v` deletes the database, the media and the
certificates.** Without `-v` it stops containers and keeps all three. Reissuing
certificates repeatedly will also get you rate-limited by Let's Encrypt.

**`ALLOW_TEST_PAYMENTS="yes"` is deliberate here and must not survive
launch.** The test provider's payment page always succeeds.

## Why the Dockerfile starts a PostgreSQL during the build

`next build` prerenders the ISR pages, and prerendering executes the page code,
which opens the database. There is none during an image build, so the build
stage starts a throwaway PostgreSQL, applies the migrations, builds, and stops
it. Nothing from it reaches the final image.

Migrations, not seeds. Every prerendered page carries `revalidate = 300`, so
the build-time HTML is only a first frame that the first request replaces —
seeding here would double the build time to bake in content that is discarded
immediately. The `warmup` service takes that first request so a visitor does
not.

## Backups

Two volumes hold everything that is not in git:

```bash
docker compose exec -T db pg_dump -U fantazia fantazia | gzip > backup-$(date +%F).sql.gz
docker run --rm -v fantazia_media:/m -v "$PWD":/out alpine \
  tar czf /out/media-$(date +%F).tar.gz -C /m .
```
