# Deployment — VPS with WHM & cPanel

> **Standing it up on a subdomain first?** See
> [`deploy-subdomain.md`](./deploy-subdomain.md). That is the one you want
> before launch: the platform running at `demo.fantaziaresorts.com` beside the
> live site, with nothing at risk. This document covers taking over a main
> domain, which is the step after.


Written for the confirmed environment: **your own VPS, root access, WHM and
cPanel.** That combination removes every constraint shared hosting would have
imposed — PostgreSQL installs normally, Node runs properly under PM2, and Apache
becomes a reverse proxy in front of it.

The two panels do different jobs, and it helps to keep them separate in your head:

| | **WHM** (root) | **cPanel** (the account) |
| --- | --- | --- |
| Used for | Installing PostgreSQL and Node, EasyApache modules, the firewall, PM2, backups | Domains, DNS, AutoSSL, email, file access |
| Who | You, as root | The account the site runs as |

**cPanel is never in the request path for the application.** It manages the
account and the certificate; Apache proxies to Node.

---

## What runs where

```
                        internet
                            │  443
                    ┌───────▼────────┐
                    │     Apache     │  WHM-managed, holds the certificates
                    └───┬────────┬───┘
     public_html/media  │        │ everything else
     and /_next/static  │        │ proxied to localhost
     served from disk   │        │
                        │   ┌────▼──────────────────────────┐
                        │   │ 127.0.0.1:3000  public site   │  PM2
                        │   │ 127.0.0.1:3001  admin portal  │  PM2
                        │   └────┬──────────────────────────┘
                        │        │
                        │   ┌────▼───────────┐
                        │   │ PostgreSQL 16  │  localhost only
                        │   └────────────────┘
```

**Neither Node process listens on a public interface.** Apache is the only thing
bound to 80 and 443; PostgreSQL is bound to localhost. Nothing is directly
reachable from the internet except Apache.

---

## 1. Create the cPanel account first

In **WHM → Account Functions → Create a New Account**, with the public domain.

Do this before anything else, and **do not create the user with `useradd`.** A
cPanel account gives you the system user, the home directory, the document root,
a DNS zone, and AutoSSL eligibility, all consistent with how Apache runs vhosts
for that user. A hand-made system user has none of that and will fight suexec
over file ownership.

Then add the admin hostname as an **Addon Domain or Subdomain** on the same
account — `admin.fantaziahotels.com` is the usual shape.

Everything below assumes the account user is `fantazia`. Substitute yours.

---

## 2. Server preparation

WHM → **Terminal**, or SSH as root.

cPanel runs on AlmaLinux, CloudLinux or Ubuntu. Pick the matching column.

```bash
# --- AlmaLinux / CloudLinux ---
dnf install -y gcc-c++ make git rsync
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

# --- Ubuntu ---
apt-get install -y build-essential git rsync
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

```bash
corepack enable && corepack prepare pnpm@10.33.0 --activate
node -v && pnpm -v
```

Two things to avoid:

- **Do not use cPanel's Node.js selector.** It is built for Passenger-managed
  apps and will contend with PM2 over process ownership.
- **If this VPS runs CloudLinux**, check the account's LVE limits in
  WHM → **CloudLinux LVE Manager**. The defaults cap processes, memory and
  entry processes per user, and two Node apps plus image processing will hit
  them. Raise `NPROC` and `PMEM` for this account, or the site will fail under
  load in ways that look like random crashes.

---

## 3. PostgreSQL

```bash
# AlmaLinux / CloudLinux
dnf install -y postgresql16-server postgresql16-contrib
/usr/pgsql-16/bin/postgresql-16-setup initdb
systemctl enable --now postgresql-16

