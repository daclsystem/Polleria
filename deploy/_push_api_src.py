"""Sube api/src, compila y reinicia PM2. Sin SQL."""
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


def main() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30, allow_agent=False, look_for_keys=False)
    sftp = ssh.open_sftp()
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
        print(f"  put {rel}")
    print(f"subidos {n}")
    sftp.close()
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
    if not PASS:
        sys.exit("POLL_SSH_PASS vacía")
    main()
