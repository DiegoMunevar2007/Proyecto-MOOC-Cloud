#!/usr/bin/env python3
"""Grafica muestras reales del observador; no interpola muestras fallidas."""
import argparse
from datetime import datetime
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    rows = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
    if not rows:
        p.error('No hay muestras')
    times = [datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00')) for row in rows]
    fig, axes = plt.subplots(2, 1, figsize=(11, 7), sharex=True)
    for ax, role in zip(axes, ('api', 'worker')):
        counts = []; running = []; desired = []
        for row in rows:
            instances = row.get(role + '_instances')
            counts.append(len(instances) if isinstance(instances, list) else float('nan'))
            running.append(sum(i.get('instanceStatus') == 'RUNNING' for i in instances) if isinstance(instances, list) else float('nan'))
            autoscaler = row.get(role + '_autoscaler', {})
            desired.append(autoscaler.get('recommendedSize', float('nan')))
        ax.step(times, counts, where='post', label='Instancias en MIG', color='#2563eb')
        ax.step(times, running, where='post', label='RUNNING (no implica HEALTHY)', linestyle=':', color='#059669')
        ax.step(times, desired, where='post', label='Recomendación autoscaler', linestyle='--', color='#b45309')
        ax.set(title=role.upper(), ylabel='Instancias', yticks=[0, 1, 2, 3, 4], ylim=(-.1, 4.2))
        ax.legend(loc='upper left', fontsize=8); ax.grid(alpha=.2)
    axes[-1].xaxis.set_major_formatter(mdates.DateFormatter('%H:%M', tz=times[0].tzinfo))
    axes[-1].set_xlabel('Hora UTC; huecos = error o ausencia de datos')
    fig.suptitle('Elasticidad observada — ' + args.input.parent.name)
    fig.tight_layout(); args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists(): p.error('El archivo de salida ya existe; conservar evidencia anterior')
    fig.savefig(args.output, dpi=180); plt.close(fig)

if __name__ == '__main__': main()
