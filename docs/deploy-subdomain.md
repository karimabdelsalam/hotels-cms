# Running on a subdomain, beside the live site

For putting this on `demo.fantaziaresorts.com` (or `new.`, or `staging.`) on the
cPanel server that already serves the current site — **without touching it**.

This is not the launch guide. `deployment.md` covers taking over a main domain.
This covers standing the platform up next to what is already there, which is
what you want first: everything real to look at, nothing at risk.

Substitute throughout:

| | Example used here |
| --- | --- |
| cPanel account user | `fantazia` |
| public subdomain | `demo.fantaziaresorts.com` |
| admin subdomain | `demo-admin.fantaziaresorts.com` |

---

## What you are about to have

```
demo.fantaziaresorts.com          → the public site        (Node on 127.0.0.1:3100)
demo-admin.fantaziaresorts.com    → the admin portal       (Node on 127.0.0.1:3101)
                                    the worker             (no port; retries, emails)
fantaziaresorts.com               → untouched, still your live site
```

**Ports 3100 and 3101, not 3000 and 3001.** Whatever is on the box now may
already be using the usual ones, and a port clash presents as a working site
serving the wrong application — which takes an hour to work out. Pick a pair
nothing else has, and keep 3000/3001 free for the eventual production install so
the two can run side by side during cutover.

---

## 1. The subdomains

**cPanel → Domains → Create A Domain**, twice.

Create `demo.fantaziaresorts.com` and `demo-admin.fantaziaresorts.com` on the
**existing account**. cPanel offers a document root of
`/home/fantazia/demo.fantaziaresorts.com` — accept it. Do the same for the admin
one.

Do not tick "Share document root with the main domain."

Then **cPanel → SSL/TLS Status**, select both new subdomains, **Run AutoSSL**.
Wait for certificates before going further; the app sends HSTS, and a browser
that meets HSTS on a certificate error will refuse to load the site until the
header expires.

---

## 2. Where things live

```
/home/fantazia/demo-app                              the repository   ← NOT a document root
/home/fantazia/demo.fantaziaresorts.com/media        uploads          ← Apache serves these
/home/fantazia/demo-backups                          dumps
/var/log/fantazia-demo                               PM2 logs
```

**The repository must not be inside any document root.** Everything under a
document root is downloadable over HTTP, and this repository contains `.env` —
the database password, the session secret, and eventually the OPERA credentials.
Putting the app in the document root publishes all three.

Media inside the document root is the opposite case and is deliberate: Apache
already serves that directory, so images need no proxy rule and Node never sees
an image request.

```bash
mkdir -p /home/fantazia/demo-app /home/fantazia/demo-backups
mkdir -p /home/fantazia/demo.fantaziaresorts.com/media
mkdir -p /var/log/fantazia-demo
chown -R fantazia:fantazia /home/fantazia /var/log/fantazia-demo
```

Nothing in the media directory may execute — it is a directory the public can
write into through the upload form:

```apache
# /home/fantazia/demo.fantaziaresorts.com/media/.htaccess
Options -Indexes -ExecCGI
RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .cgi .pl
php_flag engine off
Header always set Cache-Control "public, max-age=31536000, immutable"
Header always set X-Content-Type-Options "nosniff"
```

---

## 3. Node, pnpm, PostgreSQL

As root. If the server already runs any of these for something else, check the
versions rather than reinstalling.

```bash
# Node 22 — AlmaLinux / CloudLinux
dnf module reset nodejs -y && dnf module enable nodejs:22 -y && dnf install -y nodejs
# Node 22 — Ubuntu
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

corepack enable && corepack prepare pnpm@10 --activate
npm install -g pm2
```

PostgreSQL 16, listening on localhost only:

```bash
# AlmaLinux / CloudLinux
dnf install -y postgresql16-server postgresql16-contrib
/usr/pgsql-16/bin/postgresql-16-setup initdb
systemctl enable --now postgresql-16
# Ubuntu
apt-get install -y postgresql-16
```

```bash
sudo -u postgres psql <<'SQL'
CREATE USER fantazia_demo WITH PASSWORD 'put-a-long-random-one-here';
CREATE DATABASE fantazia_demo OWNER fantazia_demo;
SQL
```

