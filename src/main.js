import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './style.css'
import 'highlight.js/styles/atom-one-dark.css'
import './tools/index'

import App from './App.vue'
createApp(App).use(createPinia()).mount('#app')
