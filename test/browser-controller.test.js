import test from 'node:test'
import assert from 'node:assert/strict'

import { CORRECTIVE_SNAPSHOT_INTERVAL_MS } from '../dist/browser/browser-controller.js'

test('corrective host snapshots run once per minute', () => {
	assert.equal(CORRECTIVE_SNAPSHOT_INTERVAL_MS, 60_000)
})
