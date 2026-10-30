#!/usr/bin/env python3
"""Build the single-file web edition (for phones / any browser) from app/index.html.

    python3 make_web.py [out.html]              complete page: open it straight from disk on any device
    python3 make_web.py --fragment [out.html]   body-only fragment for a host that adds its own <html>/<head>
                                                (e.g. a Claude artifact); still starts with <meta charset="utf-8">

The page must declare UTF-8 in its first bytes: a browser opening a local file without it (Safari, Firefox,
phone browsers) reads the Chinese text as windows-1252 and the main script fails to parse.
"""
import re, pathlib, sys
root = pathlib.Path(__file__).parent
args = sys.argv[1:]
fragment = '--fragment' in args
args = [a for a in args if a != '--fragment']
s = (root / 'app/index.html').read_text(encoding='utf-8')
for f, tag in [('builtin.js', '<script src="builtin.js"></script>'), ('pdf.js', '<script src="pdf.js"></script>'), ('pdf.worker.js', '<!--PDFWORKER-->')]:
    js = (root / 'app' / f).read_text(encoding='utf-8').replace('</script', '<\\/script')
    assert s.count(tag) == 1, f
    s = s.replace(tag, '<script>' + js + '</script>')
if fragment:
    s = re.sub(r'<!doctype html>\s*', '', s, flags=re.I)
    s = re.sub(r'<html[^>]*>\s*', '', s, count=1)
    s = s.replace('</html>', '')
    s = re.sub(r'<head>\s*', '', s, count=1)
    s = s.replace('</head>', '', 1)
    s = re.sub(r'<body[^>]*>', '', s, count=1)
    s = s.replace('</body>', '')
    s = re.sub(r'<meta charset="[^"]*">\s*', '', s, count=1)
    s = re.sub(r'<meta name="viewport"[^>]*>\s*', '', s, count=1)
    s = re.sub(r'<title>.*?</title>\s*', '', s, count=1, flags=re.S)
    s = '<meta charset="utf-8">\n<title>FireTake</title>\n' + s
else:
    head = s[:1024].lower()
    assert head.startswith('<!doctype html>') and '<meta charset="utf-8">' in head, 'app/index.html must start with doctype + charset'
out = pathlib.Path(args[0] if args else root / 'firetake-web.html')
# complete page: UTF-8 byte-order mark too, the strongest encoding signal for a file opened from disk
out.write_text(s, encoding='utf-8' if fragment else 'utf-8-sig')
print('wrote', out, len(s), '(fragment)' if fragment else '(complete page)')
