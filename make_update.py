#!/usr/bin/env python3
"""Build a FireTake update package (.ftupd) and latest.json.

Usage:  python3 make_update.py https://your-host/path/
Upload both output files to that https folder, then put
https://your-host/path/latest.json into FireTake → Settings → Update address.
"""
import base64, hashlib, json, sys, pathlib
root = pathlib.Path(__file__).parent
ver = json.load(open(root / 'package.json'))['version']
files = {}
for rel in ['main.js', 'preload.js', 'package.json', 'icon.png', 'app/index.html', 'app/builtin.js', 'app/pdf.js', 'app/pdf.worker.js']:
    files[rel] = base64.b64encode((root / rel).read_bytes()).decode()
bundle = json.dumps({'app': 'FireTake', 'version': ver, 'files': files}).encode()
name = f'FireTake-update-{ver}.ftupd'
(root / name).write_bytes(bundle)
base = (sys.argv[1] if len(sys.argv) > 1 else 'https://example.com/firetake/').rstrip('/') + '/'
latest = {'version': ver, 'notes': f'FireTake {ver}', 'bundle': base + name, 'sha256': hashlib.sha256(bundle).hexdigest()}
(root / 'latest.json').write_text(json.dumps(latest, indent=2))
print('wrote', name, 'and latest.json'); print(json.dumps(latest, indent=2))
