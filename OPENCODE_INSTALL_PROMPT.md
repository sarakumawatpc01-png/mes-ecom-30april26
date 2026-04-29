# OpenCode Install Prompt — Meesho Commerce OS
# Paste this entire prompt into OpenCode on your VPS to perform a safe install.

---

You are installing the **Meesho Commerce OS** on a live production VPS.

## Critical constraints — read before doing anything

1. **Do NOT touch any existing Docker containers, volumes, or ports.** The server may already be running other projects. Use ONLY the `meesho_` prefix for all container names, network names, and volume names.
2. **Ports reserved for this project only:** Admin UI `13000`, Engine `13001`, Postgres `127.0.0.1:15432`, Redis `127.0.0.1:16379`. Check they are free first — if not, report and stop.
3. **Docker network:** Create `meesho_internal` (if not already present). Attach only Meesho containers to it.
4. **Never run `docker system prune` or remove volumes not prefixed with `meesho_`.**
5. **Target domain:** Superadmin panel at `meesho.agencyfic.com` (already DNS-pointed to this server). Each store's admin at `storename.com/admin`.

---

## Phase 1 — Pre-flight checks

```bash
# 1a. Confirm we're in the right directory
ls meesho-commerce-os/docker-compose.yml || { echo "ERROR: meesho-commerce-os/ not found"; exit 1; }

# 1b. Check reserved ports are free
for port in 13000 13001 15432 16379; do
  ss -tlnp | grep ":$port " && echo "PORT $port IN USE — resolve before continuing" && exit 1
done
echo "All ports free ✓"

# 1c. Docker sanity
docker info > /dev/null 2>&1 || { echo "Docker not running"; exit 1; }
docker compose version || { echo "docker compose v2 required"; exit 1; }
```

## Phase 2 — Create .env file

```bash
cd meesho-commerce-os
cp .env.example .env
```

Now edit `.env`. Required values to fill in (everything else can stay at defaults for now):

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | Generate: `openssl rand -base64 32` |
| `REDIS_PASSWORD` | Generate: `openssl rand -base64 24` |
| `ENGINE_SECRET` | Generate: `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | Generate: `openssl rand -base64 24 \| head -c 32` |
| `SUPERADMIN_DOMAIN` | `meesho.agencyfic.com` |
| `NEXT_PUBLIC_SUPERADMIN_DOMAIN` | `meesho.agencyfic.com` |
| `DATABASE_URL` | Must match `POSTGRES_PASSWORD` you set above |
| `REDIS_URL` | Must match `REDIS_PASSWORD` you set above |

Leave `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` as they are (`admin@agencyfic.com` / `Admin@123`).
They are seeded directly into the database via the schema SQL.

## Phase 3 — SSL certificate

Obtain a certificate for `meesho.agencyfic.com`:

```bash
# If certbot is installed:
certbot certonly --standalone -d meesho.agencyfic.com --non-interactive --agree-tos -m your@email.com

# Copy certs to nginx ssl directory
mkdir -p nginx/ssl/meesho.agencyfic.com
cp /etc/letsencrypt/live/meesho.agencyfic.com/fullchain.pem nginx/ssl/meesho.agencyfic.com/
cp /etc/letsencrypt/live/meesho.agencyfic.com/privkey.pem nginx/ssl/meesho.agencyfic.com/
```

## Phase 4 — Build and start

```bash
cd meesho-commerce-os

# Build images (no cache to ensure clean build)
docker compose build --no-cache

# Check build succeeded — all 4 images must be present
docker images | grep meesho

# Start in detached mode
docker compose up -d

# Confirm all containers are running
docker compose ps
```

Expected output: 5 containers running — `meesho_postgres`, `meesho_redis`, `meesho_engine`, `meesho_admin_ui`, `meesho_nginx`.

## Phase 5 — Verify engine started successfully

```bash
# Wait for engine to be ready (retry up to 30s)
for i in $(seq 1 30); do
  curl -sf http://localhost:13001/health && echo " Engine is up ✓" && break
  echo "Waiting... ($i/30)"
  sleep 1
done

