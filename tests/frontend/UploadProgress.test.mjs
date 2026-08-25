/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateChunkUploadProgress } from '../../src/services/upload/UploadProgress.js'

test('reports progress within the first multipart chunk', () => {
	assert.equal(calculateChunkUploadProgress(1000, 0, 1000, 250, 1000), 25)
	assert.equal(calculateChunkUploadProgress(1000, 0, 1000, 750, 1000), 75)
})

test('combines multipart progress across chunks', () => {
	assert.equal(calculateChunkUploadProgress(1000, 400, 400, 200, 400), 60)
})

test('reserves 100 percent for successful server assembly', () => {
	assert.equal(calculateChunkUploadProgress(1000, 0, 1000, 1000, 1000), 99)
	assert.equal(calculateChunkUploadProgress(0, 0, 0, 0, 0), 0)
})
