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

  const currentTargets = parseTargets(config);
  const targetWeb = currentTargets.includes('web');
  const targetEs5 = currentTargets.includes('es5');

  function toggleTarget(name, on) {
    setConfig((src) => writeTarget(src, name, on));
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
                <input type="checkbox" checked={targetWeb} onChange={(e) => toggleTarget('web', e.target.checked)} />
                web
              </label>
              <label style={checkboxLabel}>
                <input type="checkbox" checked={targetEs5} onChange={(e) => toggleTarget('es5', e.target.checked)} />
                es5
              </label>
            </>
          }
        >
          <Editor language="javascript" theme="vs-dark" value={config} onChange={(v) => setConfig(v ?? '')} options={editorOpts} />
        </Pane>
        <Pane
          title="source (ES6+)"
          actions={
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={hasCoreJs(code)}
                onChange={(e) => setCode((src) => toggleCoreJs(src, e.target.checked))}
              />
              core-js/stable
            </label>
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

const CORE_JS_IMPORT = "import 'core-js/stable';";

function hasCoreJs(src) {
  return src.includes('core-js/stable');
}

function toggleCoreJs(src, on) {
  if (on) {
    if (hasCoreJs(src)) return src;
    const firstLine = src.split('\n', 1)[0];
    const separator = firstLine.trim() === '' ? '\n' : '\n\n';
    return CORE_JS_IMPORT + separator + src;
  }
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('core-js/stable')) {
      if (i + 1 < lines.length && lines[i + 1].trim() === '') i++;
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

function writeTarget(src, name, on) {
  const current = parseTargets(src);
  const next = on
    ? (current.includes(name) ? current : [...current, name])
    : current.filter((t) => t !== name);
  const span = findTargetArray(src);
  if (!span) return src;
  const inner = next.map((t) => `'${t}'`).join(', ');
  return src.slice(0, span.open + 1) + inner + src.slice(span.close);
}
