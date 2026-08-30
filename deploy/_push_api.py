"""One-shot: sube api/src + SQL 23, aplica BD, rebuild y restart PM2."""
from __future__ import annotations

import os
import posixpath
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("POLL_SSH_HOST", "116.203.70.104")
USER = os.environ.get("POLL_SSH_USER", "root")
PASS = os.environ["POLL_SSH_PASS"]
ROOT = Path(__file__).resolve().parents[1]
REMOTE_API = "/opt/polleria/api"
REMOTE_DB = "/opt/polleria/database"


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 180) -> str:
    print(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    def safe(s: str) -> None:
        try:
            print(s)
        except UnicodeEncodeError:
            print(s.encode("ascii", "replace").decode("ascii"))

    if out.strip():
        safe(out.rstrip())
    if err.strip():
        safe(err.rstrip())
    if code != 0:
        raise SystemExit(f"FALLO ({code}): {cmd}")
    return out


def ensure_dir(sftp: paramiko.SFTPClient, remote: str) -> None:
    acc = ""
    for p in remote.strip("/").split("/"):
        acc += "/" + p
        try:
            sftp.stat(acc)
        except OSError:
            sftp.mkdir(acc)


def upload_dir(sftp: paramiko.SFTPClient, local: Path, remote: str) -> int:
    n = 0
    for path in local.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix in {".map"} or path.name == ".DS_Store":
            continue
        rel = path.relative_to(local).as_posix()
        dest = posixpath.join(remote, rel)
        ensure_dir(sftp, posixpath.dirname(dest))
        sftp.put(str(path), dest)
        n += 1
        print(f"  put {rel}")
    return n


def main() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30, allow_agent=False, look_for_keys=False)
    sftp = ssh.open_sftp()

    print("== remoto ==")
    run(ssh, "ls -la /opt/polleria/api /opt/polleria/database | head -40")
    run(ssh, "pm2 describe polleria-api | head -25")

    print("== subir API src ==")
    n = upload_dir(sftp, ROOT / "api" / "src", f"{REMOTE_API}/src")
    print(f"subidos {n} archivos src")

    print("== subir SQL ==")
    try:
        sftp.stat(REMOTE_DB)
    except OSError:
        sftp.mkdir(REMOTE_DB)
    for name in ("18_Settings_DeliveryFee.sql", "23_Delivery_By_Branch.sql"):
        sftp.put(str(ROOT / "database" / name), f"{REMOTE_DB}/{name}")
        print(f"  put {name}")

    print("== aplicar SQL ==")
    run(
        ssh,
        r"""
set -e
SQLCMD=$(docker exec polleria-sql bash -c 'ls /opt/mssql-tools*/bin/sqlcmd 2>/dev/null | head -1')
echo "sqlcmd=$SQLCMD"
PASS=$(grep -E '^DB_PASSWORD=' /opt/polleria/api/.env | head -1 | cut -d= -f2-)
docker cp /opt/polleria/database/18_Settings_DeliveryFee.sql polleria-sql:/tmp/18.sql
docker cp /opt/polleria/database/23_Delivery_By_Branch.sql polleria-sql:/tmp/23.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$PASS" -C -i /tmp/18.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$PASS" -C -i /tmp/23.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$PASS" -C -d Polleria -Q "SET NOCOUNT ON; SELECT OriginLat, OriginLng, DeliveryFee FROM dbo.Settings WHERE Id=1; SELECT Name, DistanceKmFrom, DistanceKmTo, Fee, Active FROM dbo.DeliveryRanges ORDER BY SortOrder; SELECT TOP 3 Name, Lat, Lng, Address FROM dbo.Branches;"
""",
        timeout=120,
    )

    print("== build + restart API ==")
    run(
        ssh,
        "cd /opt/polleria/api && (test -x node_modules/typescript/bin/tsc || npm install --omit=dev=false) && node node_modules/typescript/bin/tsc -p tsconfig.json",
        timeout=240,
    )
    run(ssh, "pm2 restart polleria-api --update-env")
    run(ssh, "sleep 2 && curl -sS http://127.0.0.1:3080/health")
    run(ssh, "curl -sS https://apipchifapollerialopez.indevsoft.com/api/delivery/ranges")

    sftp.close()
    ssh.close()
    print("DEPLOY_OK")


if __name__ == "__main__":
    if not PASS:
        sys.exit("POLL_SSH_PASS vacía")
    main()
