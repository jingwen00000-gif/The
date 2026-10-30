#!/usr/bin/env python3
"""Merge company packs into app/builtin.js (built-in company profiles + their price catalogues)."""
import json, sys, pathlib, hashlib
root = pathlib.Path(__file__).parent
packs = sys.argv[1:] or ['/home/claude/fps/out/FPS.ftpack', '/home/claude/co2/out/Precision_Premium.ftpack']
cos, items, sup = [], [], {}
for p in packs:
    o = json.load(open(p, encoding='utf-8'))
    cos += o['companies']; items += o['catalog']['items']; sup.update(o['catalog']['sup'])
body = json.dumps({'companies': cos, 'catalog': {'items': items, 'sup': sup}}, ensure_ascii=False, separators=(',', ':'))
ver = hashlib.sha1(body.encode()).hexdigest()[:10]
out = 'window.FT_BUILTIN=' + json.dumps({'ver': ver, **json.loads(body)}, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';\n'
(root / 'app/builtin.js').write_text(out, encoding='utf-8')
print('builtin.js', len(out) // 1024, 'KB', 'ver', ver, 'companies', [c['id'] for c in cos], 'items', len(items))
