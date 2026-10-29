#!/usr/bin/env python3
"""Bootstrap/export de SonarQube efímero; no requiere una cuenta cloud.
Los reportes contienen hallazgos y código, nunca el token de análisis.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

URL = os.environ.get("SONAR_HOST_URL", "http://localhost:19090").rstrip("/")
KEY = os.environ.get("SONAR_PROJECT_KEY", "mooc-cloud")
OUT = Path(os.environ.get("QUALITY_OUTPUT", "artifacts/quality"))

def request(path, params=None, token=None, post=False, basic=None):
    body = urlencode(params or {}).encode() if post else None
    target = URL + path + (("?" + urlencode(params)) if params and not post else "")
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if basic:
        headers["Authorization"] = "Basic " + base64.b64encode(basic.encode()).decode()
    with urlopen(Request(target, data=body, headers=headers), timeout=60) as response:
        data = response.read().decode()
        try:
            return json.loads(data)
        except json.JSONDecodeError:
            return data

def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

def bootstrap():
    for _ in range(90):
        try:
            if request("/api/system/status").get("status") == "UP":
                break
        except Exception:
            pass
        time.sleep(5)
    else:
        raise SystemExit("SonarQube no arrancó en 450 segundos")
    password = secrets.token_urlsafe(32)
    request("/api/users/change_password", {"login": "admin", "previousPassword": "admin", "password": password}, post=True, basic="admin:admin")
    token = request("/api/user_tokens/generate", {"name": "ci-analysis"}, post=True, basic="admin:" + password)["token"]
    request("/api/projects/create", {"project": KEY, "name": "MOOC Cloud"}, token=token, post=True)
    # Solo se guarda en un archivo temporal privado de esta ejecución.
    destination = Path(os.environ["SONAR_ENV_FILE"])
    destination.touch(mode=0o600, exist_ok=True)
    destination.write_text("SONAR_TOKEN=" + token + "\n")
    if os.environ.get("GITHUB_ACTIONS"):
        print("::add-mask::" + token)
    print("SonarQube preparado; credencial efímera guardada sin imprimirla.")

def export():
    token = os.environ["SONAR_TOKEN"]
    # Esperar el análisis exacto enviado por el scanner, no otro anterior.
    task_file = Path(os.environ.get("SONAR_TASK_FILE", ".scannerwork/report-task.txt"))
    task = dict(line.split("=", 1) for line in task_file.read_text().splitlines() if "=" in line)
    for _ in range(90):
        status = request("/api/ce/task", {"id": task["ceTaskId"]}, token)["task"]
        if status["status"] in ("SUCCESS", "FAILED", "CANCELED"):
            break
        time.sleep(3)
    write("task.json", status)
    if status["status"] != "SUCCESS":
        raise SystemExit("Análisis incompleto: " + status["status"])
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], text=True).strip())
    write("manifest.json", {"commit": revision, "dirty": dirty, "date_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "server_version": request("/api/server/version", token=token), "project": KEY, "pipeline": os.environ.get("GITHUB_SERVER_URL", "https://github.com") + "/" + os.environ.get("GITHUB_REPOSITORY", "local") + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", "local"), "analysis_id": status["analysisId"]})
    metrics = request("/api/measures/component", {"component": KEY, "metricKeys": "duplicated_lines_density,sqale_rating,sqale_index,ncloc,coverage,bugs,vulnerabilities,code_smells,ncloc_language_distribution"}, token)
    write("measures.json", metrics)
    write("profiles.json", request("/api/qualityprofiles/search", {"project": KEY}, token))
    write("gate.json", request("/api/qualitygates/project_status", {"analysisId": status["analysisId"]}, token))
    for endpoint, key, name in [("issues", "issues", "issues.json"), ("hotspots", "hotspots", "hotspots.json")]:
        items = []; page = 1
        while True:
            params = {"componentKeys" if endpoint == "issues" else "project": KEY, "ps": 500, "p": page}
            result = request(f"/api/{endpoint}/search", params, token)
            items.extend(result[key]); total = result["paging"]["total"]
            if len(items) >= total:
                break
            page += 1
            if page > 20:
                raise SystemExit("Más de 10.000 hallazgos: exportar por componente antes de cerrar la entrega")
        write(name, items)
    measures = {v["metric"]: float(v["value"]) for v in metrics["component"]["measures"] if "value" in v and v["metric"] != "ncloc_language_distribution"}
    required = {"duplicated_lines_density", "sqale_rating", "sqale_index"}
    if not required.issubset(measures):
        raise SystemExit("Faltan métricas obligatorias: " + str(required - measures.keys()))
    languages = next((v.get("value", "") for v in metrics["component"]["measures"] if v["metric"] == "ncloc_language_distribution"), "")
    if measures.get("ncloc", 0) <= 0 or "go=" not in languages or "ts=" not in languages:
        raise SystemExit("Análisis incompleto: debe incluir líneas de Go y TypeScript")
    passed = measures["duplicated_lines_density"] <= 20 and measures["sqale_rating"] <= 3
    rating = "ABCDE"[int(measures["sqale_rating"]) - 1]
    summary = f"Duplicación: {measures['duplicated_lines_density']}%\nMantenibilidad: {rating}\nDeuda estimada: {measures['sqale_index']} minutos\nUmbrales entrega 3: {'cumple' if passed else 'NO cumple'}\nCommit: {revision}\nCambios sin commit: {dirty}\n"
    (OUT / "summary.txt").write_text(summary)
    print(summary)
    if not passed:
        raise SystemExit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("command", choices=["bootstrap", "export"])
    args = parser.parse_args()
    {"bootstrap": bootstrap, "export": export}[args.command]()
