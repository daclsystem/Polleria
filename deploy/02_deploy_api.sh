#!/bin/bash
set -euo pipefail

DOMAIN="apipchifapollerialopez.indevsoft.com"
SQL_SA_PASSWORD='PolleriaSql#2026Strong!'
APP_DIR=/opt/polleria
JWT_SECRET="$(openssl rand -hex 24)"

echo "==> [6] Aplicar scripts SQL"
# sqlcmd path inside container
SQLCMD=$(docker exec polleria-sql bash -c 'ls /opt/mssql-tools*/bin/sqlcmd 2>/dev/null | head -1')
echo "sqlcmd=$SQLCMD"

docker cp "$APP_DIR/database/01_Polleria_Create.sql" polleria-sql:/tmp/01.sql
docker cp "$APP_DIR/database/02_Polleria_Seed.sql" polleria-sql:/tmp/02.sql

docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$SQL_SA_PASSWORD" -C -i /tmp/01.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$SQL_SA_PASSWORD" -C -i /tmp/02.sql

docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$SQL_SA_PASSWORD" -C -d Polleria -Q "SELECT name FROM sys.tables ORDER BY name"

echo "==> [7] API Node"
cd "$APP_DIR/api"
cat > .env <<ENV
PORT=3080
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=http://localhost:5174,http://127.0.0.1:5174,https://chifapollerialopez.com,https://www.chifapollerialopez.com,https://indevsoft.com,https://www.indevsoft.com,https://${DOMAIN}
FRONT_PUBLIC_URL=https://chifapollerialopez.com

DB_SERVER=127.0.0.1
DB_PORT=1433
DB_NAME=Polleria
DB_USER=sa
DB_PASSWORD=${SQL_SA_PASSWORD}
DB_ENCRYPT=false
DB_TRUST_CERT=true

GEO_ROUTE_URL=https://geo.taximonterrico.com/api/v3/route/{fromLat},{fromLng}/{toLat},{toLng}/-1/{token}
GEO_ROUTE_TOKEN=demo
ENV

npm install
npm run build
pm2 delete polleria-api 2>/dev/null || true
pm2 start dist/index.js --name polleria-api
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo "==> [8] Nginx + HTTP"
cat > /etc/nginx/sites-available/polleria-api <<NGX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
NGX

ln -sf /etc/nginx/sites-available/polleria-api /etc/nginx/sites-enabled/polleria-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> [9] Let's Encrypt HTTPS"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@indevsoft.com --redirect || {
  echo "CERTBOT_WARN: no se pudo emitir certificado aún"
}

curl -sS "http://127.0.0.1:3080/health" || true
echo
curl -sS -o /dev/null -w "http_domain:%{http_code}\n" "http://${DOMAIN}/health" || true
curl -sS -o /dev/null -w "https_domain:%{http_code}\n" "https://${DOMAIN}/health" || true

echo "DEPLOY_COMPLETE"
echo "DOMAIN=https://${DOMAIN}"
echo "SQL_SA_PASSWORD=${SQL_SA_PASSWORD}"
