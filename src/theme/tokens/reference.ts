/**
 * Reference palettes (SAP Fiori "reference tokens").
 *
 * Raw colour values only. Components never use these directly: they use the
 * semantic tokens built in ./semantic.ts, which assign each role a value for
 * light and dark mode and for each brand.
 *
 * Horizon values are SAP's published Morning Horizon (light) and Evening
 * Horizon (dark) theme parameters (github.com/SAP/theming-base-content,
 * content/Base/baseLib/sap_horizon{,_dark}/variables.json). The parameter each
 * value comes from is noted beside it.
 */

/** SAP Morning Horizon (light) and Evening Horizon (dark) neutrals and status colours. */
export const horizon = {
  light: {
    background: '#F5F6F7', // sapBackgroundColor
    shell: '#EFF1F2', // sapShell_Background
    surface: '#FFFFFF', // sapGroup_ContentBackground, sapList_Background
    surfaceHover: '#F2F4F5', // pressed rows: lighter than sapList_Hover_Background (#EAECEE) so status colours keep AA contrast
    surfaceActive: '#DEE2E5', // sapList_Active_Background
    field: '#FFFFFF', // sapField_Background
    fieldReadOnly: '#EAECEE', // sapField_ReadOnly_Background
    text: '#131E29', // sapTextColor
    label: '#556B82', // sapContent_LabelColor, sapField_PlaceholderTextColor
    iconNonInteractive: '#758CA4', // sapContent_NonInteractiveIconColor
    disabledText: 'rgba(19,30,41,0.6)', // sapContent_DisabledTextColor
    contrastText: '#FFFFFF', // sapContent_ContrastTextColor
    divider: '#E5E5E5', // sapList_BorderColor
    toolbarSeparator: '#D9D9D9', // sapToolbar_SeparatorColor
    fieldBorder: '#556B81', // sapField_BorderColor
    buttonBorder: '#BCC3CA', // sapButton_BorderColor
    focus: '#0032A5', // sapContent_FocusColor, sapField_Focus_BorderColor
    selection: '#EBF8FF', // sapList_SelectionBackgroundColor
    required: '#BA066C', // sapField_RequiredColor
    shadowColor: '#223548', // sapContent_ShadowColor
    blockLayer: 'rgba(0,0,0,0.4)', // sapBlockLayer_Background at Horizon's 0.2-0.6 scrim range
    negative: { text: '#AA0808', element: '#F53232', background: '#FFEAF4', border: '#E90B0B' }, // sapNegative*, sapErrorBackground, sapErrorBorderColor
    critical: { text: '#AA4A00', element: '#E76500', background: '#FFF8D6', border: '#DD6100' }, // text darkened from sapIndicationColor_3 (#B95100) to keep 4.5:1 on pressed rows; sapCritical*, sapWarning*
    positive: { text: '#256F3A', element: '#30914C', background: '#F5FAE5', border: '#30914C' }, // sapPositive*, sapSuccess*
    informative: { text: '#0064D9', element: '#0070F2', background: '#E1F4FF', border: '#0070F2' }, // sapContent_Selected_ForegroundColor (text, 4.5:1), sapInformative*, sapInformation*
    neutral: { text: '#556B82', element: '#788FA6', background: '#EFF1F2', border: '#788FA6' }, // sapContent_LabelColor (text, 4.5:1), sapNeutral*
  },
  dark: {
    background: '#12171C',
    shell: '#12171C',
    surface: '#1D232A',
    surfaceHover: '#222B35',
    surfaceActive: '#2A3440',
    field: '#161C22',
    fieldReadOnly: '#242E38',
    text: '#F5F6F7',
    label: '#8396A8',
    iconNonInteractive: '#A9B4BE',
    disabledText: 'rgba(245,246,247,0.6)',
    contrastText: '#1D232A',
    divider: '#2E3742',
    toolbarSeparator: '#3C4957',
    fieldBorder: '#A9B4BE',
    buttonBorder: '#3A4A5A',
    focus: '#9AD3FF',
    selection: '#1D2D3E',
    required: '#FF78A4',
    shadowColor: '#000000',
    blockLayer: 'rgba(0,0,0,0.6)',
    negative: { text: '#FA6161', element: '#FA6161', background: '#350000', border: '#FA6161' },
    critical: { text: '#FFDF72', element: '#F7BF00', background: '#382700', border: '#F7BF00' },
    positive: { text: '#97DD40', element: '#6DAD1F', background: '#11331A', border: '#6DAD1F' },
    informative: { text: '#4DB1FF', element: '#4DB1FF', background: '#00144A', border: '#4DB1FF' },
    neutral: { text: '#A9B4BE', element: '#A9B4BE', background: '#242E38', border: '#A9B4BE' },
  },
} as const;

/** Horizon chart palette (sapChart_OrderedColor_1..12), light and dark. */
export const horizonChart = {
  light: ['#168EFF', '#C87B00', '#75980B', '#DF1278', '#8B47D7', '#049F9A', '#0070F2', '#CC00DC', '#798C77', '#DA6C6C', '#5D36FF', '#A68A5B'],
  dark: ['#3278BE', '#F2A634', '#B4CE35', '#FA4F96', '#8B47D7', '#049F9A', '#0070F2', '#F31DED', '#8EA18C', '#F28585', '#7858FF', '#A68A5B'],
} as const;

/** Horizon avatar/accent backgrounds (sapAvatar_1..9_Background), light and dark. */
export const horizonAvatar = {
  light: ['#FFF3B8', '#FFD0E7', '#FFDBE7', '#FFDCF3', '#DED3FF', '#D1EFFF', '#C2FCEE', '#EBF5CB', '#DDCCF0'],
  dark: ['#AE4000', '#890506', '#B40569', '#8700B8', '#470CF1', '#0054CC', '#036573', '#236C39', '#4E247A'],
} as const;

/** The template's orange brand. 600 is the classic #F69000 accent. */
export const orange = {
  50: '#FFF4E6',
  100: '#FFE4C0',
  200: '#FFD399',
  300: '#FFC172',
  400: '#FFB04B',
  500: '#FFA733', // dark-mode fill and tint
  600: '#F69000', // light-mode fill (dark text on it)
  700: '#DD8200', // pressed fill
  800: '#A85000', // light-mode text and icons (5.51:1 on white, 4.65:1 on pressed rows)
  900: '#924F00',
  darkSubtle: '#3D2510',
  darkSubtleStrong: '#4F3015',
  secondary: '#F6C624', // decorative only
} as const;

/** GCSA navy, sampled from the association's official logo (#2E3192). */
export const gcsaNavy = {
  50: '#EEEFFA',
  100: '#D6D7F2',
  200: '#B3B5E8',
  300: '#9DA0F0', // dark-mode fill and tint
  400: '#7175D6',
  500: '#4A4EBF',
  600: '#2E3192', // light-mode fill, text and icons
  700: '#262879',
  800: '#1E1F60',
  900: '#161747',
  darkSubtle: '#23254F',
  darkSubtleStrong: '#2D3066',
} as const;

/** GCSA grey, sampled from the association's official logo (#A7A9AC). */
export const gcsaGrey = {
  50: '#F4F4F5',
  100: '#E6E7E8',
  200: '#CFD0D2',
  300: '#B9BBBD',
  400: '#A7A9AC', // the logo grey: borders and decoration on light, text on dark
  500: '#8C8F93',
  600: '#6E7175',
  700: '#5C5F63', // text on light (6.42:1 on white)
  800: '#3F4245',
  900: '#26282A',
} as const;

/** Ink used for text on bright fills (Horizon sapTextColor). */
export const ink = '#131E29';
