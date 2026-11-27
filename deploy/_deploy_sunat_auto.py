"""Despliega únicamente el seguimiento SUNAT ya compilado, con respaldo y reversión."""
from __future__ import annotations

import getpass
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import paramiko

PROJECT = Path(__file__).resolve().parents[1]
FILES = (
    "src/index.ts", "src/realtime.ts", "src/lib/emision.ts",
    "dist/index.js", "dist/realtime.js", "dist/lib/emision.js",
)
BASELINES = {
    "src/index.ts": "0b682805a6f4d66f03cf567c8007c58a17ff65b7b8afb908fe1ed2eca9124eed",
    "src/realtime.ts": "2dda29f82adb8e1eeaae4d07189d571f3679e86206a2eb4b74b6c31a62727c25",
    "src/lib/emision.ts": "3869c0220e77f154010bc1c0f9754350dbdc56ae2671ccfda56377c1380fc2d3",
}


def main():
    expected = {name: hashlib.sha256((PROJECT / "api" / name).read_bytes()).hexdigest() for name in FILES}
    release = "sunat-auto-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stage = "/opt/polleria/releases/" + release
    backup = "/opt/polleria/backups/" + release
    ssh = paramiko.SSHClient()
    ssh.load_host_keys("/private/tmp/polleria-sunat-known-hosts")
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect("116.203.70.104", username="root", password=getpass.getpass("SSH password: "),
                timeout=20, allow_agent=False, look_for_keys=False)
    try:
        with ssh.open_sftp() as sftp:
            for name in FILES:
                remote = stage + "/" + name
                directory = ""
                for part in remote.rsplit("/", 1)[0].strip("/").split("/"):
                    directory += "/" + part
                    try:
                        sftp.stat(directory)
                    except FileNotFoundError:
                        sftp.mkdir(directory)
                sftp.put(str(PROJECT / "api" / name), remote)
        script = "\n".join([
            "import hashlib,json,shutil,subprocess,time,urllib.request",
            "from pathlib import Path",
            "root=Path('/opt/polleria/api')",
            "stage=Path(" + repr(stage) + ")",
            "backup=Path(" + repr(backup) + ")",
            "expected=" + repr(expected),
            "baselines=" + repr(BASELINES),
            "def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()",
            "for name, checksum in baselines.items():",
            "    if digest(root/name) != checksum: raise RuntimeError('El servidor cambió: '+name)",
            "for name, checksum in expected.items():",
            "    if digest(stage/name) != checksum: raise RuntimeError('Carga incompleta: '+name)",
            "    if not (root/name).is_file(): raise RuntimeError('Falta archivo instalado: '+name)",
            "    if name.endswith('.js'): subprocess.run(['node','--check',str(stage/name)],check=True,timeout=15)",
            "for name in expected:",
            "    destination=backup/name",
            "    destination.parent.mkdir(parents=True,exist_ok=True)",
            "    shutil.copy2(root/name,destination)",
            "try:",
            "    for name in expected:",
            "        temporary=(root/name).with_name((root/name).name+'.sunat-auto.tmp')",
            "        shutil.copy2(stage/name,temporary)",
            "        temporary.replace(root/name)",
            "    subprocess.run(['pm2','restart','polleria-api'],check=True,timeout=30,stdout=subprocess.DEVNULL)",
            "    for attempt in range(15):",
            "        try:",
            "            with urllib.request.urlopen('http://127.0.0.1:3080/health',timeout=3) as response: health=json.load(response)",
            "            if health.get('ok') and health.get('db'): break",
            "        except Exception: pass",
            "        time.sleep(1)",
            "    else: raise RuntimeError('API sin respuesta saludable')",
            "    for name, checksum in expected.items():",
            "        if digest(root/name) != checksum: raise RuntimeError('Verificación fallida: '+name)",
            "    print(json.dumps({'deployed':True,'files':len(expected),'backup':str(backup),'health':health}))",
            "except Exception:",
            "    for name in expected: shutil.copy2(backup/name,root/name)",
            "    subprocess.run(['pm2','restart','polleria-api'],check=True,timeout=30,stdout=subprocess.DEVNULL)",
            "    raise",
        ])
        stdin, stdout, stderr = ssh.exec_command("python3 -", timeout=90)
        stdin.write(script + "\n")
        stdin.channel.shutdown_write()
        output = stdout.read().decode()
        errors = stderr.read().decode()
        status = stdout.channel.recv_exit_status()
        if output.strip():
            print(output.strip())
        if errors.strip():
            print(errors.strip())
        if status:
            raise SystemExit(status)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
