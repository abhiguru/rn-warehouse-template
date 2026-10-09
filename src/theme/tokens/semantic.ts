/**
 * Semantic tokens (SAP Fiori "semantic tokens").
 *
 * Every colour a component may use, by role, for each brand in light and dark
 * mode. Components read these through useTheme().tokens or useThemedStyles();
 * they never use reference palettes or hex literals. See docs/STYLE_GUIDE.md.
 *
 * Neutrals, status colours, fields and shadows are SAP Horizon for both brands,
 * so status meaning is identical whichever brand a user picks. Only the brand
 * group changes between brands.
 */
import {
  horizon,
  horizonAvatar,
  horizonChart,
  orange,
  gcsaNavy,
  gcsaGrey,
  ink,
} from './reference';

export type Brand = 'orange' | 'gcsa';
export type Mode = 'light' | 'dark';

export const BRANDS: readonly Brand[] = ['orange', 'gcsa'];
export const BRAND_LABELS: Record<Brand, string> = {
  orange: 'Orange',
  gcsa: 'GCSA navy',
};

export interface StatusTokens {
  /** Text and icons on surfaces (4.5:1). */
  text: string;
  /** Indicators, bars and icons that sit beside a text label (3:1). */
  element: string;
  /** Tinted container behind status text. */
  background: string;
  /** Border of a status container or an invalid field. */
  border: string;
}

export interface ShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android elevation. */
  elevation: number;
}

export interface ThemeTokens {
  brandName: Brand;
  mode: Mode;
  background: {
    /** Screen background behind content (sapBackgroundColor). */
    base: string;
    /** Grouped list background, settings-style screens. */
    grouped: string;
    /** Shell: app bar and tab bar container. */
    shell: string;
  };
  surface: {
    /** Cards, list rows, sections (sapGroup_ContentBackground). */
    card: string;
    cardPressed: string;
    cardActive: string;
    /** Selected row (sapList_SelectionBackgroundColor). */
    selected: string;
    field: string;
    fieldReadOnly: string;
    /** Bottom sheets, dialogs, popovers. */
    sheet: string;
    header: string;
    tabBar: string;
  };
  text: {
    primary: string;
    /** Labels, secondary lines, placeholders (sapContent_LabelColor). */
    secondary: string;
    placeholder: string;
    disabled: string;
    /** Text on an inverse (dark-in-light / light-in-dark) surface. */
    inverse: string;
    /** Required-field asterisk. */
    required: string;
  };
  icon: {
    primary: string;
    secondary: string;
  };
  border: {
    divider: string;
    separator: string;
    field: string;
    fieldFocus: string;
    button: string;
  };
  brand: {
    /** Primary button and emphasized fills. */
    fill: string;
    /** Text and icons on brand.fill. */
    onFill: string;
    fillPressed: string;
    /** Brand-coloured text, links, icons, selected tabs (4.5:1 on surfaces). */
    tint: string;
    /** Tinted backgrounds: selected chips, highlights. */
    subtle: string;
    subtleStrong: string;
    /** Secondary brand colour: decoration and borders only. */
    secondary: string;
    /** Text/icon variant of the secondary colour (4.5:1). */
    secondaryText: string;
  };
  /** Filled destructive button (Fiori "Reject"/negative emphasized button). */
  destructive: {
    fill: string;
    onFill: string;
    fillPressed: string;
  };
  status: {
    negative: StatusTokens;
    critical: StatusTokens;
    positive: StatusTokens;
    informative: StatusTokens;
    neutral: StatusTokens;
  };
  interaction: {
    /** Keyboard/accessibility focus ring. */
    focus: string;
    focusWidth: number;
    /** Overlay drawn over a pressed element. */
    pressedOverlay: string;
    /** Opacity of disabled controls (sapContent_DisabledOpacity). */
    disabledOpacity: number;
  };
  overlay: {
    /** Dimming behind dialogs and sheets. */
    scrim: string;
    /** Text and icons on images and brand headers. */
    onImage: string;
    /** Translucent button background on brand headers. */
    onBrandSubtle: string;
  };
  /** Elevation levels 0-4 (Fiori: 0 headers, 1 raised rows, 2 cards, 3 toasts/menus, 4 popovers/sheets). */
  shadow: [ShadowToken, ShadowToken, ShadowToken, ShadowToken, ShadowToken];
  chart: readonly string[];
  avatar: readonly string[];
  /** Status bar icon style for this mode. */
  statusBarStyle: 'dark-content' | 'light-content';
}

