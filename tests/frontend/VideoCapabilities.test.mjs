/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
	BROWSER_DEFAULT_FORMAT_ID,
	calculateRecordingElapsedSeconds,
	estimateRecordingBytes,
	getRecorderMimeType,
	hasRecordingStartCapacity,
	normalizeRecordingOrientation,
	pickDefaultRecorderFormat,
	pickDefaultResolution,
	probeRecorderFormats,
	probeResolutions,
	recordingOrientationMatches,
	shouldUseChunkedRecording,
	startMediaRecorder,
	VIDEO_MAX_BYTES,
	VIDEO_MAX_DURATION_SECONDS,
	VIDEO_RECORDER_TIMESLICE_MS,
} from '../../src/services/media/VideoCapabilities.js'

test('uses 1080p first and falls back to 720p', () => {
	assert.equal(pickDefaultResolution(['720p', '1080p', '2160p']), '1080p')
	assert.equal(pickDefaultResolution(['720p', '2160p']), '720p')
	assert.equal(pickDefaultResolution(['2160p']), '2160p')
})

test('defaults legacy forms to landscape and matches configured orientation', () => {
	assert.equal(normalizeRecordingOrientation(undefined), 'landscape')
	assert.equal(normalizeRecordingOrientation('square'), 'landscape')
	assert.equal(normalizeRecordingOrientation('portrait'), 'portrait')
	assert.equal(recordingOrientationMatches('landscape', false), true)
	assert.equal(recordingOrientationMatches('landscape', true), false)
	assert.equal(recordingOrientationMatches('portrait', true), true)
	assert.equal(recordingOrientationMatches('portrait', false), false)
	assert.equal(recordingOrientationMatches('any', true), true)
	assert.equal(recordingOrientationMatches('any', false), true)
})

test('estimates bounded browser storage without changing the 16 GiB limit', () => {
	assert.equal(VIDEO_MAX_BYTES, 17_179_869_184)
	assert.equal(VIDEO_MAX_DURATION_SECONDS, 7200)
	assert.equal(estimateRecordingBytes('unknown', 7200, true), 0)
	assert.ok(estimateRecordingBytes('1080p', 7200, true) < VIDEO_MAX_BYTES)
})

test('requires space for one chunk instead of the full recording', () => {
	const fullRecording = estimateRecordingBytes('1080p', 7200, true)
	const nextChunk = estimateRecordingBytes('1080p', 2, true)
	assert.ok(fullRecording > nextChunk)
	assert.equal(
		hasRecordingStartCapacity({ quota: nextChunk + 1, usage: 1 }, '1080p', true),
		true,
	)
	assert.equal(
		hasRecordingStartCapacity({ quota: nextChunk, usage: 1 }, '1080p', true),
		false,
	)
})

test('allows real storage writes to decide when estimates are unavailable', () => {
	assert.equal(hasRecordingStartCapacity({}, '1080p', true), true)
	assert.equal(
		hasRecordingStartCapacity({ quota: 0, usage: 0 }, '1080p', true),
		true,
	)
})

test('accepts rotated mobile settings and 29.97 fps', async () => {
	const constraints = []
	const track = {
		async applyConstraints(value) {
			constraints.push(value)
		},
		getSettings() {
			return { width: 1080, height: 1920, frameRate: 29.97 }
		},
	}

	assert.deepEqual(await probeResolutions(track, ['1080p'], 30, '1080p'), [
		'1080p',
	])
	assert.equal(constraints[0].frameRate.exact, undefined)
	assert.equal(constraints[0].frameRate.ideal, 30)
})

test('uses ideal constraints only when actual dimensions still match', async () => {
	let settings = {}
	const track = {
		async applyConstraints(constraints) {
			if (constraints.width.exact) {
				throw new Error('Exact constraints unsupported')
			}
			settings = { width: 1280, height: 720, frameRate: 30 }
		},
		getSettings() {
			return settings
		},
	}

	assert.deepEqual(await probeResolutions(track, ['720p'], 30, '720p'), ['720p'])
})

test('does not report 4K when fallback settings only produce 1080p', async () => {
	const track = {
		async applyConstraints() {},
		getSettings() {
			return { width: 1920, height: 1080, frameRate: 30 }
		},
	}

	assert.deepEqual(await probeResolutions(track, ['2160p'], 30, '2160p'), [])
})

