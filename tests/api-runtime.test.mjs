import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtemp, readFile, writeFile, mkdir, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('compiled API modules load in Node ESM and return JSON without an auth cookie', async () => {
  const output = await mkdtemp(join(tmpdir(), 'tbs-api-runtime-'));
  try {
    await writeFile(join(output, 'package.json'), '{"type":"module"}');
    await symlink(resolve('node_modules'), join(output, 'node_modules'));
    async function compile(source, destination) {
      await mkdir(destination, { recursive: true });
      for (const entry of await readdir(source, { withFileTypes: true })) {
        const input = join(source, entry.name);
        if (entry.isDirectory()) await compile(input, join(destination, entry.name));
        else if (entry.name.endsWith('.ts')) {
          const result = ts.transpileModule(await readFile(input, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
          });
          await writeFile(join(destination, entry.name.replace(/\.ts$/, '.js')), result.outputText);
        }
      }
    }
    await compile('api', join(output, 'api'));
    for (const route of ['auth', 'employees', 'leave', 'quota', 'history', 'rollover']) {
      const { default: handler } = await import(pathToFileURL(join(output, 'api', route + '.js')));
      const response = {
        statusCode: 0, headers: {}, body: null,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; return this; },
        send(value) { this.body = JSON.parse(value); return this; },
      };
      await handler({ method: route === 'auth' ? 'GET' : 'OPTIONS', headers: {}, query: {} }, response);
      assert.equal(response.headers['Content-Type'], 'application/json');
      assert.equal(response.statusCode, route === 'auth' ? 200 : 405);
      if (route === 'auth') assert.deepEqual(response.body, { required: false, signedIn: true });
      if (route === 'rollover') {
        await handler({method:'POST',headers:{},query:{},body:{action:'apply',sourceYear:2025,carryLimit:5,expiresOn:'2026-03-31'}},response);
        assert.equal(response.statusCode,422);assert.ok(response.body.issues.includes('Preview is required before applying'));
      }
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
