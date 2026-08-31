# Deployment — VPS with cPanel/WHM

Written for the confirmed environment: **your own VPS, root access, cPanel/WHM as
the panel.** That combination removes every constraint shared hosting would have
imposed — PostgreSQL installs normally, Node processes run properly, and Apache
becomes a reverse proxy in front of them.

cPanel keeps doing what it is good at: DNS, email, SSL certificates, and the
account structure. It is not in the request path for the application.

---

## What runs where

```
                        internet
                            │  443
                    ┌───────▼────────┐
                    │     Apache     │  cPanel-managed, holds the certificates
                    └───┬────────┬───┘
          /media, /_next│        │ everything else
          served from   │        │ proxied to localhost
          disk directly │        │
                        │   ┌────▼──────────────────────────┐
                        │   │ 127.0.0.1:3000  public site   │  PM2
                        │   │ 127.0.0.1:3001  admin portal  │  PM2
                        │   └────┬──────────────────────────┘
                        │        │
                   /home/fantazia/media   ┌──▼─────────────┐
                                          │ PostgreSQL 16  │  localhost only
                                          └────────────────┘
```

**Neither Node process listens on a public interface.** Apache is the only thing
bound to 80 and 443; PostgreSQL is bound to localhost. Nothing in the stack is
directly reachable from the internet except Apache.

---

## 1. Server preparation

As root.

```bash
# Build tools — sharp compiles native bindings if no prebuild matches the platform
yum install -y gcc-c++ make git rsync

# Node 22 LTS
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum install -y nodejs
corepack enable && corepack prepare pnpm@10.33.0 --activate

node -v && pnpm -v
```

**Do not install Node through cPanel's Node.js selector.** That is designed for
Passenger-managed apps and will fight PM2 over process ownership. A system Node
plus PM2 is simpler and behaves predictably.

---

## 2. PostgreSQL

```bash
yum install -y postgresql16-server postgresql16-contrib
/usr/pgsql-16/bin/postgresql-16-setup initdb
systemctl enable --now postgresql-16

su - postgres -c "psql -c \"CREATE ROLE fantazia LOGIN PASSWORD 'STRONG_PASSWORD_HERE'\""
su - postgres -c "createdb -O fantazia fantazia"
```

Bind to localhost only — the application is on the same machine and nothing
outside it has any business connecting:

```conf
# /var/lib/pgsql/16/data/postgresql.conf
listen_addresses = 'localhost'
```

```conf
# /var/lib/pgsql/16/data/pg_hba.conf — password auth for local TCP
host    fantazia    fantazia    127.0.0.1/32    scram-sha-256
```

```bash
systemctl restart postgresql-16
```

Verify before going further: `psql -h 127.0.0.1 -U fantazia -d fantazia -c "select 1"`

---

## 3. Application user and layout

Run the apps as an unprivileged user that owns nothing else on the box.

```bash
useradd -m -s /bin/bash fantazia
mkdir -p /home/fantazia/{app,media,backups}
mkdir -p /var/log/fantazia
chown -R fantazia:fantazia /home/fantazia /var/log/fantazia
```

```
/home/fantazia/app       the repository
/home/fantazia/media     uploads — Apache serves this directly
/home/fantazia/backups   nightly dumps
/var/log/fantazia        PM2 logs
```

Apache needs to traverse into the media directory. On cPanel that usually means
adding its user to the group:

```bash
usermod -a -G fantazia nobody     # check your Apache user: ps -o user= -C httpd | head -1
chmod 750 /home/fantazia
chmod -R 755 /home/fantazia/media
```

---

## 4. First deployment

As `fantazia`:

```bash
cd /home/fantazia/app
git clone <repository-url> .
git checkout main

cp .env.production.example .env
$EDITOR .env          # database password, AUTH_SECRET, site URL

pnpm install --frozen-lockfile
pnpm --filter @fantazia/db exec prisma generate
pnpm --filter @fantazia/db exec prisma migrate deploy
pnpm --filter @fantazia/db seed     # first deployment only
pnpm build
```

Generate the session secret properly — `openssl rand -base64 48`. It is what
signs every staff session, and changing it later signs everyone out, which is
also how you revoke a leaked session quickly.

**Change the seeded passwords before the portal is reachable.** The seed creates
development accounts with a known password. Sign in, change them, then delete
the ones you do not need.

---

## 5. PM2

```bash
npm install -g pm2

su - fantazia
cd /home/fantazia/app
pm2 start infra/ecosystem.config.cjs
pm2 save

exit
env PATH=$PATH:/usr/bin pm2 startup systemd -u fantazia --hp /home/fantazia
```

`pm2 save` records the current process list; `pm2 startup` writes the systemd
unit that replays it after a reboot. Both are needed — the first without the
second means the site does not come back after a restart.