test('keeps the browser default encoder when its MIME type is unknown before start', async () => {
	const originalMediaRecorder = globalThis.MediaRecorder
	globalThis.MediaRecorder = class MediaRecorderMock {
		static isTypeSupported() {
			return false
		}
	}

	try {
		const formats = await probeRecorderFormats()
		assert.deepEqual(formats, [
			{
				id: BROWSER_DEFAULT_FORMAT_ID,
				label: 'Browser default',
				mimeType: '',
			},
		])
	} finally {
		globalThis.MediaRecorder = originalMediaRecorder
	}
})

test('lists every detected codec group and keeps browser default selected first', async () => {
	const originalMediaRecorder = globalThis.MediaRecorder
	globalThis.MediaRecorder = class MediaRecorderMock {
		static isTypeSupported() {
			return true
		}
	}

	try {
		const formats = await probeRecorderFormats()
		assert.equal(formats[0].id, BROWSER_DEFAULT_FORMAT_ID)
		assert.equal(formats[0].mimeType, '')
		assert.equal(formats[1].mimeType, 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"')
		assert.deepEqual(
			formats.slice(1).map((format) => format.label),
			[
				'MP4 · H.264/AAC (avc1)',
				'MP4 · H.264/AAC',
				'MP4 · browser-selected codec',
				'MP4 · AV1/AAC',
				'MP4 · HEVC/AAC',
				'WebM · VP9/Opus',
				'WebM · VP8/Opus',
				'WebM · AV1/Opus',
				'WebM · H.264/Opus',
				'WebM · browser-selected codec',
			],
		)
	} finally {
		globalThis.MediaRecorder = originalMediaRecorder
	}
})

test('selects MP4 H.264/AAC by default and falls back when unavailable', () => {
	assert.equal(
		pickDefaultRecorderFormat([
			{ id: BROWSER_DEFAULT_FORMAT_ID, label: 'Browser default' },
			{ id: 'video/webm', label: 'WebM · browser-selected codec' },
			{ id: 'video/mp4;codecs=avc1', label: 'MP4 · H.264/AAC (avc1)' },
		]),
		'video/mp4;codecs=avc1',
	)
	assert.equal(
		pickDefaultRecorderFormat([
			{ id: BROWSER_DEFAULT_FORMAT_ID, label: 'Browser default' },
			{ id: 'video/webm', label: 'WebM · browser-selected codec' },
		]),
		BROWSER_DEFAULT_FORMAT_ID,
	)
})

test('passes the selected RecordingMobile MIME type to MediaRecorder', () => {
	const selected = {
		label: 'MP4 · H.264/AAC (avc1)',
		mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
	}

	assert.equal(getRecorderMimeType(selected), selected.mimeType)
	assert.equal(getRecorderMimeType({ mimeType: '' }), '')
})

test('persists WebM output in periodic browser-storage chunks', () => {
	let startArguments
	const recorder = {
		mimeType: 'video/webm;codecs=vp9,opus',
		start(...args) {
			startArguments = args
		},
	}

	startMediaRecorder(recorder)
	assert.equal(VIDEO_RECORDER_TIMESLICE_MS, 1_000)
	assert.deepEqual(startArguments, [VIDEO_RECORDER_TIMESLICE_MS])
})

test('keeps MP4 as one final Blob for WebKit-compatible playback', () => {
	for (const mimeType of [
		'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
		'video/mp4',
		'',
		undefined,
	]) {
		let startArguments
		const recorder = {
			mimeType,
			start(...args) {
				startArguments = args
			},
		}

		assert.equal(shouldUseChunkedRecording(mimeType), false)
		startMediaRecorder(recorder)
		assert.deepEqual(startArguments, [])
	}
	assert.equal(shouldUseChunkedRecording('VIDEO/WEBM;CODECS=VP8'), true)
})

test('calculates a stable recording duration across timer throttling and pauses', () => {
	assert.equal(calculateRecordingElapsedSeconds(1_000, 3_999, 0), 2)
	assert.equal(calculateRecordingElapsedSeconds(1_000, 8_000, 2_000, 7_000), 4)
})
