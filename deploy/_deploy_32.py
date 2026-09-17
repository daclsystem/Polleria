"""Sube SQL 32 + api/src, aplica BD, compila y reinicia PM2."""
from __future__ import annotations

import os
import posixpath
import re
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("POLL_SSH_HOST", "116.203.70.104")
USER = os.environ.get("POLL_SSH_USER", "root")
ROOT = Path(__file__).resolve().parents[1]
REMOTE_API = "/opt/polleria/api"
REMOTE_DB = "/opt/polleria/database"
SQL_NAME = "32_Orders_Eliminado.sql"


def ssh_pass() -> str:
    env = os.environ.get("POLL_SSH_PASS")
    if env:
        return env
    text = (Path(__file__).with_name("scp_expect")).read_text()
    m = re.search(r'set pass "([^"]+)"', text)
    if not m:
        sys.exit("Sin clave SSH")
    return m.group(1)


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 180) -> str:
    print(f"$ {cmd.splitlines()[0][:80]}")
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
        raise SystemExit(f"FALLO ({code})")
    return out


def ensure_dir(sftp: paramiko.SFTPClient, remote: str) -> None:
    acc = ""
    for p in remote.strip("/").split("/"):
        acc += "/" + p
        try:
            sftp.stat(acc)
        except OSError:
            sftp.mkdir(acc)


def main() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=ssh_pass(), timeout=30, allow_agent=False, look_for_keys=False)
    sftp = ssh.open_sftp()

    print("== SQL ==")
    try:
        sftp.stat(REMOTE_DB)
    except OSError:
        sftp.mkdir(REMOTE_DB)
    sftp.put(str(ROOT / "database" / SQL_NAME), f"{REMOTE_DB}/{SQL_NAME}")
    print(f"  put {SQL_NAME}")

    print("== API src ==")
    local = ROOT / "api" / "src"
    n = 0
    for path in local.rglob("*"):
        if not path.is_file() or path.suffix in {".map"} or path.name == ".DS_Store":
            continue
        rel = path.relative_to(local).as_posix()
        dest = posixpath.join(REMOTE_API, "src", rel)
        ensure_dir(sftp, posixpath.dirname(dest))
        sftp.put(str(path), dest)
        n += 1
    print(f"  subidos {n} archivos")
    sftp.close()

    print("== aplicar SQL ==")
    run(
        ssh,
        r"""
set -e
SQLCMD=$(docker exec polleria-sql bash -c 'ls /opt/mssql-tools*/bin/sqlcmd 2>/dev/null | head -1')
PASS=$(grep -E '^DB_PASSWORD=' /opt/polleria/api/.env | head -1 | cut -d= -f2-)
docker cp /opt/polleria/database/32_Orders_Eliminado.sql polleria-sql:/tmp/32.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$PASS" -C -I -d Polleria -i /tmp/32.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$PASS" -C -d Polleria -Q "SET NOCOUNT ON; SELECT definition FROM sys.check_constraints WHERE name=N'CK_Orders_Status';"
""",
        timeout=120,
    )

    print("== build + restart API ==")
    run(
        ssh,
        "cd /opt/polleria/api && node node_modules/typescript/bin/tsc -p tsconfig.json",
        timeout=240,
    )
    run(ssh, "pm2 restart polleria-api --update-env")
    run(ssh, "sleep 2 && curl -sS http://127.0.0.1:3080/health")
    ssh.close()
    print("DEPLOY_OK")


if __name__ == "__main__":
    main()
