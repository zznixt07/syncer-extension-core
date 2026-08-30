import test from 'node:test'
import assert from 'node:assert/strict'

import { createBrowserAdapterApi } from '../dist/browser/service-adapters.js'

const mediaElement = () => ({
	clientWidth: 640, clientHeight: 360, currentTime: 0, duration: 60,
	ended: false, muted: false, paused: false, playbackRate: 1, readyState: 4,
	addEventListener() {}, pause() {}, async play() {},
})

// `rect: null` stands for a node that cannot be measured at all.
const scopeWith = (errorNode, url = 'https://music.youtube.com/watch?v=abc123') => ({
	document: {
		title: 'Track - YouTube Music',
		querySelector: selector =>
			selector.includes('#error-screen') && errorNode ? errorNode : null,
		querySelectorAll: selector => (selector === 'video, audio' ? [mediaElement()] : []),
	},
	location: { href: url },
	setInterval: () => 1,
	clearInterval: () => undefined,
})

test('an error screen that never renders does not make the track unavailable', () => {
	// YouTube Music ships this element on every page, permanently zero sized.
	const node = { getBoundingClientRect: () => ({ width: 0, height: 0 }) }
	assert.equal(createBrowserAdapterApi(scopeWith(node)).inspect().status, 'ready')
})

test('an error screen the viewer can see still marks the track unavailable', () => {
	const node = { getBoundingClientRect: () => ({ width: 480, height: 270 }) }
	assert.equal(createBrowserAdapterApi(scopeWith(node)).inspect().status, 'unavailable')
})

test('an unmeasurable error node is trusted rather than ignored', () => {
	assert.equal(createBrowserAdapterApi(scopeWith({})).inspect().status, 'unavailable')
})

test('a page with no error screen at all stays ready', () => {
	assert.equal(createBrowserAdapterApi(scopeWith(null)).inspect().status, 'ready')
})
