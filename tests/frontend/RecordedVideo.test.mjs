/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
	createRecordedVideo,
	createRecordedVideoFile,
	isCompletedVideoUpload,
} from '../../src/services/media/RecordedVideo.js'

test('keeps a plain Blob for preview and a File for upload', async () => {
	const chunks = [
		new Blob(['first'], { type: 'video/mp4' }),
		new Blob(['second'], { type: 'video/mp4' }),
	]
	const recording = createRecordedVideo(
		chunks,
		'video/mp4;codecs=avc1,mp4a.40.2',
		100,
	)

	assert.equal(recording.blob.constructor, Blob)
	assert.equal(recording.blob.type, 'video/mp4;codecs=avc1,mp4a.40.2')
	assert.equal(await recording.blob.text(), 'firstsecond')
	assert.equal(recording.file.name, 'recording-100.mp4')
	assert.equal(await recording.file.text(), 'firstsecond')
})

test('creates one previewable file from MediaRecorder chunks', async () => {
	const file = createRecordedVideoFile(
		[
			new Blob(['first'], { type: 'video/mp4' }),
			new Blob(['second'], { type: 'video/mp4' }),
		],
		'video/mp4;codecs=avc1',
		123,
	)
	assert.equal(file.name, 'recording-123.mp4')
	assert.equal(file.type, 'video/mp4;codecs=avc1')
	assert.equal(await file.text(), 'firstsecond')
})

test('uses MediaRecorder.mimeType exactly like RecordingMobile', () => {
	const file = createRecordedVideoFile(
		[new Blob(['video'], { type: 'video/webm;codecs=vp8,opus' })],
		'video/mp4;codecs=avc1,mp4a.40.2',
		789,
	)
	assert.equal(file.name, 'recording-789.mp4')
	assert.equal(file.type, 'video/mp4;codecs=avc1,mp4a.40.2')
})

test('uses the same WebM fallback as RecordingMobile when MIME type is empty', () => {
	const file = createRecordedVideoFile(
		[new Blob(['video'], { type: 'video/webm;codecs=vp8' })],
		'',
		456,
	)
	assert.equal(file.name, 'recording-456.webm')
	assert.equal(file.type, 'video/webm')
})

test('rejects an empty browser recording', () => {
	assert.throws(() => createRecordedVideoFile([], 'video/webm'), /no video data/)
})

test('does not reject recorder chunks based on their optional Blob type', async () => {
	const file = createRecordedVideoFile(
		[new Blob(['video'], { type: 'application/octet-stream' })],
		'video/mp4;codecs=avc1',
	)

	assert.equal(file.type, 'video/mp4;codecs=avc1')
	assert.equal(await file.text(), 'video')
})

test('only treats a completed server upload as a submitted video', () => {
	assert.equal(isCompletedVideoUpload(undefined), false)
	assert.equal(isCompletedVideoUpload({ uploadedFileId: 12 }), false)
	assert.equal(isCompletedVideoUpload({ uploadToken: 'token' }), false)
	assert.equal(
		isCompletedVideoUpload({ uploadedFileId: {}, uploadToken: 'token' }),
		false,
	)
	assert.equal(
		isCompletedVideoUpload({ uploadedFileId: 0, uploadToken: 'token' }),
		false,
	)
	assert.equal(
		isCompletedVideoUpload({ uploadedFileId: '12', uploadToken: 'token' }),
		true,
	)
})
