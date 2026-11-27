"""Publica únicamente la descarga de comprobantes, con verificación y reversión."""
from __future__ import annotations

import getpass
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import paramiko

PROJECT = Path(__file__).resolve().parents[1]
FILES = ("src/routes/config.ts", "dist/routes/config.js",
         "src/lib/comprobanteDescarga.ts", "dist/lib/comprobanteDescarga.js")
BASELINE = "aab518a7dc09e138deda8b2c8933e7016fb4684a57cc40bcb34fe635ecdd9550"


def main():
    expected = {name: hashlib.sha256((PROJECT / "api" / name).read_bytes()).hexdigest() for name in FILES}
    release = "comprobantes-descarga-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
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
            "import hashlib,json,shutil,subprocess,time,urllib.request,urllib.error",
            "from pathlib import Path",
            "root=Path('/opt/polleria/api')",
            "stage=Path(" + repr(stage) + ")",
            "backup=Path(" + repr(backup) + ")",
            "expected=" + repr(expected),
            "def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()",
            "if digest(root/'src/routes/config.ts') != " + repr(BASELINE) + ": raise RuntimeError('La ruta instalada cambió; despliegue cancelado')",
            "for name, checksum in expected.items():",
            "    if digest(stage/name) != checksum: raise RuntimeError('Carga incompleta: '+name)",
            "    if 'comprobanteDescarga' in name and (root/name).exists(): raise RuntimeError('El módulo de descarga ya existe; revisar antes de publicar')",
            "    if name.endswith('.js'): subprocess.run(['node','--check',str(stage/name)],check=True,timeout=15)",
            "existed={name:(root/name).exists() for name in expected}",
            "for name in expected:",
            "    if existed[name]:",
            "        destination=backup/name",
            "        destination.parent.mkdir(parents=True,exist_ok=True)",
            "        shutil.copy2(root/name,destination)",
            "try:",
            "    for name in expected:",
            "        temporary=(root/name).with_name((root/name).name+'.descarga.tmp')",
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
            "    request=urllib.request.Request('http://127.0.0.1:3080/api/config/comprobantes/descargar',data=b'{}',headers={'Content-Type':'application/json'})",
            "    try: urllib.request.urlopen(request,timeout=3); raise RuntimeError('La descarga permitió acceso sin sesión')",
            "    except urllib.error.HTTPError as error:",
            "        if error.code != 401: raise RuntimeError('No se pudo verificar la ruta protegida')",
            "    for name, checksum in expected.items():",
            "        if digest(root/name) != checksum: raise RuntimeError('Verificación fallida: '+name)",
            "    print(json.dumps({'deployed':True,'files':len(expected),'backup':str(backup),'health':health,'downloadAuth':401}))",
            "except Exception:",
            "    for name in expected:",
            "        if existed[name]: shutil.copy2(backup/name,root/name)",
            "        elif (root/name).exists(): (root/name).unlink()",
            "    subprocess.run(['pm2','restart','polleria-api'],check=True,timeout=30,stdout=subprocess.DEVNULL)",
            "    raise",
        ])
        stdin, stdout, stderr = ssh.exec_command("python3 -", timeout=90)
        stdin.write(script + "\n")
        stdin.channel.shutdown_write()
        output, errors = stdout.read().decode(), stderr.read().decode()
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
