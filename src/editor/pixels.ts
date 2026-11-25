// Portable pixel operations from LumiSwarm alpha.9.4. No host or DOM dependencies.
export type EditSelectionMode = 'replace' | 'add' | 'subtract';
export const EDIT_MAX_PIXELS = 16_777_216;
export const EDIT_MAX_SIDE = 8192;
export function editWand(pixels: Uint8ClampedArray, w: number, h: number, x: number, y: number, tolerance: number, contiguous: boolean): Uint8Array {
  const n=w*h, mask=new Uint8Array(n), start=y*w+x
  if(x<0||x>=w||y<0||y>=h||!pixels[start*4+3]!) return mask
  const r=pixels[start*4]!,g=pixels[start*4+1]!,b=pixels[start*4+2]!,a=pixels[start*4+3]!
  const threshold=Math.pow(Math.max(0,Math.min(100,tolerance))*2.55,2)*3
  const match=(i:number)=>{const k=i*4;return pixels[k+3]!>0 && Math.pow(pixels[k]!-r,2)+Math.pow(pixels[k+1]!-g,2)+Math.pow(pixels[k+2]!-b,2)<=threshold && Math.abs(pixels[k+3]!-a)<=Math.max(32,tolerance*2.55)}
  if(!contiguous){for(let i=0;i<n;i++)if(match(i))mask[i]=255;return mask}
  const queue=new Int32Array(n);let read=0,write=0
  const visit=(i:number)=>{if(!mask[i]!&&match(i)){mask[i]=255;queue[write++]=i}}
  visit(start)
  while(read<write){const i=queue[read++]!,col=i%w;if(col>0)visit(i-1);if(col<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<n-w)visit(i+w)}
  return mask
}
export function editCombineSelection(current: Uint8Array, next: Uint8Array, mode: EditSelectionMode): Uint8Array {
  if(mode==="replace")return next
  const out=new Uint8Array(current.length)
  for(let i=0;i<out.length;i++)out[i]=mode==="add"?Math.max(current[i]!,next[i]!):Math.max(0,current[i]!-next[i]!)
  return out
}
export function editMorph(mask: Uint8Array,w:number,h:number,grow:boolean):Uint8Array {
  const out=new Uint8Array(mask.length)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;let v=mask[i]!
    for(const q of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])v=grow?Math.max(v,q<0?0:mask[q]!):Math.min(v,q<0?0:mask[q]!)
    out[i]=v
  }return out
}
export function editFeather(mask: Uint8Array,w:number,h:number,radius:number):Uint8Array {
  const r=Math.max(0,Math.min(12,Math.round(radius)));if(!r)return mask.slice()
  const tmp=new Float32Array(mask.length),out=new Uint8Array(mask.length),span=2*r+1
  for(let y=0;y<h;y++){let sum=0;for(let x=0;x<=Math.min(r,w-1);x++)sum+=mask[y*w+x]!;for(let x=0;x<w;x++){tmp[y*w+x]=sum/span;if(x-r>=0)sum-=mask[y*w+x-r]!;if(x+r+1<w)sum+=mask[y*w+x+r+1]!}}
  for(let x=0;x<w;x++){let sum=0;for(let y=0;y<=Math.min(r,h-1);y++)sum+=tmp[y*w+x]!;for(let y=0;y<h;y++){out[y*w+x]=Math.round(sum/span);if(y-r>=0)sum-=tmp[(y-r)*w+x]!;if(y+r+1<h)sum+=tmp[(y+r+1)*w+x]!}}
  return out
}
export function editClearPixels(pixels:Uint8ClampedArray,mask:Uint8Array):void {for(let i=0;i<mask.length;i++)pixels[i*4+3]=Math.round(pixels[i*4+3]!*(255-mask[i]!)/255)}
export function editDespill(pixels:Uint8ClampedArray,w:number,h:number,mask:Uint8Array,channel:"green"|"blue",strength:number):number {
  let changed=0
  const selected=mask.some(v=>v>0),c=channel==="green"?1:2,other=channel==="green"?2:1
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,k=i*4;if(!pixels[k+3]!||(selected&&!mask[i]!))continue
    // Without selection, restrict to the alpha boundary (including internal holes).
    if(!selected&&pixels[k+3]! ===255){let edge=false;for(let dy=-2;dy<=2&&!edge;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h||pixels[(yy*w+xx)*4+3]!<240){edge=true;break}}if(!edge)continue}
    const excess=Math.max(0,pixels[k+c]!-Math.max(pixels[k]!,pixels[k+other]!));const amount=Math.round(excess*strength*(selected?mask[i]!/255:1));if(amount){pixels[k+c]=pixels[k+c]!-amount;changed++}
  }
  return changed
}

// Bounded inverse warp with premultiplied bilinear sampling. Alpha is warped
// together with color, preventing dark halos at transparent edges.
export function editPushPixels(pixels:Uint8ClampedArray,w:number,h:number,cx:number,cy:number,dx:number,dy:number,r:number,strength:number):void {
  if(r<=0||strength<=0||(!dx&&!dy))return
  const src=pixels.slice(),d=Math.hypot(dx,dy),factor=Math.min(1,r/3/d)*Math.min(1,strength)
  for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(h,Math.ceil(cy+r+1));y++)for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(w,Math.ceil(cx+r+1));x++){
    const q=Math.hypot(x-cx,y-cy)/r;if(q>=1)continue
    const weight=(1-q*q)**2*factor,sx=Math.max(0,Math.min(w-1,x-dx*weight)),sy=Math.max(0,Math.min(h-1,y-dy*weight))
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=sx-x0,fy=sy-y0
    const taps: [number,number][]=[[(y0*w+x0)*4,(1-fx)*(1-fy)],[(y0*w+x1)*4,fx*(1-fy)],[(y1*w+x0)*4,(1-fx)*fy],[(y1*w+x1)*4,fx*fy]]
    const k=(y*w+x)*4;let a=0,rr=0,g=0,b=0
    for(const [i,v] of taps){const av=src[i+3]!*v;a+=av;rr+=src[i]!*av;g+=src[i+1]!*av;b+=src[i+2]!*av}
    pixels[k+3]=a;if(a){pixels[k]=rr/a;pixels[k+1]=g/a;pixels[k+2]=b/a}else{pixels[k]=pixels[k+1]=pixels[k+2]=0}
  }
}

