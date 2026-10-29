// Entry point: load the Japanese copy and start the terminal.
import './i18n/ja.ts';
import { ANALYTICS } from '@engine/core/analytics.ts';
import { startTerminal } from './ui/terminal.ts';

ANALYTICS.game = 'tsume-vim'; // sent with every analytics event
startTerminal();
