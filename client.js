import { hydrateRoot } from 'react-dom/client';

import { parseJSX } from './utils/parseJSX.js';
import { post } from './utils/post.js';

const jsxCache = new Map();

let currPathname = window.location.pathname;
const root = hydrateRoot(document, getInitialClientJSX());

function getInitialClientJSX() {
  const clientJSX = JSON.parse(window.__INITIAL_CLIENT_JSX_STRING__, parseJSX);
  jsxCache.set(currPathname, clientJSX);
  return clientJSX;
}

async function navigate(pathname, useCachedJSX = false) {
  const oldPathname = currPathname;
  currPathname = pathname;

  let clientJSX;

  if (useCachedJSX && jsxCache.has(pathname)) {
    clientJSX = jsxCache.get(pathname);
  } else {
    clientJSX = await fetchClientJSX(pathname);
    jsxCache.set(pathname, clientJSX);
  }

  if (oldPathname !== pathname) root.render(clientJSX);
}

async function fetchClientJSX(pathname) {
  const response = await fetch(pathname + '?jsx');
  const clientJSXString = await response.text();
  const clientJSX = JSON.parse(clientJSXString, parseJSX);
  return clientJSX;
}

window.addEventListener(
  'click',
  (e) => {
    if (e.target.tagName !== 'A') return;

    // Ignore "open in a new tab"
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const href = e.target.getAttribute('href');
    if (!href.startsWith('/')) return;

    e.preventDefault();
    window.history.pushState(null, null, href);

    navigate(href);
  },
  true
);

window.addEventListener('popstate', () => {
  navigate(window.location.pathname, true);
});

window.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    await post(currPathname, e.target.elements.newComment.value);

    const clientJSX = await fetchClientJSX(currPathname);
    jsxCache.set(currPathname, clientJSX);
    root.render(clientJSX);
  } catch (err) {
    console.error(err);
  }
});