# Check engine logs for TypeScript compilation errors
docker compose logs engine | tail -50
```

If you see `dist/app.js not found` or `Cannot find module`, run:
```bash
docker compose exec engine sh -c "cd /app && npm run build 2>&1 | tail -30"
```

## Phase 6 — Initialize database

```bash
# Run schema migration (idempotent — safe to run multiple times)
docker compose exec postgres psql -U meesho -d meesho_engine -f /docker-entrypoint-initdb.d/schema.sql

# Verify superadmin was seeded
docker compose exec postgres psql -U meesho -d meesho_engine \
  -c "SELECT id, email, role, created_at FROM engine.admin_users;"
```

Expected: one row with `admin@agencyfic.com`, role `super_admin`.

## Phase 7 — Test login

```bash
# Test superadmin login
curl -s -X POST http://localhost:13001/admin/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agencyfic.com","password":"Admin@123"}' | python3 -m json.tool
```

Expected: JSON response with `accessToken` and `admin.role: "super_admin"`.

## Phase 8 — Configure nginx for meesho.agencyfic.com

```bash
# Enable the superadmin vhost (already in sites-available)
ls nginx/sites-available/meesho.agencyfic.com.conf

# Reload nginx to pick it up
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

## Phase 9 — Test superadmin panel in browser

Open `https://meesho.agencyfic.com` in your browser.

- You should see the admin login page.
- Login with: `admin@agencyfic.com` / `Admin@123`
- You should land on the superadmin dashboard.

**First thing to do after login:**
1. Go to Settings → Superadmin tab
2. Change your email and/or password
3. Go to Settings → Security and optionally enable Email OTP for extra protection

## Phase 10 — Add your first store site

In the admin panel: Sites → Add New Site, OR via API:

```bash
curl -s -X POST http://localhost:13001/admin/api/sites \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_FROM_PHASE_7" \
  -d '{
    "slug": "blackkurti",
    "name": "Black Kurti",
    "domain": "blackkurti.com",
    "siteAdminEmail": "admin@blackkurti.com",
    "siteAdminPassword": "Admin@123"
  }'
```

Then copy `nginx/sites-available/site-template.conf` to `nginx/sites-available/blackkurti.com.conf`,
replace `SITEDOMAIN` with `blackkurti.com` and `SITESLUG` with `blackkurti`, and reload nginx.

The store's admin panel will be at `https://blackkurti.com/admin`.

## Phase 11 — Health check all services

```bash
echo "=== Container Status ===" && docker compose ps
echo "=== Engine Health ===" && curl -sf http://localhost:13001/health
echo "=== Admin UI ===" && curl -sf http://localhost:13000/ | head -5
echo "=== DB Tables ===" && docker compose exec postgres psql -U meesho -d meesho_engine \
  -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname='engine' ORDER BY tablename;"
echo "=== All OK ==="
```

## Troubleshooting

**Engine fails to start:**
```bash
docker compose logs engine --tail=100
docker compose exec engine sh -c "node --version && npm run build 2>&1"
```

**Database connection error:**
```bash
# Verify DATABASE_URL matches POSTGRES_PASSWORD in .env
grep -E "POSTGRES_PASSWORD|DATABASE_URL" .env
```

**Nginx SSL error:**
```bash
docker compose logs nginx --tail=30
ls -la nginx/ssl/meesho.agencyfic.com/
```

**Port conflict:**
```bash
ss -tlnp | grep -E "13000|13001|15432|16379"
# Find what's using the port, then either stop it or change the port in docker-compose.yml
```

**Reset containers only (keeps all data volumes):**
```bash
docker compose down          # stops and removes containers only (volumes are safe)
docker compose up -d --build # rebuilds and starts fresh
```

---

## Summary of credentials (change after install)

| Access point | URL | Email | Password |
|---|---|---|---|
| Superadmin panel | `https://meesho.agencyfic.com` | `admin@agencyfic.com` | `Admin@123` |
| Each store admin | `https://storename.com/admin` | Set via superadmin Settings → Superadmin tab | `Admin@123` (default) |
| PostgreSQL | `localhost:15432` | `meesho` | value from `.env` |
