#!/usr/bin/env python3
"""Concilia el manifiesto de cargas aceptadas con el estado final de cada recurso.
No persiste tokens ni URLs firmadas. Un resultado incompleto sale con código 1.
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    base = os.environ["BASE_URL"].rstrip("/"); token = os.environ["ADMIN_TOKEN"]
    accepted = [json.loads(line) for line in args.manifest.read_text().splitlines() if line.startswith('{"event":"upload_accepted"')]
    if not accepted: raise SystemExit("El manifiesto no contiene cargas aceptadas")
    rows = []
    for job in accepted:
        try:
            req = Request(f"{base}/api/v1/resources/{job['resource_id']}", headers={"Authorization": "Bearer " + token})
            with urlopen(req, timeout=30) as response: resource = json.load(response)["resource"]
            same = resource["object_key"] == job["object_key"]
            ready = resource["scan_status"] == "clean" and resource["processing_status"] == "ready" and bool(resource.get("hls_key"))
            state = "available" if same and ready else "failed" if resource["processing_status"] == "failed" else "incomplete"
            rows.append({**job, "final_state": state, "same_object": same, "scan_status": resource["scan_status"], "processing_status": resource["processing_status"], "hls_key": resource.get("hls_key")})
        except Exception as error:
            rows.append({**job, "final_state": "unreadable", "error": str(error)})
    ids = Counter(row["resource_id"] for row in rows)
    report = {"accepted": len(rows), "states": dict(Counter(row["final_state"] for row in rows)), "duplicate_resource_ids": [key for key, n in ids.items() if n > 1], "jobs": rows,
              "limitation": "El estado final no prueba ausencia de ejecuciones duplicadas: correlacionar IDs con logs del worker y objetos derivados."}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x") as target: json.dump(report, target, indent=2)
    print(json.dumps({"accepted": report["accepted"], "states": report["states"]}))
    if report["states"].get("available", 0) != len(rows) or report["duplicate_resource_ids"]: raise SystemExit(1)

if __name__ == "__main__": main()