A separate database from any future production one. Sharing a database between
a demo people click around in and anything real is how test bookings end up in a
month-end report.

Confirm `listen_addresses = 'localhost'` in `postgresql.conf`. PostgreSQL must
not be reachable from outside the box.

---

## 4. The code

As the **`fantazia` user**, not root. Files owned by root under a cPanel home
directory will fight suexec.

```bash
su - fantazia
git clone -b claude/rotana-website-design-bs9ylt \
  https://github.com/karimabdelsalam/hotels-cms.git /home/fantazia/demo-app
cd /home/fantazia/demo-app
pnpm install --frozen-lockfile
```

---

## 5. `.env`

```bash
cp .env.example .env
chmod 600 .env      # not 644 — this is the file the whole layout exists to protect
nano .env
```

```bash
DATABASE_URL="postgresql://fantazia_demo:the-password@127.0.0.1:5432/fantazia_demo?schema=public&connection_limit=5"

# Not optional and not a placeholder. Generate it:  openssl rand -base64 48
AUTH_SECRET="…at least 32 characters…"

NEXT_PUBLIC_SITE_URL="https://demo.fantaziaresorts.com"

# ABSOLUTE. A relative path resolves against each app's own working directory,
# so the admin would write images the public site could not read. Production
# refuses to start on a relative value.
MEDIA_ROOT="/home/fantazia/demo.fantaziaresorts.com/media"

REVALIDATE_SECRET="openssl rand -hex 24"

# Test payments, explicitly allowed because this is a demo. NEVER on the real
# site: this is a payment page that always succeeds.
PAYMENT_PROVIDER="test"
PAYMENT_TEST_SECRET="openssl rand -hex 24"
ALLOW_TEST_PAYMENTS="yes"

# Optional on a demo. Leave blank and confirmation emails queue in the outbox
# and wait — nothing is lost, but nothing reaches an inbox either.
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="reservations@fantaziaresorts.com"
RESERVATIONS_EMAIL="reservations@fantaziaresorts.com"

# Only if you want the AI translation button to work.
ANTHROPIC_API_KEY=""
```

---

## 6. Database, then content

```bash
cd /home/fantazia/demo-app

pnpm --filter @fantazia/db exec prisma generate
pnpm --filter @fantazia/db exec prisma migrate deploy

pnpm db:seed                              # structure, roles, staff, UI strings
pnpm --filter @fantazia/db seed:booking   # rate plans, policies, 120 nights of inventory
pnpm --filter @fantazia/db seed:demo      # the demo copy, and 33 generated images
```

**The images are not in git and do not need to be.** `seed:demo` draws them on
the server — deterministically, so the same names always produce the same
pictures. It takes a few minutes: 33 images each become four widths in two
formats, which is roughly 260 encodes.

Everything it writes is flagged `isPlaceholder`, shown as such in the media
library, and removable in one command:

```bash
pnpm --filter @fantazia/db seed:demo -- --clear
```

---

## 7. Build and start

```bash
pnpm build
```

Then the process definitions. The committed `infra/ecosystem.config.cjs` uses
3000/3001; for a demo beside a live site, use a copy with your own ports:

```bash
cp infra/ecosystem.config.cjs infra/ecosystem.demo.cjs
```

In the copy, change the three `name:` values to `fantazia-demo-web`,
`fantazia-demo-admin`, `fantazia-demo-worker`, the two ports to 3100 and 3101,
and the log paths to `/var/log/fantazia-demo/`.

```bash
pm2 start infra/ecosystem.demo.cjs
pm2 save
pm2 status
```

```bash
# as root, once — replays the saved process list after a reboot
pm2 startup systemd -u fantazia --hp /home/fantazia
```

Three processes must show `online`. The worker is not optional: without it,
paid bookings stop being retried and confirmation emails are never sent.

```bash
curl -sI http://127.0.0.1:3100/api/health
curl -sI http://127.0.0.1:3101/api/health
pm2 logs fantazia-demo-worker --lines 20
```

---

## 8. Apache

`mod_proxy`, `mod_proxy_http`, `mod_headers` and `mod_rewrite` must be enabled —
**WHM → Software → EasyApache 4**. Most profiles include them.

