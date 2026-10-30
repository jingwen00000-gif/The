#!/usr/bin/env python3
"""Build the single-page web edition (for phones / any browser) from app/index.html."""
import re, pathlib, sys
root = pathlib.Path(__file__).parent
s = (root / 'app/index.html').read_text(encoding='utf-8')
for f, tag in [('builtin.js', '<script src="builtin.js"></script>'), ('pdf.js', '<script src="pdf.js"></script>'), ('pdf.worker.js', '<!--PDFWORKER-->')]:
    js = (root / 'app' / f).read_text(encoding='utf-8').replace('</script', '<\\/script')
    assert s.count(tag) == 1, f
    s = s.replace(tag, '<script>' + js + '</script>')
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
s = '<title>FireTake</title>\n' + s
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / 'firetake-web.html')
out.write_text(s, encoding='utf-8')
print('wrote', out, len(s))
