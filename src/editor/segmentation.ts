/** Convert a segmentation image into the existing soft selection mask. Never mutate source pixels. */
export function segmentationMask(rgba:Uint8ClampedArray,width:number,height:number,format:'alpha'|'luminance',invert=false):Uint8Array {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||rgba.length!==width*height*4)throw new Error('Segmentation dimensions do not match the canvas.');
  const out=new Uint8Array(width*height);
  let min=255,max=0;
  for(let i=0;i<out.length;i++){
    const p=i*4,v=format==='alpha'?rgba[p+3]!:Math.round((rgba[p]!*.2126+rgba[p+1]!*.7152+rgba[p+2]!*.0722)*rgba[p+3]!/255);
    min=Math.min(min,v);max=Math.max(max,v);out[i]=invert?255-v:v;
  }
  if(format==='alpha'&&min===255)throw new Error('The segmentation result has no transparent pixels. Check the workflow output or choose grayscale mask.');
  if(max===0)throw new Error('No foreground was detected. Selection unchanged.');
  return out;
}

/** Swarm's CLIPSeg produces a source-sized MASK; MaskToImage gives an ordinary grayscale PNG. */
export function textSegmentationParams(image:string,target:string,threshold:number,ready:boolean):Record<string,unknown>{
  if(!ready)throw new Error('SwarmClipSeg or MaskToImage is unavailable on this backend. Use foreground or a custom mask workflow.');
  if(!target.trim()||target.length>120)throw new Error('Enter a short object description, e.g. hair or jacket.');
  if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw new Error('Choose a threshold between 0 and 1.');
  if(!/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(image))throw new Error('The segmentation source must be decoded image bytes.');
  return {comfyworkflowraw:JSON.stringify({
    '1':{class_type:'SwarmLoadImageB64',inputs:{image_base64:image.slice(image.indexOf(',')+1)}},
    '2':{class_type:'SwarmClipSeg',inputs:{images:['1',0],match_text:target.trim(),threshold}},
    '3':{class_type:'MaskToImage',inputs:{mask:['2',0]}},
    '4':{class_type:'SwarmSaveImageWS',inputs:{images:['3',0]}},
  })};
}
