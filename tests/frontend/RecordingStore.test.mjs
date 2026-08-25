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

test('does not reject a generic MIME type on an individual recorder chunk', async () => {
	const store = new RecordingStore()
	store.backend = 'memory'
	store.setMimeType('video/mp4;codecs=avc1')

	await store.append(new Blob(['video'], { type: 'application/octet-stream' }))
	const file = await store.finalize()

	assert.equal(file.type, 'video/mp4;codecs=avc1')
	assert.equal(await file.text(), 'video')
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

test('falls back to memory when the first IndexedDB Blob write fails', async () => {
	const store = new RecordingStore()
	store.backend = 'indexeddb'
	store.database = { close: () => {} }
	store.appendIndexedDb = async () => {
		throw new Error('IndexedDB Blob write failed')
	}
	const blob = new Blob(['video'], { type: 'video/webm' })

	await store.append(blob)

	assert.equal(store.backend, 'memory')
	assert.deepEqual(store.memoryChunks, [blob])
})

test('falls back to memory when OPFS and IndexedDB both fail initially', async () => {
	const store = new RecordingStore()
	store.backend = 'opfs'
	store.writable = {
		write: async () => {
			throw new Error('OPFS write failed')
		},
	}
	store.fallbackFromEmptyOpfs = async () => {
		store.backend = 'memory'
	}
	const blob = new Blob(['video'], { type: 'video/webm' })

	await store.append(blob)

	assert.equal(store.backend, 'memory')
	assert.deepEqual(store.memoryChunks, [blob])
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

test('keeps recording in memory when persistent browser storage is unavailable', async () => {
	const store = new RecordingStore()
	store.backend = 'memory'
	await store.append(new Blob(['first'], { type: 'video/mp4' }))
	await store.append(new Blob(['second'], { type: 'video/mp4' }))

	const file = await store.finalize()
	assert.equal(file.type, 'video/mp4')
	assert.equal(await file.text(), 'firstsecond')

	await store.remove()
	assert.equal(store.memoryChunks.length, 0)
})

test('finalizes the exact bytes written to OPFS', async () => {
	const storedParts = []
	const store = new RecordingStore()
	store.backend = 'opfs'
	store.writable = {
		write: async (blob) => storedParts.push(blob),
		close: async () => {},
	}
	store.fileHandle = {
		getFile: async () => new Blob(storedParts, { type: 'video/mp4' }),
	}

	await store.append(new Blob(['first'], { type: 'video/mp4' }))
	await store.append(new Blob(['second'], { type: 'video/mp4' }))
	const file = await store.finalize()

	assert.equal(file.type, 'video/mp4')
	assert.equal(await file.text(), 'firstsecond')
})
