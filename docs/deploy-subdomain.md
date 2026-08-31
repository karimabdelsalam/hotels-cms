# Running on a subdomain, beside the live site

Written for **`ihotel.planova.com.eg`**, which is where this is going first.
Substitute your own hostnames if that changes; nothing below depends on the
names themselves.

This is not the launch guide. `deployment.md` covers taking over a main domain.
This covers standing the platform up next to what is already there, which is
what you want first: everything real to look at, nothing at risk.

| | Used throughout |
| --- | --- |
| cPanel account user | `planova` — **check yours**, it is whatever owns `planova.com.eg` |
| public site | `ihotel.planova.com.eg` |
| admin portal | `ihotel-admin.planova.com.eg` |
| instance name | `ihotel` — names the PM2 processes and the log directory |

The cPanel user is the one thing here you must confirm rather than copy. `whoami`
inside a cPanel terminal, or WHM → **List Accounts**, tells you.

---

## What you are about to have

```
ihotel.planova.com.eg         →  the public site      Node on 127.0.0.1:3100
ihotel-admin.planova.com.eg   →  the admin portal     Node on 127.0.0.1:3101
                                 the worker           no port — retries, emails

planova.com.eg                →  untouched
fantaziaresorts.com           →  untouched, still your live site
```

**Ports 3100 and 3101, not 3000 and 3001.** Whatever is on the box now may
already be using the usual ones, and a port clash presents as a working site
serving the wrong application — which takes an hour to work out. Pick a pair
nothing else has, and keep 3000/3001 free for the eventual production install so
the two can run side by side during cutover.

---

## 1. The subdomains

**cPanel → Domains → Create A Domain**, twice.

Create `ihotel.planova.com.eg` and `ihotel-admin.planova.com.eg` on the
**existing account**. cPanel offers a document root of
`/home/planova/ihotel.planova.com.eg` — accept it. Do the same for the admin
one.

Do not tick "Share document root with the main domain."

Then **cPanel → SSL/TLS Status**, select both new subdomains, **Run AutoSSL**.
Wait for certificates before going further; the app sends HSTS, and a browser
that meets HSTS on a certificate error will refuse to load the site until the
header expires.

---

## 2. Where things live

```
/home/planova/ihotel-app                              the repository   ← NOT a document root
/home/planova/ihotel.planova.com.eg/media        uploads          ← Apache serves these
/home/planova/ihotel-backups                          dumps
/var/log/ihotel                               PM2 logs
```

**The repository must not be inside any document root.** Everything under a
document root is downloadable over HTTP, and this repository contains `.env` —
the database password, the session secret, and eventually the OPERA credentials.
Putting the app in the document root publishes all three.

Media inside the document root is the opposite case and is deliberate: Apache
already serves that directory, so images need no proxy rule and Node never sees
an image request.

```bash
mkdir -p /home/planova/ihotel-app /home/planova/ihotel-backups
mkdir -p /home/planova/ihotel.planova.com.eg/media
mkdir -p /var/log/ihotel
chown -R planova:planova /home/planova /var/log/ihotel
```

Nothing in the media directory may execute — it is a directory the public can
write into through the upload form:

```apache
# /home/planova/ihotel.planova.com.eg/media/.htaccess
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
CREATE USER ihotel WITH PASSWORD 'put-a-long-random-one-here';
CREATE DATABASE ihotel OWNER ihotel;
SQL
```

A separate database from any future production one. Sharing a database between
a demo people click around in and anything real is how test bookings end up in a
month-end report.

Confirm `listen_addresses = 'localhost'` in `postgresql.conf`. PostgreSQL must
not be reachable from outside the box.

---

## 4. The code

As the **`planova` user**, not root. Files owned by root under a cPanel home
directory will fight suexec.

```bash
su - planova
git clone -b claude/rotana-website-design-bs9ylt \
  https://github.com/karimabdelsalam/hotels-cms.git /home/planova/ihotel-app
cd /home/planova/ihotel-app
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
DATABASE_URL="postgresql://ihotel:the-password@127.0.0.1:5432/ihotel?schema=public&connection_limit=5"

# Not optional and not a placeholder. Generate it:  openssl rand -base64 48
AUTH_SECRET="…at least 32 characters…"

NEXT_PUBLIC_SITE_URL="https://ihotel.planova.com.eg"

# Which instance this is. Drives the PM2 process names, ports and log path,
# so the demo and a later production install can run side by side.
INSTANCE="ihotel"
WEB_PORT="3100"
ADMIN_PORT="3101"
LOG_DIR="/var/log/ihotel"

# ABSOLUTE. A relative path resolves against each app's own working directory,
# so the admin would write images the public site could not read. Production
# refuses to start on a relative value.
MEDIA_ROOT="/home/planova/ihotel.planova.com.eg/media"

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
# Use an address on a domain this server is actually authorised to send for,
# or the messages land in spam. planova.com.eg has the SPF record here;
# fantaziaresorts.com probably does not.
SMTP_FROM="ihotel@planova.com.eg"
RESERVATIONS_EMAIL="ihotel@planova.com.eg"

# Only if you want the AI translation button to work.
ANTHROPIC_API_KEY=""
```

