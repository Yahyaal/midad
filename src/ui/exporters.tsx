import { renderToStaticMarkup } from 'react-dom/server';
import type { LaidBlock } from '../core/layout';
import type { Project } from '../core/model';
import { Artwork } from './Artwork';

/** Standalone SVG document identical to what the canvas shows (minus selection UI). */
export function projectToSvg(project: Project, layouts: Map<string, LaidBlock>, opts: { transparent?: boolean } = {}): string {
  const body = renderToStaticMarkup(<Artwork project={project} layouts={layouts} transparent={opts.transparent} idPrefix="x" />);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}">
<title>${escapeXml(project.name)}</title>
<desc>Made with Midad. Letterforms from OFL-licensed fonts.</desc>
${body}
</svg>`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

export async function svgToPngBlob(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not rasterise the SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
