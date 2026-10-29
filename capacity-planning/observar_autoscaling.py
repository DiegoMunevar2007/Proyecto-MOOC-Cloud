#!/usr/bin/env python3
"""Lecturas de GCP para la línea de tiempo de ambos grupos; no crea ni retira VMs."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time


def collect(args, label, command):
    try:
        result = subprocess.run(["gcloud", *command, "--project", args.project, "--format=json"], text=True, capture_output=True, timeout=40)
        if result.returncode:
            return label, {"error": result.stderr.strip(), "exit_code": result.returncode}
        return label, json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        return label, {"error": str(error)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--project", required=True); p.add_argument("--zone", default="us-central1-a")
    p.add_argument("--prefix", default="mooc"); p.add_argument("--duration", type=int, default=2700)
    p.add_argument("--interval", type=int, default=30); p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    if args.duration <= 0 or args.interval < 5: p.error("duration > 0 e interval >= 5")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusivo: nunca sobrescribir la evidencia de una corrida anterior.
    with args.output.open("x") as stream, ThreadPoolExecutor(max_workers=5) as pool:
        end = time.monotonic() + args.duration
        while time.monotonic() < end:
            start = time.monotonic(); now = datetime.now(timezone.utc).isoformat()
            queries = []
            for role in ["api", "worker"]:
                queries.extend([
                    (role + "_instances", ["compute", "instance-groups", "managed", "list-instances", f"{args.prefix}-{role}-mig", "--zone", args.zone]),
                    (role + "_autoscaler", ["compute", "autoscalers", "describe", f"{args.prefix}-{role}-autoscaler", "--zone", args.zone]),
                ])
            queries.append(("backends", ["compute", "backend-services", "get-health", f"{args.prefix}-api-backend", "--global"]))
            values = dict(pool.map(lambda query: collect(args, *query), queries))
            stream.write(json.dumps({"timestamp": now, "sample_duration_sec": round(time.monotonic()-start, 3), **values}) + "\n"); stream.flush()
            time.sleep(max(0, min(args.interval - (time.monotonic()-start), end-time.monotonic())))

if __name__ == "__main__": main()
