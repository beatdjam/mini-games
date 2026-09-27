'use strict';
// Sectors: look, level generation parameters, boss candidates
// sectors: each run visits them in a shuffled order. gen = level generator settings, bosses = candidates for the sector's boss
const BIOMES = [
  { code: 'DATA', fog: 0x061219, fogNear: 4, fogFar: 44, floor: '#08171e', line: '#1d7f94', wall: '#0b232b', wallLine: '#54e8ff',
    gen: { kind: 'rooms', platform: 0.35, bridges: 2 },
    enemies: ['crawler', 'crawler', 'drone', 'drone', 'turret'], bosses: ['watcher', 'phantom'] },
  { code: 'FORGE', fog: 0x170905, fogNear: 4, fogFar: 44, floor: '#1e0e08', line: '#94421c', wall: '#2a1209', wallLine: '#ff8a3d',
    gen: { kind: 'rooms', platform: 0.3, bridges: 2, hazard: { count: 12, color: 0xff5a1f } },
    enemies: ['crawler', 'crawler', 'drone', 'turret', 'brute', 'bomber'], bosses: ['crusher', 'trinity'] },
  { code: 'NOISE', fog: 0x0d0616, fogNear: 2, fogFar: 26, floor: '#120a1e', line: '#5e38a0', wall: '#190d2a', wallLine: '#c58cff',
    gen: { kind: 'rooms', platform: 0.35, bridges: 3 },
    enemies: ['crawler', 'drone', 'turret', 'brute', 'splitter', 'splitter'], bosses: ['core', 'bastion'] },
  { code: 'RUIN', fog: 0x0d0f0b, fogNear: 2, fogFar: 30, floor: '#171a14', line: '#6b7a4f', wall: '#1d2019', wallLine: '#a8b886',
    gen: { kind: 'rooms', roomMin: 6, roomMax: 8, platform: 0.3, rubble: 0.14, bridges: 1 },
    enemies: ['crawler', 'bomber', 'shield', 'drone', 'shield', 'crawler'], bosses: ['phantom', 'crusher'] },
  { code: 'KWLN', fog: 0x12060e, fogNear: 3, fogFar: 34, floor: '#1a0c16', line: '#b0306e', wall: '#1f0d19', wallLine: '#ff3d8a',
    gen: { kind: 'rooms', map: 34, countMin: 7, countMax: 8, roomMin: 4, roomMax: 6, platform: 0.2, bridges: 4, density: 4, hazard: { count: 10, color: 0x3dffb4 }, ceiling: true, neon: true },
    enemies: ['crawler', 'bomber', 'turret', 'splitter', 'crawler'], bosses: ['trinity', 'watcher'] },
  { code: 'CITY', fog: 0x140e06, fogNear: 8, fogFar: 64, floor: '#1b150c', line: '#a06d24', wall: '#221a0e', wallLine: '#ffb347',
    gen: { kind: 'rooms', map: 44, roomMin: 6, roomMax: 9, corridorW: 2, platform: 0.8, rubble: 0.06 },
    enemies: ['sniper', 'drone', 'shield', 'turret', 'crawler', 'sniper'], bosses: ['bastion', 'phantom'] },
];
