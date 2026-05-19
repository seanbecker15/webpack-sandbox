import express from 'express';
import webpack from 'webpack';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const app = express();
app.use(express.json({ limit: '2mb' }));

function evalConfig(source) {
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', source);
  fn(module, module.exports, require, ROOT);
  return module.exports;
}

app.post('/api/build', async (req, res) => {
  const { webpackConfig = '', code = '' } = req.body ?? {};

  let userConfig;
  try {
    userConfig = evalConfig(webpackConfig);
  } catch (err) {
    return res.status(400).json({ error: `Config error: ${err.message}` });
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-sandbox-'));
  const srcDir = path.join(tmp, 'src');
  const outDir = path.join(tmp, 'dist');
  await fs.mkdir(srcDir, { recursive: true });
  const entry = path.join(srcDir, 'index.js');
  await fs.writeFile(entry, code);

  const userModule = userConfig.module || {};
  const userRules = userModule.rules || [];
  // Force the user's source to be parsed as javascript/auto so our root
  // package.json ("type": "module") doesn't impose strict-ESM resolution.
  const autoTypeRule = { test: /\.m?js$/, type: 'javascript/auto', resolve: { fullySpecified: false } };

  const config = {
    ...userConfig,
    context: ROOT,
    entry,
    output: { ...(userConfig.output || {}), path: outDir, filename: 'bundle.js' },
    mode: 'development',
    devtool: false,
    optimization: { ...(userConfig.optimization || {}), minimize: false },
    resolve: { ...(userConfig.resolve || {}), modules: [path.join(ROOT, 'node_modules'), 'node_modules'] },
    resolveLoader: { modules: [path.join(ROOT, 'node_modules')] },
    module: { ...userModule, rules: [autoTypeRule, ...userRules] }
  };

  webpack(config, async (err, stats) => {
    try {
      if (err) return res.status(500).json({ error: err.message });
      const info = stats.toJson({ errors: true, warnings: true, assets: true, modules: true });
      if (stats.hasErrors()) {
        return res.status(400).json({ error: info.errors.map(e => e.message).join('\n\n') });
      }
      const out = await fs.readFile(path.join(outDir, 'bundle.js'), 'utf8');
      const banner = buildBanner(info, out);
      const finalOutput = banner + out;
      const userCodeLine = findUserCodeLine(finalOutput, entry);
      res.json({ output: finalOutput, userCodeLine, warnings: info.warnings.map(w => w.message) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  });
});

function findUserCodeLine(output, entryPath) {
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(entryPath) && lines[i].includes('!***')) {
      // webpack's source banner is 3 lines: opener, "!*** path ***!", closer.
      // i is 0-indexed at the middle line, so the first code line is (i+1)+1 in 1-indexed.
      return i + 3;
    }
  }
  return 1;
}

function formatSize(bytes) {
  const kb = bytes / 1024;
  if (kb < 1) return `${bytes} B`;
  const mb = kb / 1024;
  if (mb < 1) return `${kb.toFixed(2)} KB`;
  const gb = mb / 1024;
  if (gb < 1) return `${mb.toFixed(2)} MB`;
  return `${gb.toFixed(2)} GB`;
}

function buildBanner(info, output) {
  const bytes = Buffer.byteLength(output, 'utf8');
  const lines = [
    'Build metadata',
    `  built at:    ${new Date().toISOString()}`,
    `  webpack:     ${info.version}`,
    `  hash:        ${info.hash}`,
    `  build time:  ${info.time} ms`,
    `  modules:     ${info.modules?.length ?? 0}`,
    `  bundle size: ${bytes} bytes (${formatSize(bytes)}, unminified)`,
    `  warnings:    ${info.warnings?.length ?? 0}`
  ];
  return '/*!\n * ' + lines.join('\n * ') + '\n */\n';
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`server: http://localhost:${PORT}`));
