import '@testing-library/jest-dom/vitest';
import './i18n';

// jsdom doesn't implement scrolling; the router calls it on navigation.
window.scrollTo = () => {};
