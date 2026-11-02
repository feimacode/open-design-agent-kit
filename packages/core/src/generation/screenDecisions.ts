// App screen answers turned into numbers (openspec add-app-screens): the
// density and platform answers from the app-screens and mobile surfaces'
// questions become exact control heights, text sizes and screen widths in the
// instructions, so "compact" means the same thing on every screen and the
// check's tap-target rule can say when it's too small for touch.

export type Density = 'compact' | 'medium' | 'airy';

export interface DensitySpec {
  density: Density;
  controlHeight: string;
  bodyText: string;
  padding: string;
  gap: string;
}

export const DENSITY_SPECS: Record<Density, DensitySpec> = {
  compact: { density: 'compact', controlHeight: '32 to 36 px', bodyText: '13 to 14 px', padding: '8 px by 12 px', gap: '8 px' },
  medium: { density: 'medium', controlHeight: '40 to 44 px', bodyText: '14 to 15 px', padding: '12 px by 16 px', gap: '12 to 16 px' },
  airy: { density: 'airy', controlHeight: '48 px', bodyText: '16 px', padding: '20 px by 24 px or more', gap: '20 to 24 px, with 32 to 48 px between sections' },
};

/** The density named by an answer ("Compact", "medium density", "airy"), or undefined. */
export function parseDensity(answer: string | undefined): Density | undefined {
  const a = answer?.toLowerCase() ?? '';
  if (/\bcompact\b|\bdense\b/.test(a)) return 'compact';
  if (/\bairy\b|\bspacious\b|\brelaxed\b/.test(a)) return 'airy';
  if (/\bmedium\b|\bdefault\b|\bregular\b/.test(a)) return 'medium';
  return undefined;
}

export type ScreenPlatform = 'web' | 'iphone' | 'android' | 'tablet' | 'desktop-app';

export interface PlatformSpec {
  platform: ScreenPlatform;
  width: string;
  touchTarget: string;
  navigation: string;
  /** The body attributes that make the kit draw this platform's frame (openspec add-platform-shells). */
  device?: string;
}

export const PLATFORM_SPECS: Record<ScreenPlatform, PlatformSpec> = {
  web: { platform: 'web', width: 'fluid, checked at 1440, 1024, 768 and 390 px', touchTarget: '24 px minimum, 44 px on the phone layout', navigation: 'a sidebar or top bar that becomes a top bar or bottom tab bar on phones' },
  iphone: {
    platform: 'iphone',
    width: '390 by 763 px of app (iPhone 15 and 16, between the status bar and home indicator)',
    touchTarget: '44 by 44 px',
    navigation: 'a bottom tab bar of three to five items; inner screens get a top bar with the title and a back button',
    device: 'data-od-device="iphone"',
  },
  android: {
    platform: 'android',
    width: '412 by 867 px of app (a common Android phone, between the status bar and gesture bar)',
    touchTarget: '48 by 48 dp',
    navigation: 'a Material 3 navigation bar at the bottom (three to five items) and a top app bar; a floating action button only for the one main create action',
    device: 'data-od-device="android"',
  },
  tablet: {
    platform: 'tablet',
    width: '1024 by 724 px landscape and 768 by 980 px portrait (it is checked in both)',
    touchTarget: '44 by 44 px',
    navigation: 'an icon rail with labels (or a collapsible sidebar); a list and detail side by side in landscape',
    device: 'data-od-device="tablet" data-od-orientation="landscape"',
  },
  'desktop-app': {
    platform: 'desktop-app',
    width: '1280 by 800 px window content',
    touchTarget: '24 px minimum (pointer)',
    navigation: 'a sidebar with the app\'s sections, a toolbar for the current view, keyboard shortcuts shown in menus and tooltips',
    device: 'data-od-device="desktop-app" data-od-window="mac"',
  },
};

/** The platform named by an answer ("Android", "iPhone", "Web app", "Tablet", "Desktop app"), or undefined (also for "Either"). */
export function parsePlatform(answer: string | undefined): ScreenPlatform | undefined {
  const a = answer?.toLowerCase() ?? '';
  if (/android|pixel|galaxy/.test(a)) return 'android';
  if (/ipad|tablet/.test(a)) return 'tablet';
  if (/iphone|\bios\b/.test(a)) return 'iphone';
  if (/desktop app|electron|tauri|mac app|macos app|windows app|native app on (?:mac|windows)/.test(a)) return 'desktop-app';
  if (/\bweb\b|desktop|browser/.test(a)) return 'web';
  return undefined;
}

/** The "Screen size and density" section, or '' when neither answer was given. */
export function composeScreenSpecSection(answers: Record<string, string> | undefined): string {
  if (!answers) return '';
  const density = parseDensity(answers.density);
  const platform = parsePlatform(answers.platform);
  if (!density && !platform) return '';
  const lines: string[] = [];
  if (platform) {
    const p = PLATFORM_SPECS[platform];
    lines.push(`- **Platform: ${answers.platform}.** Screen width ${p.width}; touch targets at least ${p.touchTarget}; navigation: ${p.navigation}.`);
    if (p.device) {
      const windowsNote = platform === 'desktop-app' ? ' (data-od-window="windows" for a Windows app)' : '';
      lines.push(
        `- **Frame: the kit draws it.** Put \`${p.device}\`${windowsNote} on \`<body>\`, on every screen. The previews draw the device frame, status bar, notch or window title bar around the page, and the check renders it at the size above. Don't draw any of those yourself: the page is only the app, filling the whole viewport.`,
      );
    }
  }
  if (density) {
    const d = DENSITY_SPECS[density];
    lines.push(`- **Density: ${density}.** Controls ${d.controlHeight} high, body text ${d.bodyText}, cell and field padding ${d.padding}, gaps ${d.gap}. Use these numbers on every screen of this design.`);
    if (density === 'compact' && platform && platform !== 'web') {
      lines.push(`- Compact controls are below the ${PLATFORM_SPECS[platform].touchTarget} touch target: keep each control's hit area at that size with padding or a taller row.`);
    }
  }
  return `## Screen size and density\n\nFrom the answers above, as numbers:\n\n${lines.join('\n')}`;
}
