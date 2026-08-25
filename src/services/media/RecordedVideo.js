/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Build a plain preview Blob and an upload File from the exact MediaRecorder
 * chunks. Blob parts are immutable and implementations may share their backing
 * data, so retaining both wrappers does not require copying the recording.
 *
 * @param {Blob[]} chunks MediaRecorder output chunks.
 * @param {string} recorderMimeType MIME type reported by MediaRecorder.
 * @param {number} timestamp Timestamp used in the file name.
 * @return {{ blob: Blob, file: File }} Recorded preview and upload objects.
 */
export function createRecordedVideo(
	chunks,
	recorderMimeType,
	timestamp = Date.now(),
) {
	const mimeType = recorderMimeType || 'video/webm'
	const extension = mimeType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm'
	const size = chunks.reduce((total, chunk) => total + chunk.size, 0)
	if (!size) {
		throw new Error('Browser recorder returned no video data')
	}
	const blob = new Blob(chunks, { type: mimeType })
	const file = new File([blob], `recording-${timestamp}.${extension}`, {
		type: mimeType,
	})
	return { blob, file }
}

/**
 * Backwards-compatible helper for callers that only need the upload File.
 *
 * @param {Blob[]} chunks MediaRecorder output chunks.
 * @param {string} recorderMimeType MIME type reported by MediaRecorder.
 * @param {number} timestamp Timestamp used in the file name.
 * @return {File} Recorded video file.
 */
export function createRecordedVideoFile(
	chunks,
	recorderMimeType,
	timestamp = Date.now(),
) {
	return createRecordedVideo(chunks, recorderMimeType, timestamp).file
}

/**
 * Check whether a video answer represents a completed server upload.
 * Preview-only recordings never contain these server-issued credentials.
 *
 * @param {unknown} value Video answer value.
 * @return {boolean} Whether the value is ready for form submission.
 */
export function isCompletedVideoUpload(value) {
	if (!value || typeof value !== 'object') {
		return false
	}

	if (
		typeof value.uploadedFileId !== 'number'
		&& typeof value.uploadedFileId !== 'string'
	) {
		return false
	}

	const uploadedFileId = Number(value.uploadedFileId)
	return (
		Number.isInteger(uploadedFileId)
		&& uploadedFileId > 0
		&& typeof value.uploadToken === 'string'
		&& value.uploadToken.length > 0
	)
}
