// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// The shared reference cache (utils/refCache) lives for the page's lifetime;
// each test starts with an empty one so one test's stub cannot answer another's.
// eslint-disable-next-line import/first
import { clearRefCache } from './utils/refCache';

beforeEach(() => clearRefCache());
