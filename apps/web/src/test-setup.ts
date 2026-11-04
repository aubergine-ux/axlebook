import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import './i18n';

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => cleanup());

// jsdom doesn't implement scrolling; the router calls it on navigation.
window.scrollTo = () => {};
