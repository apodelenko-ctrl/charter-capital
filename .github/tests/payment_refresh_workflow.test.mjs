import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync(new URL('../workflows/property-cbr.yml', import.meta.url), 'utf8');
const blocks = workflow.split(/^      - name: /m).slice(1);
const publish = blocks.find(block => /^        id: publish$/m.test(block));
const pages = blocks.find(block => block.startsWith('Build GitHub Pages and verify both published sources\n'));
assert(publish && pages, 'The rate publication and live verification steps must exist');
const condition = block => {
  const match = /^        if: (.+)$/m.exec(block);
  assert(match, 'A publication step needs an explicit condition');
  // GitHub's simple equality/boolean expressions use the same operators here.
  // Evaluate the actual workflow gate across failures, rather than asserting
  // that the YAML merely contains a preferred spelling of the condition.
  return new Function('github', 'steps', 'always', `return Boolean(${match[1]});`);
};
const mayPublish = condition(publish), mayBuild = condition(pages);
const context = ({event = 'schedule', ref = 'refs/heads/main', cbr = 'success', bank = 'success', published = 'success', changed = 'true', force} = {}) => ({
  github: {event_name: event, ref, event: {inputs: {force_refresh: force}}},
  steps: {cbr: {outcome: cbr}, bank_reader: {outcome: 'success'}, bank: {outcome: bank}, publish: {outcome: published, outputs: {changed}}},
});
const check = (gate, values) => {const {github, steps} = context(values); return gate(github, steps, () => true);};

test('publishes only a complete successful rate set from main', () => {
  for (const cbr of ['success', 'failure', 'skipped', 'cancelled']) {
    for (const bank of ['success', 'failure', 'skipped', 'cancelled']) {
      assert.equal(check(mayPublish, {cbr, bank}), cbr === 'success' && bank === 'success', `${cbr}/${bank}`);
    }
  }
  assert.equal(check(mayPublish, {ref: 'refs/heads/test-rates'}), false);
  assert.equal(check(mayPublish, {event: 'workflow_dispatch', cbr: 'failure'}), false);
});

test('a dispatch cannot publish Pages after a skipped or failed complete-set publication', () => {
  for (const event of ['schedule', 'push', 'workflow_dispatch']) {
    for (const published of ['failure', 'skipped', 'cancelled']) {
      for (const changed of ['true', 'false']) {
        assert.equal(check(mayBuild, {event, published, changed}), false, `${event}/${published}/${changed}`);
      }
    }
  }
  assert.equal(check(mayBuild, {event: 'schedule'}), true);
  assert.equal(check(mayBuild, {event: 'schedule', changed: 'false'}), false);
  assert.equal(check(mayBuild, {event: 'workflow_dispatch', changed: 'false'}), true);
  assert.equal(check(mayBuild, {ref: 'refs/heads/test-rates'}), false);
});

test('a code push runs validation without reading or publishing official rates', () => {
  const validation = blocks.find(block => block.startsWith('Validate calculations and official source parsing\n'));
  assert(validation, 'Push validation must remain present');
  assert.doesNotMatch(validation, /^        if:/m, 'Validation runs on every configured event');
  assert.match(validation, /node --test \.github\/tests\/payment_\*\.test\.mjs \.github\/tests\/property_bank\.test\.cjs/);
  assert.match(validation, /python3 -m unittest discover -s \.github\/tests -p 'test_property_cbr\.py'/);

  const readers = blocks.filter(block => /^        id: (cbr|bank_reader|bank)$/m.test(block));
  assert.equal(readers.length, 3);
  const failureReport = blocks.find(block => block.startsWith('Report source failures while preserving the last complete rate set\n'));
  assert(failureReport);
  for (const step of [...readers, publish, pages, failureReport]) {
    const gate = condition(step);
    // Even synthetic successful source/publish outcomes cannot make a push
    // execute a reader, deploy rates, or report nonexistent source failures.
    assert.equal(check(gate, {event: 'push'}), false, step.split('\n')[0]);
    assert.equal(check(gate, {event: 'schedule'}), true, step.split('\n')[0]);
    assert.equal(check(gate, {event: 'workflow_dispatch'}), true, step.split('\n')[0]);
  }
});

test('the single daily Moscow cycle renews both real source verification timestamps', () => {
  const schedule = /^  schedule:\n([\s\S]*?)(?=^\S)/m.exec(workflow)?.[1];
  assert(schedule, 'The daily schedule must exist');
  assert.equal((schedule.match(/- cron:/g) || []).length, 1);
  assert.match(schedule, /cron: '0 11 \* \* \*'/);
  assert.match(schedule, /timezone: 'Europe\/Moscow'/);
  const sources = blocks.filter(block => /^        id: (cbr|bank)$/m.test(block));
  assert.equal(sources.length, 2);
  for (const source of sources) {
    const expression = /^          FORCE_REFRESH: \$\{\{ (.+) \}\}$/m.exec(source)?.[1];
    assert(expression, 'Each source needs its verification mode');
    const forceMode = new Function('github', `return ${expression};`);
    assert.equal(forceMode(context().github), 'true');
    assert.equal(forceMode(context({event: 'push'}).github), 'false');
    assert.equal(forceMode(context({event: 'workflow_dispatch', force: 'true'}).github), 'true');
    assert.equal(forceMode(context({event: 'workflow_dispatch', force: 'false'}).github), 'false');
    assert.match(source, /--force-refresh/);
  }
});
