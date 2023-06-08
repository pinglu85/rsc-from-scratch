import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { renderToString } from 'react-dom/server';

import { processPOSTData } from '../utils/processPOSTData.js';
import { parseJSX } from '../utils/parseJSX.js';
import { post } from '../utils/post.js';

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (
    url.pathname === '/client.js' ||
    (url.pathname.startsWith('/utils/') && url.pathname.endsWith('.js'))
  ) {
    sendScript(res, '.' + url.pathname);
    return;
  }

  try {
    const rscServerURL = 'http://127.0.0.1:8081' + url.pathname;

    if (req.method === 'POST' && url.pathname !== '/') {
      await postDataToRSC(req, rscServerURL);
      res.end();
      return;
    }

    const response = await fetch(rscServerURL);
    if (!response.ok) {
      res.statusCode = response.status;
      res.end();
      return;
    }

    const clientJSXString = await response.text();

    // If the user is navigating between pages, send the serialized JSX.
    if (url.searchParams.has('jsx')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(clientJSXString);
    } else {
      // If this is an initial page load, revive the tree and turn it into HTML.
      const clientJSX = JSON.parse(clientJSXString, parseJSX);

      let html = renderToString(clientJSX);
      html += `<script>window.__INITIAL_CLIENT_JSX_STRING__=`;
      html += JSON.stringify(clientJSXString).replace(/</g, '\\u003c');
      html += `</script>`;

      html += `
        <script type="importmap">
          {
            "imports": {
              "react": "https://esm.sh/react@canary",
              "react-dom/client": "https://esm.sh/react-dom@canary/client"
            }
          }
        </script>
        <script type="module" src="/client.js"></script>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    }
  } catch (err) {
    console.error(err);
    res.statusCode = err.statusCode ?? 500;
    res.end();
  }
}).listen(8080);

async function sendScript(res, filename) {
  const content = await readFile(filename, 'utf-8');

  res.writeHead(200, { 'Content-Type': 'text/javascript' });
  res.end(content);
}

async function postDataToRSC(req, rscServerURL) {
  const data = await processPOSTData(req);

  return post(rscServerURL, data);
}
