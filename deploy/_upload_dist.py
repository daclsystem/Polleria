"""Sube api/dist compilado y reinicia PM2."""
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
LOCAL_DIST = ROOT / "api" / "dist"
REMOTE_DIST = "/opt/polleria/api/dist"


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 60) -> str:
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
    if not LOCAL_DIST.is_dir():
        sys.exit("Falta api/dist")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30, allow_agent=False, look_for_keys=False)
    sftp = ssh.open_sftp()
    n = 0
    for path in LOCAL_DIST.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(LOCAL_DIST).as_posix()
        dest = posixpath.join(REMOTE_DIST, rel)
        acc = ""
        for p in posixpath.dirname(dest).strip("/").split("/"):
            acc += "/" + p
            try:
                sftp.stat(acc)
            except OSError:
                sftp.mkdir(acc)
        sftp.put(str(path), dest)
        n += 1
        print(f"  put {rel}")
    sftp.close()
    print(f"subidos {n} archivos dist")
    run(ssh, "pm2 restart polleria-api --update-env")
    run(ssh, "sleep 2 && curl -sS http://127.0.0.1:3080/health")
    run(ssh, "curl -sS -o /dev/null -w '%{http_code}' https://apipchifapollerialopez.indevsoft.com/api/delivery/ranges")
    print()
    ssh.close()
    print("DEPLOY_OK")


if __name__ == "__main__":
    main()
