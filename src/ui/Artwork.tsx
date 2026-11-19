// The artwork itself: paper, ink finish and every glyph piece / joining stroke.
// Used both for the live canvas and for SVG/PNG export, so they always match.
import type { LaidBlock } from '../core/layout';
import { matToSvg } from '../core/geometry';
import type { Ink, Paper, Project } from '../core/model';

export interface ArtworkProps {
  project: Project;
  layouts: Map<string, LaidBlock>;
  /** omit paper (transparent export) */
  transparent?: boolean;
  /** add data-* attributes used for hit testing */
  interactive?: boolean;
  /** prefix for filter ids so several artworks can live in one document */
  idPrefix?: string;
}

export function inkFill(ink: Ink, id: (s: string) => string): string {
  return ink.style === 'gold' ? `url(#${id('gold')})` : ink.color;
}

export function InkDefs({ ink, paper, width, height, id }: { ink: Ink; paper: Paper; width: number; height: number; id: (s: string) => string }) {
  const t = ink.texture;
  return (
    <defs>
      <filter id={id('paper')} x={0} y={0} width={width} height={height} filterUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="11" result="grain" />
        <feColorMatrix in="grain" type="matrix" values={`0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.16  0 0 0 ${-0.9 * paper.texture} ${0.55 * paper.texture}`} result="grainA" />
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.012" numOctaves="4" seed="4" result="cloud" />
        <feColorMatrix in="cloud" type="matrix" values={`0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.22  0 0 0 ${-0.6 * paper.texture} ${0.32 * paper.texture}`} result="cloudA" />
        <feMerge>
          <feMergeNode in="cloudA" />
          <feMergeNode in="grainA" />
        </feMerge>
      </filter>
      <linearGradient id={id('gold')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width * 0.25} y2={height}>
        <stop offset="0" stopColor="#f6e27a" />
        <stop offset="0.35" stopColor="#c9962b" />
        <stop offset="0.55" stopColor="#f2d572" />
        <stop offset="0.8" stopColor="#a8741a" />
        <stop offset="1" stopColor="#e8c75e" />
      </linearGradient>
      {/* Wet ink: soft wobble on the edges, uneven density, darker rims where ink pools as it dries. */}
      <filter id={id('wet')} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="3" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale={0.4 + 2.6 * t} xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="3" seed="9" result="pool" />
        <feColorMatrix in="pool" type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${-0.85 * t} ${1 + 0.26 * t}`} result="poolA" />
        <feComposite in="rough" in2="poolA" operator="in" result="body" />
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="21" result="grain" />
        <feColorMatrix in="grain" type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${-0.55 * t} ${0.28 * t}`} result="grainA" />
        <feComposite in="body" in2="grainA" operator="out" result="grained" />
        <feMorphology in="rough" operator="erode" radius={0.8 + 1.6 * t} result="core" />
        <feGaussianBlur in="core" stdDeviation="0.8" result="coreSoft" />
        <feComposite in="rough" in2="coreSoft" operator="out" result="rim" />
        <feColorMatrix in="rim" type="matrix" values={`0.45 0 0 0 0  0 0.42 0 0 0  0 0 0.4 0 0  0 0 0 ${0.7 * t} 0`} result="rimDark" />
        <feMerge>
          <feMergeNode in="grained" />
          <feMergeNode in="rimDark" />
        </feMerge>
      </filter>
      {/* Sumi: dense black with a soft bleed into the paper fibres. */}
      <filter id={id('sumi')} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="fine" />
        <feGaussianBlur in="SourceGraphic" stdDeviation={0.6 + 1.6 * t} result="bleed" />
        <feDisplacementMap in="bleed" in2="fine" scale={1 + 4 * t} xChannelSelector="R" yChannelSelector="G" result="bleedR" />
        <feColorMatrix in="bleedR" type="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${0.45 * t} 0`} result="halo" />
        <feMerge>
          <feMergeNode in="halo" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {/* Gold leaf: gentle relief lighting on top of the gradient. */}
      <filter id={id('goldfx')} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="blur" />
        <feSpecularLighting in="blur" surfaceScale="3" specularConstant={0.6 + 0.6 * t} specularExponent="18" lightingColor="#fff6d0" result="spec">
          <feDistantLight azimuth="235" elevation="48" />
        </feSpecularLighting>
        <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
        <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="0.7" k4="0" />
      </filter>
    </defs>
  );
}

export function Artwork({ project, layouts, transparent, interactive, idPrefix = 'm' }: ArtworkProps) {
  const id = (s: string) => `${idPrefix}-${s}`;
  const { ink, paper } = project;
  const fill = inkFill(ink, id);
  const filter = ink.style === 'wet' ? `url(#${id('wet')})` : ink.style === 'sumi' ? `url(#${id('sumi')})` : ink.style === 'gold' ? `url(#${id('goldfx')})` : undefined;
  const opacity = ink.style === 'gold' ? 1 : 1 - 0.3 * ink.layering;
  return (
    <g>
      <InkDefs ink={ink} paper={paper} width={project.width} height={project.height} id={id} />
      {!transparent && (
        <g>
          <rect x={0} y={0} width={project.width} height={project.height} fill={paper.color} />
          {paper.texture > 0 && <rect x={0} y={0} width={project.width} height={project.height} filter={`url(#${id('paper')})`} />}
        </g>
      )}
      {paper.ruled &&
        project.blocks.map((b) => {
          const lb = layouts.get(b.id);
          if (!lb) return null;
          return <line key={`rule-${b.id}`} x1={lb.bbox.x0 - 40} x2={lb.bbox.x1 + 40} y1={b.y} y2={b.y} stroke="#9a8a70" strokeWidth={0.8} strokeOpacity={0.45} />;
        })}
      <g filter={filter}>
        {project.blocks.map((b) => {
          if (b.hidden) return null;
          const lb = layouts.get(b.id);
          if (!lb) return null;
          const blockFill = b.ink ?? fill;
          return (
            <g key={b.id} data-block={interactive ? b.id : undefined}>
              {lb.joins.map((j) =>
                j.d ? (
                  <path
                    key={j.key}
                    d={j.d}
                    fill={blockFill}
                    fillOpacity={opacity}
                    data-block={interactive ? b.id : undefined}
                    data-join={interactive ? j.key : undefined}
                  />
                ) : null,
              )}
              {lb.glyphs.map((g) =>
                g.pieces.map((pc) => (
                  <path
                    key={pc.key}
                    d={pc.d}
                    transform={matToSvg(pc.world)}
                    fill={ink.markColor && (pc.kind === 'mark' || (ink.markDots && pc.kind === 'dot')) ? ink.markColor : blockFill}
                    fillOpacity={opacity}
                    data-block={interactive ? b.id : undefined}
                    data-glyph={interactive ? g.key : undefined}
                    data-piece={interactive ? pc.key : undefined}
                    data-kind={interactive ? pc.kind : undefined}
                  />
                )),
              )}
            </g>
          );
        })}
      </g>
    </g>
  );
}
