import '@bv/ui/src/base.css';
import { guardBrowserUi } from '@bv/ui';
import { mount } from 'svelte';
import App from './App.svelte';

guardBrowserUi(import.meta.env.DEV);

const target = document.getElementById('app');
if (target) mount(App, { target });
