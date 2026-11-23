import { encode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { parseUi5Selector } from '../../src/ui5/selector';

describe('parseUi5Selector', () => {
  it('parses the JSON form', () => {
    expect(parseUi5Selector('ui5:{"id":"container-cart---homeView--searchField"}')).toEqual({ id: 'container-cart---homeView--searchField' });
  });

  it('parses the toon-escaped form that get_elements prints', () => {
    expect(parseUi5Selector('ui5:{\\"id\\":\\"container-cart---homeView--searchField\\"}')).toEqual({ id: 'container-cart---homeView--searchField' });
  });

  it('round-trips toon-escaped quotes and backslashes inside values', () => {
    const selector = 'ui5:' + JSON.stringify({ properties: { text: 'say "hi"' }, id: { regex: { source: '\\d+' } } });
    const printed = /"(.*)"/.exec(encode({ selector }))![1];
    expect(printed).not.toBe(selector);
    expect(parseUi5Selector(printed)).toEqual(parseUi5Selector(selector));
  });

  it('rejects a payload that is not JSON in either form', () => {
    expect(() => parseUi5Selector('ui5:notjson')).toThrow("Invalid ui5 selector (expected 'ui5:' + JSON object): ui5:notjson");
  });
});
