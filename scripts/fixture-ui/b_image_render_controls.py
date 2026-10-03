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


def archive_hierarchy(tree, directory, label):
 """Archive only the owned fictional image screen, without overwriting evidence."""
 import os,re,copy,xml.etree.ElementTree as ET
 from pathlib import Path
 assert label=='authorized-B-images-tab','Only the bound image-screen archive is allowed'
 directory=Path(directory);st=directory.lstat()
 assert directory.is_absolute() and directory.is_dir() and not directory.is_symlink()
 assert st.st_uid==os.getuid() and st.st_mode&0o077==0
 assert directory.resolve()==directory
 redacted=copy.deepcopy(tree)
 for node in redacted.iter('node'):
  for field in ['text','content-desc']:
   node.set(field,re.sub(r'\b(?:91)?\d{10}\b|\b\d{6}\b','[private digits]',node.get(field,'')))
 path=directory/(label+'.xml')
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as output:output.write(ET.tostring(redacted,encoding='unicode'))
 return path
