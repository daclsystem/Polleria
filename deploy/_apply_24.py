"""Aplica 24_Reset en BD Polleria."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("POLL_SSH_HOST", "116.203.70.104")
USER = os.environ.get("POLL_SSH_USER", "root")
PASS = os.environ["POLL_SSH_PASS"]


def main() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30, allow_agent=False, look_for_keys=False)
    sftp = ssh.open_sftp()
    sftp.put(
        os.path.join(os.path.dirname(__file__), "..", "database", "24_Reset_Orders_Customers_Sessions.sql"),
        "/opt/polleria/database/24_Reset_Orders_Customers_Sessions.sql",
    )
    sftp.close()
    cmd = r"""
set -e
SQLCMD=$(docker exec polleria-sql bash -c 'ls /opt/mssql-tools*/bin/sqlcmd 2>/dev/null | head -1')
PASS=$(grep -E '^DB_PASSWORD=' /opt/polleria/api/.env | head -1 | cut -d= -f2-)
docker cp /opt/polleria/database/24_Reset_Orders_Customers_Sessions.sql polleria-sql:/tmp/24.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$PASS" -C -I -d Polleria -i /tmp/24.sql
docker exec polleria-sql "$SQLCMD" -S localhost -U sa -P "$PASS" -C -d Polleria -Q "SET NOCOUNT ON; SELECT (SELECT COUNT(*) FROM dbo.Orders) AS pedidos, (SELECT COUNT(*) FROM dbo.Customers) AS clientes;"
"""
    _, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    print(out)
    print(err)
    ssh.close()
    if code != 0:
        sys.exit(f"FALLO {code}")
    print("SQL_OK")


if __name__ == "__main__":
    main()
