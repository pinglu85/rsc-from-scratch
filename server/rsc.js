import { createServer } from 'http';
import { readdir, readFile, writeFile } from 'fs/promises';
import sanitizeFilename from 'sanitize-filename';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import probe from 'probe-image-size';
import { Fragment } from 'react';

import { processPOSTData } from '../utils/processPOSTData.js';

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'POST' && url.pathname !== '/') {
      const postSlug = sanitizeFilename(url.pathname.slice(1));
      await addNewCommentToFile(req, postSlug);
      res.end();
      return;
    }

    await sendJSX(res, <Router url={url} />);
  } catch (err) {
    console.error(err);
    res.statusCode = err.statusCode ?? 500;
    res.end();
  }
}).listen(8081);

function Router({ url }) {
  let page;

  if (url.pathname === '/') {
    page = <BlogIndexPage />;
  } else if (!url.pathname.includes('.')) {
    // Don't match static files (e.g. favicon.ico)
    const postSlug = sanitizeFilename(url.pathname.slice(1));
    page = <BlogPostPage postSlug={postSlug} />;
  } else {
    const notFound = new Error('Not found.');
    notFound.statusCode = 404;
    throw notFound;
  }

  return (
    <BlogLayout>
      <Fragment key={url.pathname}>{page}</Fragment>
    </BlogLayout>
  );
}

function BlogLayout({ children }) {
  const author = 'Jae Doe';

  return (
    <html>
      <head>
        <title>My blog</title>
      </head>
      <body
        style={{
          background: '#' + ((Math.random() * 0xffffff) << 0).toString(16),
          transition: 'background .3s ease-in-out',
        }}
      >
        <nav>
          <a href="/">Home</a>
          <hr />
          <input />
          <hr />
        </nav>
        <main>{children}</main>
        <Footer author={author} />
      </body>
    </html>
  );
}

async function BlogIndexPage() {
  const postSlugs = await getPostSlugs();

  return (
    <>
      <h1>Welcome to my blog</h1>

      <div>
        {postSlugs.map((slug) => (
          <Post key={slug} slug={slug} />
        ))}
      </div>
    </>
  );
}

function BlogPostPage({ postSlug }) {
  return (
    <>
      <Post slug={postSlug} />
      <hr />
      <NewComment />
      <hr />
      <Comments postSlug={postSlug} />
      <hr />
      <PrevNextPost currPostSlug={postSlug} />
    </>
  );
}

async function Post({ slug }) {
  const content = await readFile('./posts/' + slug + '.md', 'utf-8');

  return (
    <section>
      <h2>
        <a href={'/' + slug}>{slug}</a>
      </h2>
      <article>
        <ReactMarkdown
          rehypePlugins={[rehypeHighlight]}
          components={{
            img: Image,
            // eslint-disable-next-line no-unused-vars
            p: ({ node, ...props }) => {
              return typeof props.children[0].type === 'function' ? (
                <Fragment {...props} />
              ) : (
                <p {...props} />
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </section>
  );
}

function NewComment() {
  return (
    <form>
      <label
        htmlFor="newComment"
        style={{ display: 'block', marginBottom: 16 }}
      >
        New Comment
      </label>

      <textarea
        id="newComment"
        name="newComment"
        rows="5"
        cols="33"
        style={{ display: 'block', marginBottom: 16 }}
        defaultValue="What are your thoughts?"
      />

      <button>comment</button>
    </form>
  );
}

async function Comments({ postSlug }) {
  const comments = await readCommentsFromFile();
  const postComments = comments[postSlug] ?? [];

  return (
    <section>
      <h3>Comments</h3>

      <ul>
        {postComments.map((comment) => (
          <li key={comment}>{comment}</li>
        ))}
      </ul>
    </section>
  );
}

async function Image({ src }) {
  let metadata;

  try {
    metadata = await probe(src);
  } catch (err) {
    console.error(err);
  }

  return (
    <figure style={{ marginLeft: 0, marginRight: 0 }}>
      <img src={src} width={400} />
      <figcaption>
        Width: {metadata?.width}, Height: {metadata?.height}
      </figcaption>
    </figure>
  );
}

async function PrevNextPost({ currPostSlug }) {
  const postSlugs = await getPostSlugs();
  const currPostSlugIndex = postSlugs.indexOf(currPostSlug);
  const prevPostSlug =
    currPostSlugIndex > 0 ? postSlugs[currPostSlugIndex - 1] : '';
  const nextPostSlug =
    currPostSlugIndex < postSlugs.length - 1
      ? postSlugs[currPostSlugIndex + 1]
      : '';

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      {prevPostSlug && <a href={'/' + prevPostSlug}>Previous post</a>}
      {nextPostSlug && <a href={'/' + nextPostSlug}>Next post</a>}
    </div>
  );
}

function Footer({ author }) {
  return (
    <footer>
      <hr />
      <p>
        <i>
          (c) {author}, {new Date().getFullYear()}
        </i>
      </p>
    </footer>
  );
}

async function sendJSX(res, jsx) {
  const clientJSX = await renderJSXToClientJSX(jsx);
  const clientJSXString = JSON.stringify(clientJSX, stringifyJSX);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(clientJSXString);
}

function stringifyJSX(key, value) {
  if (value === Symbol.for('react.element')) return '$RE'; // Could be any string.

  if (value === Symbol.for('react.fragment')) return '$RF';

  if (typeof value === 'string' && value.startsWith('$')) {
    // To avoid conflicts, prepend an extra `$` to any string that
    // already starts with `$`.
    return '$' + value;
  }

  return value;
}

async function renderJSXToClientJSX(jsx) {
  if (
    typeof jsx === 'string' ||
    typeof jsx === 'number' ||
    typeof jsx === 'boolean' ||
    jsx == null
  ) {
    return jsx;
  }

  if (Array.isArray(jsx)) {
    return Promise.all(jsx.map((child) => renderJSXToClientJSX(child)));
  }

  if (typeof jsx === 'object') {
    if (jsx.$$typeof !== Symbol.for('react.element')) {
      // This is an arbitrary object, i.e., props or something inside of them.
      // Go over every value inside, and process it as well in case there's some
      // JSX in it.
      return Object.fromEntries(
        await Promise.all(
          Object.entries(jsx).map(async ([propName, value]) => [
            propName,
            await renderJSXToClientJSX(value),
          ])
        )
      );
    }

    if (
      typeof jsx.type === 'string' ||
      jsx.type === Symbol.for('react.fragment')
    ) {
      return {
        ...jsx,
        props: await renderJSXToClientJSX(jsx.props),
      };
    }

    if (typeof jsx.type === 'function') {
      const Component = jsx.type;
      const { props } = jsx;
      const returnedJSX = await Component(props);
      return renderJSXToClientJSX(returnedJSX);
    }

    throw new Error('Not implemented.');
  }

  throw new Error('Not implemented.');
}

async function readCommentsFromFile() {
  const commentsString = await readFile('./posts/comments.json', 'utf-8');
  return JSON.parse(commentsString);
}

async function addNewCommentToFile(req, postSlug) {
  const reqBody = await processPOSTData(req);
  const comments = await readCommentsFromFile();

  if (!Object.hasOwn(comments, postSlug)) comments[postSlug] = [];

  comments[postSlug].push(reqBody);

  await writeFile('./posts/comments.json', JSON.stringify(comments));
}

async function getPostSlugs() {
  const postFiles = await readdir('./posts');

  return postFiles
    .filter((file) => /^.*\.md$/.test(file))
    .map((file) => file.split('.')[0]);
}