**The proxy configuration goes in the userdata include directory, never in a
vhost.** WHM regenerates vhosts on any Apache rebuild and would discard a vhost
edit silently, usually at the worst moment.

```bash
# as root
D=/etc/apache2/conf.d/userdata
A=/home/fantazia/demo-app/infra/apache

for host in demo.fantaziaresorts.com demo-admin.fantaziaresorts.com; do
  mkdir -p $D/std/2_4/fantazia/$host $D/ssl/2_4/fantazia/$host
done

cp $A/fantazia.conf       $D/std/2_4/fantazia/demo.fantaziaresorts.com/
cp $A/fantazia.conf       $D/ssl/2_4/fantazia/demo.fantaziaresorts.com/
cp $A/fantazia-admin.conf $D/std/2_4/fantazia/demo-admin.fantaziaresorts.com/
cp $A/fantazia-admin.conf $D/ssl/2_4/fantazia/demo-admin.fantaziaresorts.com/
```

Then edit the four copies. Each ships with `<user>` placeholders and the default
ports:

- `<user>` → `fantazia`
- `/home/<user>/app/` → `/home/fantazia/demo-app/`
- `127.0.0.1:3000` → `127.0.0.1:3100` (public files)
- `127.0.0.1:3001` → `127.0.0.1:3101` (admin files)

```bash
/scripts/ensure_vhost_includes --all-users
apachectl configtest && systemctl restart httpd
```

Verify the include path against your cPanel version — **WHM → Apache
Configuration → Include Editor** shows where it expects them.

Those files exclude `/media` and `/_next/static` from the proxy with
`ProxyPass … !`, so Apache serves both from disk and Node never handles a static
request.

---

## 9. Check it

```bash
curl -sI https://demo.fantaziaresorts.com/en | head -3
curl -sI https://demo-admin.fantaziaresorts.com/login | head -3
```

Then in a browser, in this order — each answers a different question:

1. `https://demo.fantaziaresorts.com/en` — the site is up and images render
2. `https://demo.fantaziaresorts.com/ar` — Arabic, right-to-left
3. Search dates on the homepage → results → pick a room → checkout → **Pay**
   → you should land on a confirmation with a reference and a hotel number
4. `https://demo.fantaziaresorts.com/en/my-booking` — reference plus the email
   you entered finds it
5. `https://demo-admin.fantaziaresorts.com` — sign in as
   `admin@fantazia.test` / `fantazia-dev`, and the booking you just made is
   in **Bookings**

**Change that password immediately.** It is in the public repository. Staff →
your user → set a real one, and turn on two-step sign-in while you are there.

---

## 10. Keep it off Google

A demo indexed alongside the live site competes with it for the same searches
and splits the ranking. Until launch:

```apache
# /home/fantazia/demo.fantaziaresorts.com/.htaccess
Header always set X-Robots-Tag "noindex, nofollow"
```

`X-Robots-Tag` rather than robots.txt: robots.txt asks crawlers not to *fetch*,
which does not stop a URL appearing in results when something links to it. The
header tells them not to *index*, which does.

Password-protecting it in **cPanel → Directory Privacy** is stronger still, and
worth it if the demo is only for the team.

---

## 11. Pulling later changes

```bash
su - fantazia
cd /home/fantazia/demo-app
git pull
pnpm install --frozen-lockfile
pnpm --filter @fantazia/db exec prisma migrate deploy
pnpm --filter @fantazia/db sync:strings
pnpm build
pm2 reload infra/ecosystem.demo.cjs --update-env
```

`infra/deploy.sh` does exactly this with health checks and a rollback; point it
at the demo ecosystem file when you want it hands-off.

---

## When this becomes the real site

Not a migration of this install — a second one. Keep this one running while you
build the production install beside it on 3000/3001 with its own database and
its own account, then switch DNS. Two working systems for a day is cheap; one
half-migrated system is not.

**And before that day**: the current site at `fantaziaresorts.com` has URLs that
Google has indexed and other sites link to. The new site's addresses are shaped
differently — every path gains `/en` or `/ar`. Without redirects from the old
URLs to the new ones, every one of those links becomes a 404 and the search
ranking goes with them. That work is not built yet, and it needs a list of the
old site's URLs to start.
