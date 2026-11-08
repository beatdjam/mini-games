import { expect, test } from 'vitest';
import { scaleTable } from '../../src/dev/views/scale.ts';

const data = scaleTable({ ceil: 18, radius: 2 }).split('\n').slice(2); // header and separator first

test('the table has the 13 sizes', () => {
  expect(data).toHaveLength(13);
});

test('the ceiling row has 18 / 8 in the 8 m column', () => {
  const ceiling = data.find(line => line.includes('天井'));
  if (!ceiling) throw new Error('the table has no ceiling row');
  const cells = ceiling.split('|').map(cell => cell.trim());
  // '', 寸法, 7m 比, 7m 余裕, 8m 比, ...
  expect(cells[4]).toBe('2.25');
});
