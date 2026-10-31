import enUS from '@/src/i18n/locales/en-US.json';
import zhCN from '@/src/i18n/locales/zh-CN.json';
import ruRU from '@/src/i18n/locales/ru-RU.json';
import deDE from '@/src/i18n/locales/de-DE.json';
import ukUA from '@/src/i18n/locales/uk-UA.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
    return out;
  }, {});
}

const locales: Record<string, Tree> = { 'en-US': enUS, 'zh-CN': zhCN, 'ru-RU': ruRU, 'de-DE': deDE, 'uk-UA': ukUA };
const base = Object.keys(flatten(enUS)).sort();

describe('mobile locales', () => {
  it.each(Object.keys(locales))('%s has the same keys as en-US', (name) => {
    expect(Object.keys(flatten(locales[name])).sort()).toEqual(base);
  });

  it.each(Object.keys(locales))('%s pairing / inbox / approval strings only use the CSBU WorkMate brand', (name) => {
    const strings = Object.entries(flatten(locales[name]))
      .filter(([key]) => /^(pairing|inbox|approval|connect)\./.test(key))
      .map(([, value]) => value);
    for (const value of strings) {
      expect(value).not.toMatch(/AionUi|Aion\b|WorkMate(?<!CSBU WorkMate)/);
    }
  });
});