---

## 6. Database, then content

```bash
cd /home/planova/ihotel-app

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

Then start the three processes. **Nothing is copied or edited** — the committed
`infra/ecosystem.config.cjs` reads its ports, process names and log directory
from the environment, so a demo beside a live install differs by three variables
rather than by a forked file that stops receiving fixes.

Put these in `.env` alongside the rest:

```bash
INSTANCE="ihotel"          # names the PM2 processes: ihotel-web, -admin, -worker
WEB_PORT="3100"
ADMIN_PORT="3101"
LOG_DIR="/var/log/ihotel"
```

```bash
set -a && source .env && set +a     # PM2 needs them in its own environment
pm2 start infra/ecosystem.config.cjs
pm2 save
pm2 status
```

```bash
# as root, once — replays the saved process list after a reboot
pm2 startup systemd -u planova --hp /home/planova
```

Three processes must show `online`. The worker is not optional: without it,
paid bookings stop being retried and confirmation emails are never sent.

```bash
curl -sI http://127.0.0.1:3100/api/health
curl -sI http://127.0.0.1:3101/api/health
pm2 logs ihotel-worker --lines 20
```

---

## 8. Apache

`mod_proxy`, `mod_proxy_http`, `mod_headers` and `mod_rewrite` must be enabled —
**WHM → Software → EasyApache 4**. Most profiles include them.

**The proxy configuration goes in the userdata include directory, never in a
vhost.** WHM regenerates vhosts on any Apache rebuild and would discard a vhost
edit silently, usually at the worst moment.

There are four files to write — two hosts × plain and SSL — each needing the
account name, the application path and the right port substituted. Doing that by
hand is the step most likely to go wrong, and it goes wrong *quietly*: a missed
port sends admin traffic to the public site, and a missed path makes
`/_next/static` return 404 so the site loads with no styling at all.

`infra/apache/install.sh` does the substitution and checks the result:

```bash
# as root
/home/planova/ihotel-app/infra/apache/install.sh \
  --user    planova \
  --app     /home/planova/ihotel-app \
  --public  ihotel.planova.com.eg       --public-port 3100 \
  --admin   ihotel-admin.planova.com.eg --admin-port  3101
```

It refuses to run if the app is not built, if the userdata directory is not
where it expects, or if a placeholder survives the substitution — then runs
`ensure_vhost_includes` and `apachectl configtest` for you.

```bash
systemctl restart httpd
```

Verify the include path against your cPanel version — **WHM → Apache
Configuration → Include Editor** shows where it expects them.

Those files exclude `/media` and `/_next/static` from the proxy with
`ProxyPass … !`, so Apache serves both from disk and Node never handles a static
request.

---

## 9. Check it

```bash
curl -sI https://ihotel.planova.com.eg/en | head -3
curl -sI https://ihotel-admin.planova.com.eg/login | head -3
```

Then in a browser, in this order — each answers a different question:

1. `https://ihotel.planova.com.eg/en` — the site is up and images render
2. `https://ihotel.planova.com.eg/ar` — Arabic, right-to-left
3. Search dates on the homepage → results → pick a room → checkout → **Pay**
   → you should land on a confirmation with a reference and a hotel number
4. `https://ihotel.planova.com.eg/en/my-booking` — reference plus the email
   you entered finds it
5. `https://ihotel-admin.planova.com.eg` — sign in as
   `admin@fantazia.test` / `fantazia-dev`, and the booking you just made is
   in **Bookings**

**Change that password immediately.** It is in the public repository. Staff →
your user → set a real one, and turn on two-step sign-in while you are there.

---

## 10. Keep it off Google

A demo indexed alongside the live site competes with it for the same searches
and splits the ranking. Until launch:

```apache
# /home/planova/ihotel.planova.com.eg/.htaccess
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
su - planova
cd /home/planova/ihotel-app
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