# Ubuntu
apt-get install -y postgresql-16
systemctl enable --now postgresql
```

```bash
su - postgres -c "psql -c \"CREATE ROLE fantazia LOGIN PASSWORD 'STRONG_PASSWORD_HERE'\""
su - postgres -c "createdb -O fantazia fantazia"
```

Bind to localhost — the application is on the same machine, and nothing outside
it has any business connecting:

```conf
# postgresql.conf
listen_addresses = 'localhost'
```

```conf
# pg_hba.conf
host    fantazia    fantazia    127.0.0.1/32    scram-sha-256
```

```bash
systemctl restart postgresql-16
psql -h 127.0.0.1 -U fantazia -d fantazia -c "select 1"    # verify before continuing
```

**Ignore cPanel's PostgreSQL section in WHM.** It manages its own instance for
cPanel users and is not what the application should connect to.

---

## 4. Directory layout — the one detail that matters most

```
/home/fantazia/app                   the repository        ← NOT under public_html
/home/fantazia/public_html/media     uploads               ← Apache serves directly
/home/fantazia/backups               nightly dumps
/var/log/fantazia                    PM2 logs
```

**The application source must never live under `public_html`.** Everything under
the document root is downloadable over HTTP, and this repository contains `.env`
— the database password and the session secret. Putting the app in the document
root would publish both.

Putting **media** inside `public_html` is the opposite case, and is deliberate:
Apache already serves that directory, so images need no Alias, no proxy rule and
no configuration at all.

```bash
mkdir -p /home/fantazia/{app,backups}
mkdir -p /home/fantazia/public_html/media
mkdir -p /var/log/fantazia
chown -R fantazia:fantazia /home/fantazia /var/log/fantazia
```

Nothing in the media directory should ever execute. Drop an `.htaccess` beside
it — it is a directory the public can write into through the upload form:

```apache
# /home/fantazia/public_html/media/.htaccess
Options -Indexes -ExecCGI
RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .cgi .pl
php_flag engine off
Header always set Cache-Control "public, max-age=31536000, immutable"
Header always set X-Content-Type-Options "nosniff"
```

---

## 5. First deployment

As the account user — WHM → Terminal, then `su - fantazia`:

```bash
cd /home/fantazia/app
git clone <repository-url> .
git checkout main

cp .env.production.example .env
chmod 600 .env
$EDITOR .env          # database password, AUTH_SECRET, site URL, media paths

pnpm install --frozen-lockfile
pnpm --filter @fantazia/db exec prisma generate
pnpm --filter @fantazia/db exec prisma migrate deploy
pnpm --filter @fantazia/db seed     # first deployment only
pnpm build
```

The media settings for this layout:

```bash
MEDIA_ROOT="/home/fantazia/public_html/media"
NEXT_PUBLIC_MEDIA_URL_BASE="https://fantaziahotels.com/media"
```

Generate the session secret properly — `openssl rand -base64 48`. It signs every
staff session; changing it signs everyone out, which is also how you revoke a
leaked session quickly.

**Change the seeded passwords before the portal is reachable.** The seed creates
development accounts with a known password. Sign in, change them, delete the ones
you do not need.

---

## 6. PM2

```bash
npm install -g pm2                      # as root

su - fantazia
cd /home/fantazia/app
pm2 start infra/ecosystem.config.cjs
pm2 save
exit

# as root — writes the systemd unit that replays the saved list on boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u fantazia --hp /home/fantazia
```

`pm2 save` records the process list; `pm2 startup` makes it survive a reboot.
Both are needed — the first without the second means the site does not come back.

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3001/api/health
```

Both should return `{"status":"ok","database":"up"}`. That endpoint queries the
database, not just the process, so a cached page cannot make a broken deployment
look healthy.

---

## 7. Apache

EasyApache 4 (**WHM → Software → EasyApache 4**) must have `mod_proxy`,
`mod_proxy_http`, `mod_headers` and `mod_rewrite`. Most profiles include them.

**Put the proxy configuration in the userdata include directory, never in a
vhost.** WHM regenerates vhosts on any Apache rebuild and would discard anything
written there — silently, and usually at the worst moment:

```bash
D=/etc/apache2/conf.d/userdata
mkdir -p $D/std/2_4/fantazia/fantaziahotels.com
mkdir -p $D/ssl/2_4/fantazia/fantaziahotels.com
mkdir -p $D/std/2_4/fantazia/admin.fantaziahotels.com
mkdir -p $D/ssl/2_4/fantazia/admin.fantaziahotels.com

A=/home/fantazia/app/infra/apache
cp $A/fantazia.conf       $D/std/2_4/fantazia/fantaziahotels.com/
cp $A/fantazia.conf       $D/ssl/2_4/fantazia/fantaziahotels.com/
cp $A/fantazia-admin.conf $D/std/2_4/fantazia/admin.fantaziahotels.com/
cp $A/fantazia-admin.conf $D/ssl/2_4/fantazia/admin.fantaziahotels.com/

/scripts/ensure_vhost_includes --all-users
systemctl restart httpd
```

