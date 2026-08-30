"""Solo rebuild + restart PM2 (src ya está en el VPS)."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("POLL_SSH_HOST", "116.203.70.104")
USER = os.environ.get("POLL_SSH_USER", "root")
PASS = os.environ["POLL_SSH_PASS"]


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 240) -> str:
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


def main() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30, allow_agent=False, look_for_keys=False)
    run(
        ssh,
        "cd /opt/polleria/api && ls node_modules/typescript/bin 2>/dev/null; node node_modules/typescript/bin/tsc -p tsconfig.json || (npm install && node node_modules/typescript/bin/tsc -p tsconfig.json)",
        timeout=240,
    )
    run(ssh, "pm2 restart polleria-api --update-env")
    run(ssh, "sleep 2 && curl -sS http://127.0.0.1:3080/health")
    run(ssh, "curl -sS https://apipchifapollerialopez.indevsoft.com/api/delivery/ranges")
    ssh.close()
    print("DEPLOY_OK")


if __name__ == "__main__":
    if not PASS:
        sys.exit("POLL_SSH_PASS vacía")
    main()
