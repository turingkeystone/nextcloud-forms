/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Convert one multipart request's transfer progress into whole-file progress.
 * The final percent is reserved for successful server-side assembly.
 *
 * @param {number} fileSize Total video bytes.
 * @param {number} chunkStart First byte of the current chunk.
 * @param {number} chunkSize Current chunk byte length.
 * @param {number} loaded Multipart request bytes sent so far.
 * @param {number|undefined} total Multipart request size including overhead.
 * @return {number} Whole upload percent from 0 through 99.
 */
export function calculateChunkUploadProgress(
	fileSize,
	chunkStart,
	chunkSize,
	loaded,
	total,
) {
	if (fileSize <= 0 || chunkSize <= 0) {
		return 0
	}
	const fraction =
		total > 0 ? Math.min(1, loaded / total) : Math.min(1, loaded / chunkSize)
	const transferred = Math.min(fileSize, chunkStart + chunkSize * fraction)
	return Math.min(99, Math.max(0, Math.floor((transferred / fileSize) * 100)))
}
