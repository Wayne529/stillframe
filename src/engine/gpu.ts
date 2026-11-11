import type { Adjustments } from '../domain/model';
import { transformPixels } from './pixels';
let renderer: any = null,
  pixi: typeof import('pixi.js') | null = null,
  unavailable = false;
const vertex = `in vec2 aPosition;out vec2 vTextureCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment = `in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform vec4 uA;uniform vec2 uB;void main(){vec4 src=texture(uTexture,vTextureCoord);vec3 straight=src.a>0.0?src.rgb/src.a:vec3(0.0);vec3 rgb=pow(max(straight,vec3(0.0)),vec3(2.2))*exp2(uA.x);float l=clamp(dot(rgb,vec3(.2126,.7152,.0722)),0.0,1.0);float shift=uA.w*.22*pow(1.0-l,2.0)+uA.z*.22*l*l;rgb=pow(max(vec3(0.0),rgb+shift),vec3(1.0/2.2));rgb+=vec3(.08,.015,-.08)*uB.x;rgb=(rgb-.5)*(1.0+uA.y)+.5;float grey=dot(rgb,vec3(.2126,.7152,.0722));rgb=mix(vec3(grey),rgb,1.0+uB.y);finalColor=vec4(clamp(rgb,0.0,1.0)*src.a,src.a);}`;
export async function filtered(
  source: ImageBitmap,
  a: Adjustments,
): Promise<{ canvas: OffscreenCanvas; backend: string }> {
  const { width, height } = source;
  const out = new OffscreenCanvas(width, height),
    ctx = out.getContext('2d')!;
  if (Object.values(a).every((v) => v === 0)) {
    ctx.drawImage(source, 0, 0);
    return { canvas: out, backend: 'original' };
  }
  if (!unavailable)
    try {
      pixi ??= await import('pixi.js');
      if (!renderer) {
        pixi.DOMAdapter.set(pixi.WebWorkerAdapter);
        renderer = await pixi.autoDetectRenderer({
          canvas: new OffscreenCanvas(width, height),
          width,
          height,
          preference: 'webgl',
          antialias: false,
          backgroundAlpha: 0,
        });
      }
      const gl = renderer.gl;
      if (gl && Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE))
        throw new Error('GPU_TEXTURE_LIMIT');
      renderer.resize(width, height);
      const texture = pixi.Texture.from(source),
        sprite = new pixi.Sprite(texture);
      const filter = new pixi.Filter({
        glProgram: pixi.GlProgram.from({ vertex, fragment }),
        resources: {
          toneUniforms: {
            uA: {
              value: [a.exposure, a.contrast / 100, a.highlights / 100, a.shadows / 100],
              type: 'vec4<f32>',
            },
            uB: { value: [a.temperature / 100, a.saturation / 100], type: 'vec2<f32>' },
          },
        },
      });
      sprite.filters = [filter];
      renderer.render(sprite);
      ctx.drawImage(renderer.canvas as OffscreenCanvas, 0, 0);
      sprite.destroy({ texture: true, textureSource: true });
      filter.destroy();
      return { canvas: out, backend: 'WebGL' };
    } catch {
      unavailable = true;
      renderer?.destroy();
      renderer = null;
    }
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  for (let row = 0; row < height; row += 128) {
    const start = row * width * 4,
      end = Math.min(height, row + 128) * width * 4;
    transformPixels(pixels.data.subarray(start, end), a);
    await new Promise((r) => setTimeout(r, 0));
  }
  ctx.putImageData(pixels, 0, 0);
  return { canvas: out, backend: 'CPU' };
}
