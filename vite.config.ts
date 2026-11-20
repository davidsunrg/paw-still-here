import { defineConfig } from 'vite';
import { en } from './src/i18n/en.ts';

/**
 * 页面信息（title、description、分享卡片、canonical）要写死在 HTML 里，搜索引擎和分享预览才读得到，
 * 不能等脚本运行时再填。这里在打包时从语言文件取出来写进 index.html，文字仍然只有语言文件一处。
 */
const { meta, brand } = en;

export default defineConfig({
  plugins: [
    {
      name: 'page-meta',
      transformIndexHtml: () => [
        { tag: 'title', children: meta.title, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'description', content: meta.description }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'canonical', href: meta.url }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:site_name', content: brand }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:title', content: meta.title }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:description', content: meta.description }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:url', content: meta.url }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' }, injectTo: 'head' },
      ],
    },
  ],
});
