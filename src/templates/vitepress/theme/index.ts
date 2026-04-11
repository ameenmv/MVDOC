// VitePress theme with ChatWidget integration
// This file is copied to the docs/.vitepress/theme/ directory during generation

import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import ChatWidget from './components/ChatWidget.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(ChatWidget),
    });
  },
};
