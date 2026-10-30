import json,sys; d=json.load(sys.stdin)
for k in ('pdf','img'):
  r=d[k]; print(k,{x:r[x] for x in ('truth','found','tp','fp','missedBy','thr','ms')}); a=json.loads(r['all']); [print('  ',t,v[:12]) for t,v in a.items()]
print(d['text'])
