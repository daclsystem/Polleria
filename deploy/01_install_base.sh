#!/bin/bash
# Instalación completa Polleria en VPS
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
DOMAIN="apipchifapollerialopez.indevsoft.com"
SQL_SA_PASSWORD='PolleriaSql#2026Strong!'
APP_DIR=/opt/polleria
JWT_SECRET='polleria-jwt-$(openssl rand -hex 16)'

echo "==> [1/7] Actualizar sistema + paquetes base"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw nginx certbot python3-certbot-nginx software-properties-common apt-transport-https

echo "==> [2/7] Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

echo "==> [3/7] Node.js 22"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> [4/7] Firewall"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo "==> [5/7] SQL Server (Docker)"
docker rm -f polleria-sql 2>/dev/null || true
docker run -d \
  --name polleria-sql \
  --restart unless-stopped \
  -e 'ACCEPT_EULA=Y' \
  -e "MSSQL_SA_PASSWORD=${SQL_SA_PASSWORD}" \
  -e 'MSSQL_PID=Express' \
  -p 1433:1433 \
  -v polleria-sql-data:/var/opt/mssql \
  mcr.microsoft.com/mssql/server:2022-latest

echo "Esperando SQL Server..."
for i in $(seq 1 60); do
  if docker exec polleria-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SQL_SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; then
    echo "SQL listo"
    break
  fi
  # tools path may vary
  if docker exec polleria-sql bash -c "which sqlcmd || ls /opt/mssql-tools*/bin/sqlcmd 2>/dev/null" &>/dev/null; then
    TOOL=$(docker exec polleria-sql bash -c "ls /opt/mssql-tools*/bin/sqlcmd 2>/dev/null | head -1")
    if docker exec polleria-sql "$TOOL" -S localhost -U sa -P "$SQL_SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; then
      echo "SQL listo"
      break
    fi
  fi
  sleep 5
  echo "  intento $i..."
done

mkdir -p "$APP_DIR"
echo "OK_BASE_INSTALLED"
