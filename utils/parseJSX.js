export function parseJSX(key, value) {
  if (value === '$RE') return Symbol.for('react.element');

  if (value === '$RF') return Symbol.for('react.fragment');

  if (typeof value === 'string' && value.startsWith('$$')) {
    return value.slice(1);
  }

  return value;
}
