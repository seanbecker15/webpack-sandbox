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
        <Pane title="webpack.config.js">
          <Editor language="javascript" theme="vs-dark" value={config} onChange={(v) => setConfig(v ?? '')} options={editorOpts} />
        </Pane>
        <Pane title="source (ES6+)">
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
