#!/usr/bin/env python3
"""Prepara una cuenta administrativa local por stdin y ejecuta el recorrido UI.
Solo para contenedores locales. En cloud usar las credenciales del canal privado.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import uuid

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--container", default="mooc-local-backend-1")
p.add_argument("--playwright", help="Ruta al ejecutable Playwright, alternativa a pnpm exec")
args = p.parse_args()
video = Path(os.environ.get("E2E_VIDEO_PATH", str(Path(__file__).resolve().parents[1] / "capacity-planning/media/p1-small.mp4")))
if os.environ.get("E2E_MEDIA") != "false" and (not video.exists() or video.stat().st_size < 1024):
    raise SystemExit("Falta el MP4 real: descarga Git LFS o configura E2E_VIDEO_PATH con un video sintético. Un puntero LFS no es contenido multimedia.")
username = "e2e-admin-" + uuid.uuid4().hex[:10]
password = secrets.token_urlsafe(24)
subprocess.run(["docker", "exec", "-i", args.container, "./main", "provision-admin"], input=json.dumps({"username": username, "email": username + "@test.invalid", "password": password}), text=True, check=True, stdout=subprocess.DEVNULL)
env = dict(os.environ, E2E_ADMIN_USER=username, E2E_ADMIN_PASSWORD=password)
command = [args.playwright, "test"] if args.playwright else ["pnpm", "exec", "playwright", "test"]
raise SystemExit(subprocess.run(command, cwd=Path(__file__).resolve().parents[1] / "frontend", env=env).returncode)
