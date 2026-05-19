import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

const DEFAULT_CONFIG = `module.exports = {
  entry: {
    main: './src/index.js',
  },
  target: ['web', 'es5'],
  module: {
    rules: [
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/env']
            ]
          }
        }
      }
    ]
  }
};
`;

const DEFAULT_CODE = `import 'core-js/stable';

const greet = (name) => \`Hello, \${name}!\`;

class Counter {
  #count = 0;
  inc() { this.#count++; return this.#count; }
}

const set = new Set([1, 2, 3]);
const promise = Promise.resolve([...set].includes(2));
promise.then((ok) => console.log(greet('world'), ok));
`;

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState('// Click Build to transpile');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [userCodeLine, setUserCodeLine] = useState(1);
  const outputEditorRef = useRef(null);

  const esMode = parseTargets(config).includes('es5') ? 'es5' : 'es6';

  function setEsMode(mode) {
    setConfig((src) => {
      const targets = mode === 'es5' ? ['web', 'es5'] : ['web'];
      return setBabelMode(setTargets(src, targets), mode);
    });
  }

  useEffect(() => {
    if (outputEditorRef.current && userCodeLine > 1) {
      outputEditorRef.current.revealLineInCenter(userCodeLine);
      outputEditorRef.current.setPosition({ lineNumber: userCodeLine, column: 1 });
    }
  }, [output, userCodeLine]);

  async function build() {
    setBuilding(true);
    setError('');
    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webpackConfig: config, code })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Build failed');
        setOutput('');
      } else {
        setOutput(data.output);
        setUserCodeLine(data.userCodeLine ?? 1);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBuilding(false);
    }
  }

  const editorOpts = { minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false };

  function scrollOutputToTop() {
    const ed = outputEditorRef.current;
    if (!ed) return;
    ed.revealLine(1);
    ed.setPosition({ lineNumber: 1, column: 1 });
  }

  function scrollOutputToUserCode() {
    const ed = outputEditorRef.current;
    if (!ed || userCodeLine <= 1) return;
    ed.revealLineInCenter(userCodeLine);
    ed.setPosition({ lineNumber: userCodeLine, column: 1 });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '8px 12px', background: '#252526', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>webpack sandbox</strong>
        <button onClick={build} disabled={building} style={{ padding: '4px 12px' }}>
          {building ? 'Building…' : 'Build'}
        </button>
        {error && <span style={{ color: '#f48771', fontSize: 12, whiteSpace: 'pre-wrap' }}>{error}</span>}
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', flex: 1, minHeight: 0 }}>
        <Pane
          title="webpack.config.js"
          actions={
            <>
              <label style={checkboxLabel}>
                <input type="radio" name="es-mode" checked={esMode === 'es5'} onChange={() => setEsMode('es5')} />
                ES5
              </label>
              <label style={checkboxLabel}>
                <input type="radio" name="es-mode" checked={esMode === 'es6'} onChange={() => setEsMode('es6')} />
                ES6
              </label>
            </>
          }
        >
          <Editor language="javascript" theme="vs-dark" value={config} onChange={(v) => setConfig(v ?? '')} options={editorOpts} />
        </Pane>
        <Pane
          title="source (ES6+)"
          actions={
            <>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={hasImport(code, 'core-js/stable')}
                  onChange={(e) => setCode((src) => togglePolyfill(src, 'core-js/stable', e.target.checked))}
                />
                core-js/stable
              </label>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={hasImport(code, 'intersection-observer')}
                  onChange={(e) => setCode((src) => togglePolyfill(src, 'intersection-observer', e.target.checked))}
                />
                intersection-observer
              </label>
            </>
          }
        >
          <Editor language="javascript" theme="vs-dark" value={code} onChange={(v) => setCode(v ?? '')} options={editorOpts} />
        </Pane>
        <Pane
          title="bundle output"
          actions={
            <>
              <button onClick={scrollOutputToTop} style={paneBtn}>Scroll to top</button>
              <button onClick={scrollOutputToUserCode} style={paneBtn} disabled={userCodeLine <= 1}>Scroll to my code</button>
            </>
          }
        >
          <Editor
            language="javascript"
            theme="vs-dark"
            value={output}
            options={{ ...editorOpts, readOnly: true }}
            onMount={(editor) => { outputEditorRef.current = editor; }}
          />
        </Pane>
      </div>
    </div>
  );
}