function shadows(mode: Mode): ThemeTokens['shadow'] {
  const color = mode === 'light' ? horizon.light.shadowColor : horizon.dark.shadowColor;
  const k = mode === 'light' ? 1 : 2; // dark surfaces need stronger shadows to separate
  const level = (y: number, radius: number, opacity: number, elevation: number): ShadowToken => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: y },
    shadowOpacity: Math.min(opacity * k, 0.6),
    shadowRadius: radius,
    elevation,
  });
  return [
    level(0, 0, 0, 0),
    level(1, 2, 0.12, 1),
    level(2, 6, 0.16, 3),
    level(6, 16, 0.2, 8),
    level(10, 30, 0.25, 16),
  ];
}

function brandGroup(brand: Brand, mode: Mode): ThemeTokens['brand'] {
  if (brand === 'orange') {
    return mode === 'light'
      ? {
          fill: orange[600],
          onFill: ink,
          fillPressed: orange[700],
          tint: orange[800],
          subtle: orange[50],
          subtleStrong: orange[200],
          secondary: orange.secondary,
          secondaryText: orange[900],
        }
      : {
          fill: orange[500],
          onFill: ink,
          fillPressed: orange[600],
          tint: orange[500],
          subtle: orange.darkSubtle,
          subtleStrong: orange.darkSubtleStrong,
          secondary: orange.secondary,
          secondaryText: orange.secondary,
        };
  }
  return mode === 'light'
    ? {
        fill: gcsaNavy[600],
        onFill: '#FFFFFF',
        fillPressed: gcsaNavy[700],
        tint: gcsaNavy[600],
        subtle: gcsaNavy[50],
        subtleStrong: gcsaNavy[100],
        secondary: gcsaGrey[400],
        secondaryText: gcsaGrey[700],
      }
    : {
        fill: gcsaNavy[300],
        onFill: ink,
        fillPressed: gcsaNavy[200],
        tint: gcsaNavy[300],
        subtle: gcsaNavy.darkSubtle,
        subtleStrong: gcsaNavy.darkSubtleStrong,
        secondary: gcsaGrey[400],
        secondaryText: gcsaGrey[400],
      };
}

/** Build the complete token set for one brand and mode. */
export function buildTokens(brand: Brand, mode: Mode): ThemeTokens {
  const h = mode === 'light' ? horizon.light : horizon.dark;
  const light = mode === 'light';
  return {
    brandName: brand,
    mode,
    background: { base: h.background, grouped: light ? '#F2F2F7' : h.background, shell: h.shell },
    surface: {
      card: h.surface,
      cardPressed: h.surfaceHover,
      cardActive: h.surfaceActive,
      selected: h.selection,
      field: h.field,
      fieldReadOnly: h.fieldReadOnly,
      sheet: h.surface,
      header: h.surface,
      tabBar: h.surface,
    },
    text: {
      primary: h.text,
      secondary: h.label,
      placeholder: h.label,
      disabled: h.disabledText,
      inverse: h.contrastText,
      required: h.required,
    },
    icon: { primary: h.text, secondary: h.iconNonInteractive },
    border: {
      divider: h.divider,
      separator: h.toolbarSeparator,
      field: h.fieldBorder,
      fieldFocus: h.focus,
      button: h.buttonBorder,
    },
    brand: { ...brandGroup(brand, mode) },
    // Horizon's element red (#F53232) gives white text only 3.9:1, so the filled
    // button uses the negative text colour in light mode and dark ink on red in dark mode.
    destructive: light
      ? { fill: h.negative.text, onFill: '#FFFFFF', fillPressed: '#8A0606' }
      : { fill: h.negative.text, onFill: ink, fillPressed: '#FF8A8A' },
    status: {
      negative: { ...h.negative },
      critical: { ...h.critical },
      positive: { ...h.positive },
      informative: { ...h.informative },
      neutral: { ...h.neutral },
    },
    interaction: {
      focus: h.focus,
      focusWidth: 2,
      pressedOverlay: light ? 'rgba(19,30,41,0.08)' : 'rgba(245,246,247,0.12)',
      disabledOpacity: 0.4,
    },
    overlay: {
      scrim: h.blockLayer,
      onImage: '#FFFFFF',
      onBrandSubtle: light ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)',
    },
    shadow: shadows(mode),
    chart: light ? horizonChart.light : horizonChart.dark,
    avatar: light ? horizonAvatar.light : horizonAvatar.dark,
    statusBarStyle: light ? 'dark-content' : 'light-content',
  };
}

const cache = new Map<string, ThemeTokens>();
/** Memoised buildTokens: the same object for the same brand and mode. */
export function getTokens(brand: Brand, mode: Mode): ThemeTokens {
  const key = `${brand}:${mode}`;
  let tokens = cache.get(key);
  if (!tokens) {
    tokens = buildTokens(brand, mode);
    cache.set(key, tokens);
  }
  return tokens;
}