```bash
pm2 status
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3001/api/health
```

Both should return `{"status":"ok","database":"up"}`. That endpoint checks the
database, not just the process, so a cached page cannot make a broken deployment
look healthy.

---

## 6. Apache

Create the two domains in WHM as normal — the public site and a separate
hostname for the admin. Then add the proxy configuration.

**Put it in the userdata include directory, not in the vhost.** An Apache rebuild
regenerates vhosts and would discard anything written there:

```bash
D=/etc/apache2/conf.d/userdata
mkdir -p $D/std/2_4/fantazia/fantaziahotels.com
mkdir -p $D/ssl/2_4/fantazia/fantaziahotels.com

cp /home/fantazia/app/infra/apache/fantazia.conf \
   $D/std/2_4/fantazia/fantaziahotels.com/
cp /home/fantazia/app/infra/apache/fantazia.conf \
   $D/ssl/2_4/fantazia/fantaziahotels.com/

# same for the admin hostname with fantazia-admin.conf

/scripts/ensure_vhost_includes --all-users
systemctl restart httpd
```

Verify those paths against your cPanel version before relying on them.

Required modules — enable through EasyApache 4 if they are missing:
`mod_proxy`, `mod_proxy_http`, `mod_headers`, `mod_rewrite`.

Two details in `infra/apache/fantazia.conf` matter more than they look:

- **`/media` and `/_next/static` are served from disk**, with `ProxyPass … !`
  excluding them from the proxy. Node never sees an image request.
- **PHP is disabled inside the media directory**, and handlers are removed. It is
  a directory the public can write into through the upload form; nothing in it
  should ever be executed.

---

## 7. SSL

Use cPanel's AutoSSL — it renews on its own and Apache already knows where the
certificates are. Issue for both hostnames.

Once certificates are in place, force HTTPS. The apps set HSTS themselves; the
redirect belongs in Apache.

---

## 8. Firewall

```bash
# ConfigServer Firewall ships with most cPanel installs
# /etc/csf/csf.conf
TCP_IN  = "20,21,22,25,53,80,110,143,443,465,587,993,995,2078,2083,2087,2096"
```

**5432 and 3000–3001 must not appear in that list.** PostgreSQL and both Node
processes are localhost-only by configuration; the firewall is the second layer
that keeps a misconfiguration from becoming an exposure.

---

## 9. Backups

```bash
crontab -u fantazia -e
0 3 * * * /home/fantazia/app/infra/backup.sh >> /var/log/fantazia/backup.log 2>&1
```

The script dumps the database and hard-links a snapshot of the media directory,
so thirty days of history costs roughly one copy plus what actually changed.

**Two things to get right:**

1. **The database alone is not a backup of this system.** Every image is a file
   on disk referenced by a row. Restore one without the other and the site is
   full of broken pictures.
2. **Copy the backups off the server.** A backup that only exists on the machine
   it protects does not protect against the machine.

Rehearse a restore before launch, not after an incident:

```bash
pg_restore --clean --if-exists -U fantazia -d fantazia_test backup.dump
```

---

## 10. Routine deployments

```bash
su - fantazia
cd /home/fantazia/app
./infra/deploy.sh
```

Fetch, install, migrate, build, then `pm2 reload` — which starts the new process,
waits for it to listen, and only then stops the old one. No dropped requests.

The script checks both health endpoints afterwards and reports a failure loudly
rather than leaving a broken deployment running quietly.

---

## 11. Log rotation

PM2 logs grow without bound otherwise:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

---

## 12. Before launch

- [ ] Seeded passwords changed; unused accounts deleted
- [ ] `AUTH_SECRET` generated with `openssl rand`, not the example value
- [ ] Admin hostname restricted by IP, or behind the VPN
- [ ] `MEDIA_ROOT` absolute, and `NEXT_PUBLIC_MEDIA_URL_BASE` matching the Alias
- [ ] AutoSSL issued for both hostnames, HTTP redirecting to HTTPS
- [ ] 5432, 3000 and 3001 closed at the firewall
- [ ] Backups running, and **a restore rehearsed**
- [ ] `pm2 save` and `pm2 startup` both done — reboot the server once and confirm
      the site comes back on its own
- [ ] Health endpoints watched by an uptime monitor
- [ ] `robots.txt` allowing the public site; the admin already sends `noindex`

---

## Sizing

For three resorts and this traffic shape, **4 GB RAM and 2 vCPU** is comfortable:
roughly 250–400 MB per Node process, PostgreSQL settling around 200–300 MB, and
the rest for the page cache that makes disk-served images fast.

The one operation that spikes is image processing — sharp is memory-hungry while
resizing a large upload. PM2 restarts a process above 600 MB rather than letting
the box swap.

Add RAM before CPU if the admin feels slow during bulk uploads.
