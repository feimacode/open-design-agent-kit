// Extension-authored structural directions for explorations whose brand is
// locked (an active design system): the palette and type stay fixed, and
// directions diverge on layout (pages) or narrative (decks) instead. The
// visual counterpart is ../vendored/designDirections.ts.

export interface StructuralDirection {
  id: string;
  label: string;
  /** What this structure is and when it suits a brief. */
  summary: string;
  /** Concrete layout or narrative cues. */
  cues: string[];
  /** What must visibly differ from sibling directions, so they don't converge. */
  mustDiffer: string;
}

export const PAGE_STRUCTURES: StructuralDirection[] = [
  {
    id: 'classic-hero-grid',
    label: 'Classic hero + feature grid',
    summary: 'The familiar, scannable marketing layout: one clear promise above the fold, then evidence in a grid.',
    cues: [
      'split hero: headline and primary action on one side, product visual on the other',
      'a 3- or 4-column feature grid directly below, icon or small visual per cell',
      'one social-proof strip (logos or a single quote) between sections',
    ],
    mustDiffer: 'Hero is a two-column split and the key section is a uniform grid; siblings must not use a split hero or a uniform card grid.',
  },
  {
    id: 'story-led-scroll',
    label: 'Story-led long scroll',
    summary: 'A narrative page that earns attention section by section, like an editorial feature.',
    cues: [
      'full-width, centred, type-led hero with an oversized headline and no side visual',
      'alternating full-bleed sections, each making one point with one image or diagram',
      'generous vertical rhythm; section kickers numbered or labelled like chapters',
    ],
    mustDiffer: 'Hero is centred and type-only, and sections alternate full-bleed; siblings must not lead with a centred type-only hero.',
  },
  {
    id: 'product-ui-first',
    label: 'Product UI first',
    summary: 'Show the product immediately: the interface itself is the hero and the argument.',
    cues: [
      'a large, realistic product screenshot or device frame dominates the first screen, copy kept to one line plus an action',
      'annotated callouts pointing at real parts of the UI',
      'the key section is an interactive-looking walkthrough (tabs or steps), not marketing cards',
    ],
    mustDiffer: 'The first screen is dominated by a product UI with annotations; siblings must not make a product screenshot the dominant hero element.',
  },
  {
    id: 'dense-utility',
    label: 'Dense utility',
    summary: 'Information-first, for expert audiences who want detail per square inch over persuasion.',
    cues: [
      'compact header with search or a primary command instead of a marketing hero',
      'the key section is a dense table, comparison matrix or spec list with tabular numerals',
      'tight spacing, small type scale, secondary navigation visible',
    ],
    mustDiffer: 'No marketing hero at all; the first screen is a working dense layout. Siblings must not open with a table or matrix.',
  },
];

export const DECK_STRUCTURES: StructuralDirection[] = [
  {
    id: 'problem-solution',
    label: 'Problem → solution',
    summary: 'The classic pitch arc: name the pain sharply, then resolve it.',
    cues: [
      'cover states the outcome, not the product name alone',
      'slide 2 quantifies the problem with one big number',
      'slide 3 shows the solution as a before/after',
    ],
    mustDiffer: 'Opens on the problem with a single large statistic; siblings must not use a big-number problem slide second.',
  },
  {
    id: 'narrative-journey',
    label: 'Narrative journey',
    summary: 'A story told through one person or customer, chapter by chapter.',
    cues: [
      'cover is a full-bleed image or scene with a short line',
      'slides read like chapters, each with a short title and a single image',
      'minimal bullet points; sentences, not fragments',
    ],
    mustDiffer: 'Image-led chapters with sentence copy; siblings must not be image-led with sentence copy.',
  },
  {
    id: 'data-led',
    label: 'Data-led',
    summary: 'Let the evidence argue: every slide is anchored on a chart or metric.',
    cues: [
      'cover carries a key metric alongside the title',
      'each content slide has one chart with a one-line takeaway as the title',
      'source notes in small type',
    ],
    mustDiffer: 'Every content slide is anchored on a chart; siblings must not centre their content slides on charts.',
  },
  {
    id: 'demo-first',
    label: 'Demo first',
    summary: 'Show the product working before explaining it.',
    cues: [
      'cover is a product screenshot with a one-line promise',
      'slide 2 is a step-by-step flow of real UI states',
      'slide 3 explains why it matters, briefly',
    ],
    mustDiffer: 'Content slides are product UI states; siblings must not put product screenshots on their content slides.',
  },
];

export function renderStructuralDirectionSpec(d: StructuralDirection): string {
  const lines = [
    `### ${d.label}  \`(id: ${d.id})\``,
    '',
    d.summary,
    '',
    '**Cues:**',
    ...d.cues.map((c) => `- ${c}`),
    '',
    `**Must differ:** ${d.mustDiffer}`,
    '',
  ];
  return lines.join('\n');
}
