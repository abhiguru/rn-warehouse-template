/**
 * Icon Types
 *
 * The glyph names the app's icon set (MaterialCommunityIcons from
 * `@expo/vector-icons`) accepts. Use it for any prop, field or constant that
 * holds an icon name, so a misspelt name fails the type check.
 */

import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type React from 'react';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
