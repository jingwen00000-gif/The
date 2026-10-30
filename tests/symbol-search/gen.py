import json, math, random, sys
COL=(0,0,0) if len(sys.argv)>1 else (0.8,0,0)
OUT=sys.argv[1] if len(sys.argv)>1 else 'plan'
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3, landscape
random.seed(7)
W,H=landscape(A3)
c=canvas.Canvas(OUT+'.pdf',pagesize=(W,H))
truth=[]
def symA(x,y,ang=0,mir=False,s=1.0,col=None):
    col=col or COL
    c.saveState(); c.translate(x,y); c.rotate(ang)
    if mir: c.scale(-1,1)
    c.scale(s,s); c.setStrokeColorRGB(*col); c.setFillColorRGB(*col); c.setLineWidth(0.6)
    c.circle(0,0,5,stroke=1,fill=0); c.line(-5,0,5,0)
    p=c.beginPath(); p.moveTo(1,1.2); p.lineTo(4,1.2); p.lineTo(2.5,3.6); p.close(); c.drawPath(p,stroke=0,fill=1)
    c.line(5,0,8,0)  # tail
    c.restoreState()
def symB(x,y):  # look-alike: plain circle with a bar
    c.saveState(); c.setStrokeColorRGB(*COL); c.setLineWidth(0.6); c.circle(x,y,5); c.line(x-5,y,x+5,y); c.restoreState()
def symC(x,y):
    c.saveState(); c.setStrokeColorRGB(0,0,0.8); c.setLineWidth(0.6); c.rect(x-5,y-5,10,10); c.line(x-5,y-5,x+5,y+5); c.line(x-5,y+5,x+5,y-5); c.restoreState()
# background walls/grid (grey)
c.setStrokeColorRGB(.55,.55,.55); c.setLineWidth(1.2)
for gx in range(60,1000,110): c.line(gx,60,gx,780)
for gy in range(60,800,90): c.line(60,gy,1000,gy)
# a red pipe
c.setStrokeColorRGB(.8,0,0); c.setLineWidth(1.0); c.line(80,700,980,700)
used=[]
def free(x,y,r=22):
    return all(math.hypot(x-a,y-b)>r for a,b in used)
def place(n,fn,tag):
    k=0
    while k<n:
        x=random.uniform(90,970); y=random.uniform(90,760)
        if abs(y-700)<14 or not free(x,y): continue
        # avoid sitting exactly on grid lines
        if min(abs((x-60)%110),110-abs((x-60)%110))<9 or min(abs((y-60)%90),90-abs((y-60)%90))<9: continue
        used.append((x,y)); fn(x,y); truth.append({'t':tag,'x':x,'y':H-y}); k+=1
place(20,lambda x,y:symA(x,y),'A0')
place(6,lambda x,y:symA(x,y,90),'A90')
place(4,lambda x,y:symA(x,y,37),'A37')
place(4,lambda x,y:symA(x,y,0,True),'Amir')
place(3,lambda x,y:symA(x,y,0,False,1.12),'Ascale')
# on the pipe line
for x in (200,450,800): symA(x,700); used.append((x,700)); truth.append({'t':'Apipe','x':x,'y':H-700})
place(15,symB,'B')
place(10,symC,'C')
# legend + title block on the right
c.setStrokeColorRGB(0,0,0); c.setLineWidth(.8); c.rect(1020,60,150,720)
c.setFont('Helvetica',7)
c.drawString(1030,760,'LEGEND')
symA(1040,740); c.setFillColorRGB(0,0,0); c.drawString(1055,737,'SMOKE DETECTOR'); truth.append({'t':'Aleg','x':1040,'y':H-740})
symC(1040,720); c.setFillColorRGB(0,0,0); c.drawString(1055,717,'MANUAL CALL POINT')
symB(1040,700); c.setFillColorRGB(0,0,0); c.drawString(1055,697,'COLUMN')
c.drawString(1030,100,'SCALE 1:100 @ A3'); c.drawString(1030,90,'DRAWING FS-101')
# text labels for textDetect test
c.drawString(500,120,'2 HR FIRE RATED'); c.drawString(600,120,'EXT WALL'); c.drawString(680,120,'EL 3.200'); c.drawString(300,120,'SD'); c.drawString(340,120,'HR-02'); c.drawString(380,120,'FHR')
c.save()
json.dump({'W':W,'H':H,'truth':truth},open(OUT+'_truth.json','w'))
print('ok',len(truth))
