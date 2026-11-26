import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

const tests = run({
  files: [fileURLToPath(new URL('./puzzle-play.test.mjs', import.meta.url))],
  testNamePatterns: process.argv.slice(2),
  execArgv: ['--disable-warning=ExperimentalWarning'],
});
tests.on('test:fail', () => { process.exitCode = 1; });
tests.compose(spec).pipe(process.stdout);