function Pane({ title, actions, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #333', minHeight: 0 }}>
      <div style={{ padding: '4px 10px', background: '#2d2d2d', fontSize: 12, color: '#bbb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <span>{title}</span>
        {actions && <span style={{ display: 'flex', gap: 6 }}>{actions}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

const paneBtn = { padding: '2px 8px', fontSize: 11, background: '#3c3c3c', color: '#ddd', border: '1px solid #555', borderRadius: 3, cursor: 'pointer' };
const checkboxLabel = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' };

// Polyfills below are ordered: each must appear before the next when both are present.
const POLYFILL_ORDER = ['core-js/stable', 'intersection-observer'];

function hasImport(src, pkg) {
  return src.includes(pkg);
}

function importLine(pkg) {
  return `import '${pkg}';`;
}

function togglePolyfill(src, pkg, on) {
  if (on) {
    if (hasImport(src, pkg)) return src;
    return insertPolyfill(src, pkg);
  }
  return removePolyfill(src, pkg);
}

function insertPolyfill(src, pkg) {
  const lines = src.split('\n');
  // Find the last preceding polyfill that's already present; insert after it.
  const order = POLYFILL_ORDER.indexOf(pkg);
  let insertAfter = -1;
  for (let i = 0; i < order; i++) {
    const prev = POLYFILL_ORDER[i];
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].includes(prev)) insertAfter = j;
    }
  }
  if (insertAfter >= 0) {
    lines.splice(insertAfter + 1, 0, importLine(pkg));
    return lines.join('\n');
  }
  // No preceding polyfill present — prepend with blank-line separator if needed.
  const firstLine = lines[0] ?? '';
  const separator = firstLine.trim() === '' ? '\n' : '\n\n';
  return importLine(pkg) + separator + src;
}

function removePolyfill(src, pkg) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pkg)) {
      // If the next line is blank and there are no remaining polyfill imports
      // before it, drop the blank too (keeps spacing tidy when removing the
      // last polyfill at the top of the file).
      const noOtherPolyfillsAbove = !out.some((l) => POLYFILL_ORDER.some((p) => p !== pkg && l.includes(p)));
      if (noOtherPolyfillsAbove && i + 1 < lines.length && lines[i + 1].trim() === '') i++;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

function findTargetArray(src) {
  const i = src.indexOf('target:');
  if (i < 0) return null;
  const open = src.indexOf('[', i);
  if (open < 0) return null;
  const close = src.indexOf(']', open);
  if (close < 0) return null;
  return { open, close };
}

function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === "'" || t[0] === '"') && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

function parseTargets(src) {
  const span = findTargetArray(src);
  if (!span) return [];
  return src.slice(span.open + 1, span.close)
    .split(',')
    .map(unquote)
    .filter(Boolean);
}

function setTargets(src, targets) {
  const span = findTargetArray(src);
  if (!span) {
    if (targets.length === 0) return src;
    return insertTargetLine(src, targets);
  }
  if (targets.length === 0) return removeTargetLine(src);
  const inner = targets.map((t) => `'${t}'`).join(', ');
  return src.slice(0, span.open + 1) + inner + src.slice(span.close);
}

function setBabelMode(src, mode) {
  const tag = "'@babel/env'";
  const i = src.indexOf(tag);
  if (i < 0) return src;
  // Walk back to the enclosing '[' for the preset entry.
  let open = i - 1;
  while (open >= 0 && src[open] !== '[') open--;
  if (open < 0) return src;
  // Find the matching ']' by bracket depth.
  let depth = 0;
  let close = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '[') depth++;
    else if (src[k] === ']') { depth--; if (depth === 0) { close = k; break; } }
  }
  if (close < 0) return src;
  const replacement = mode === 'es5'
    ? "['@babel/env']"
    : "['@babel/env', { targets: 'last 2 chrome versions' }]";
  return src.slice(0, open) + replacement + src.slice(close + 1);
}

function insertTargetLine(src, targets) {
  const i = src.indexOf('module.exports');
  if (i < 0) return src;
  const brace = src.indexOf('{', i);
  if (brace < 0) return src;
  let pos = brace + 1;
  if (src[pos] === '\n') pos++;
  const value = `[${targets.map((t) => `'${t}'`).join(', ')}]`;
  return src.slice(0, pos) + `  target: ${value},\n` + src.slice(pos);
}

function removeTargetLine(src) {
  const i = src.indexOf('target:');
  if (i < 0) return src;
  const lineStart = src.lastIndexOf('\n', i) + 1; // 0 if no prior newline
  const close = src.indexOf(']', i);
  if (close < 0) return src;
  let end = close + 1;
  if (src[end] === ',') end++;
  while (end < src.length && (src[end] === ' ' || src[end] === '\t')) end++;
  if (src[end] === '\n') end++;
  return src.slice(0, lineStart) + src.slice(end);
}