Verify those paths against your cPanel version — WHM → **Apache Configuration →
Include Editor** shows where it expects them.

The config excludes `/media` and `/_next/static` from the proxy with
`ProxyPass … !`, so Apache serves them from disk and **Node never sees an image
request**.

---

## 8. SSL

WHM → **Manage AutoSSL**, then run it for the account. It covers both hostnames
and renews on its own; Apache already knows where the certificates go.

Once issued, force HTTPS. The apps send HSTS themselves; the redirect belongs in
Apache.

---

## 9. Firewall

Most cPanel VPS ship with ConfigServer Firewall — WHM → **ConfigServer Security
& Firewall**.

```
TCP_IN = "20,21,22,25,53,80,110,143,443,465,587,993,995,2078,2083,2087,2096"
```

**5432, 3000 and 3001 must not appear in that list.** PostgreSQL and both Node
processes are localhost-only by configuration; the firewall is the second layer
that stops a misconfiguration becoming an exposure.

Leave `cPHulk` on for brute-force protection on the panel itself. The application
does its own account lockout after five failed sign-ins.

---

## 10. Backups

```bash
crontab -u fantazia -e
0 3 * * * /home/fantazia/app/infra/backup.sh >> /var/log/fantazia/backup.log 2>&1
```

**cPanel's own backups will not save this system.** They cover the account's
files and MySQL — not the PostgreSQL database the application actually uses.
Configure both: cPanel backups for the account, and this script for the data.

The script dumps the database and hard-links a media snapshot, so thirty days of
history costs about one copy plus what changed.

Two things to get right:

1. **The database alone is not a backup.** Every image is a file on disk
   referenced by a row. Restore one without the other and the site is full of
   broken pictures.
2. **Copy the backups off the server.** A backup that exists only on the machine
   it protects does not protect against the machine.

Rehearse a restore before launch, not after an incident:

```bash
pg_restore --clean --if-exists -U fantazia -d fantazia_test backup.dump
```

---

## 11. Routine deployments

```bash
su - fantazia
cd /home/fantazia/app
./infra/deploy.sh
```

Fetch, install, migrate, build, then `pm2 reload` — which starts the new process,
waits for it to listen, and only then stops the old one. No dropped requests. The
script checks both health endpoints and fails loudly rather than leaving a broken
deployment running quietly.

---

## 12. Log rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

---

## Before launch

- [ ] cPanel account created in WHM; app in `/home/<user>/app`, **not** under
      `public_html`
- [ ] `.env` is `chmod 600` and outside the document root
- [ ] Seeded passwords changed; unused accounts deleted
- [ ] `AUTH_SECRET` generated with `openssl rand`, not the example value
- [ ] Admin hostname restricted by IP or behind the VPN — the block is ready and
      commented in `fantazia-admin.conf`
- [ ] `MEDIA_ROOT` absolute and matching `NEXT_PUBLIC_MEDIA_URL_BASE`
- [ ] `.htaccess` in the media directory disabling execution
- [ ] AutoSSL issued for both hostnames; HTTP redirecting to HTTPS
- [ ] 5432, 3000, 3001 closed in CSF
- [ ] CloudLinux LVE limits raised for the account, if CloudLinux is installed
- [ ] Backups running, **a restore rehearsed**, copies going off-server
- [ ] `pm2 save` and `pm2 startup` both done — **reboot the server once** and
      confirm the site returns on its own
- [ ] Health endpoints watched by an uptime monitor

---

## Sizing

For three resorts and this traffic shape, **4 GB RAM and 2 vCPU** is comfortable:
roughly 250–400 MB per Node process, PostgreSQL settling around 200–300 MB, and
the rest for the page cache that makes disk-served images fast.

WHM itself wants around 1 GB before anything else runs, so 4 GB is closer to the
floor here than it would be on a bare VPS. If the box also handles email for the
group, start at 6 GB.

The one operation that spikes is image processing — sharp is memory-hungry while
resizing a large upload. PM2 restarts a process above 600 MB rather than letting
the box swap.
