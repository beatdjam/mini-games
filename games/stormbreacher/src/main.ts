import './i18n/ja.ts';
import './i18n/en.ts';
import { ANALYTICS } from '@engine/core/index.ts';
import { boot } from './app/boot.ts';

ANALYTICS.game = 'stormbreacher'; // sent with every analytics event
boot();
// checks and screenshot hooks (#view-…): only on the dev server, never in the built pages
if (import.meta.env.DEV) import('./dev/dev.ts');
