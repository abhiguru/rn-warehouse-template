"""Recognize the exact fictional 4x4 checkerboard in an owned screenshot."""
import io
import PIL
from PIL import Image
COLORS=((35,105,210),(235,160,40))
def near(pixel,color):return all(abs(a-b)<=8 for a,b in zip(pixel,color))
def checkerboard_png(data):
 assert data.startswith(b'\x89PNG\r\n\x1a\n')
 im=Image.open(io.BytesIO(data));im.load();assert im.size==(720,1280);im=im.convert('RGB')
 points=[(x,y) for y in range(200,1200) for x in range(720) if any(near(im.getpixel((x,y)),c) for c in COLORS)]
 assert points,'No fixture image colors';xs,ys=zip(*points);left,top,right,bottom=min(xs),min(ys),max(xs)+1,max(ys)+1;width,height=right-left,bottom-top
 assert 64<=width<=300 and abs(width-height)<=6,'Unique square image required'
 for row in range(4):
  for col in range(4):
   x=left+int((col+.5)*width/4);y=top+int((row+.5)*height/4)
   assert near(im.getpixel((x,y)),COLORS[(row+col)%2]),'Exact checkerboard samples required'
 return {'bounds':[left,top,right,bottom],'checkerboardSamples':16,'dimensions':[720,1280],'decoder':'Pillow','decoderVersion':PIL.__version__}
