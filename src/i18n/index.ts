import { en } from './en';

/** 一份完整文案的形状，以英语那份为准 */
export type Strings = typeof en;

/**
 * 全部语言。加一种语言：照着 en.ts 写一个文件（类型标成 Strings），在这里登记。
 * 目前只有英语，也没有切换语言的入口。
 */
const LOCALES = { en } satisfies Record<string, Strings>;

export type Locale = keyof typeof LOCALES;
export const LOCALE: Locale = 'en';

/** 当前语言的文案。访客能看到的字都从这里取 */
export const STR: Strings = LOCALES[LOCALE];

/** 把这门语言的 lang、字体、字间距交给页面；在界面初始化时调用一次 */
export function applyLocaleStyle() {
  const root = document.documentElement;
  root.lang = STR.style.lang;
  root.style.setProperty('--serif', STR.style.serif);
  root.style.setProperty('--sans', STR.style.sans);
  root.style.setProperty('--tracking', String(STR.style.tracking));
  document.title = STR.meta.title;
}
