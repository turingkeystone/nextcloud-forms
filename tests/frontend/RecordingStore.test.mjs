/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
	isStaleRecordingId,
	RecordingStore,
} from '../../src/services/media/RecordingStore.js'

const NOW = 2_000_000_000_000

test('keeps recent recordings from sibling tabs', () => {
	assert.equal(isStaleRecordingId(`${NOW - 1000}-page-recording`, NOW), false)
})

test('removes recordings older than 24 hours', () => {
	assert.equal(
		isStaleRecordingId(`${NOW - 24 * 60 * 60 * 1000 - 1}-page-recording`, NOW),
		true,
	)
})

test('removes legacy recording identifiers without timestamps', () => {
	assert.equal(isStaleRecordingId('legacy-page-recording', NOW), true)
})

test('allows the browser default MIME type to be discovered from a chunk', async () => {
	const store = new RecordingStore()
	assert.equal(store.mimeType, '')
	assert.equal(store.extension, '')
	assert.match(store.storageFileName, /\.recording$/)

	store.backend = 'opfs'
	store.writable = { write: async () => {} }
	await store.append(new Blob(['video'], { type: 'video/mp4;codecs=avc1' }))
	assert.equal(store.mimeType, 'video/mp4;codecs=avc1')
	assert.equal(store.extension, 'mp4')
})

test('rejects a non-video MIME type returned by the recorder', () => {
	const store = new RecordingStore()
	assert.throws(
		() => store.setMimeType('audio/mp4'),
		/invalid recording MIME type/,
	)
})

test('falls back to IndexedDB when the first OPFS chunk cannot be written', async () => {
	const originalIndexedDb = globalThis.indexedDB
	globalThis.indexedDB = {}
	const store = new RecordingStore()
	store.backend = 'opfs'
	store.writable = {
		write: async () => {
			throw new Error('OPFS write failed')
		},
	}
	let fallbackCalled = false
	let appendedBlob = null
	store.fallbackFromEmptyOpfs = async () => {
		fallbackCalled = true
		store.backend = 'indexeddb'
	}
	store.appendIndexedDb = async (blob) => {
		appendedBlob = blob
	}
	const blob = new Blob(['video'], { type: 'video/webm' })

	try {
		await store.append(blob)
		assert.equal(fallbackCalled, true)
		assert.equal(appendedBlob, blob)
	} finally {
		globalThis.indexedDB = originalIndexedDb
	}
})

test('does not change backends after OPFS already contains video chunks', async () => {
	const store = new RecordingStore()
	store.backend = 'opfs'
	store.opfsChunksWritten = 1
	store.writable = {
		write: async () => {
			throw new Error('OPFS became full')
		},
	}
	store.fallbackFromEmptyOpfs = async () => {
		throw new Error('unexpected fallback')
	}

	await assert.rejects(
		store.append(new Blob(['video'], { type: 'video/webm' })),
		/OPFS became full/,
	)
})
