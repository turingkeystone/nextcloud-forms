/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'
import OcsResponse2Data from '../../utils/OcsResponse2Data.js'
import { calculateChunkUploadProgress } from './UploadProgress.js'

const DEFAULT_CHUNK_SIZE = 4 * 1024 ** 2
const MAX_RETRIES = 3

/**
 * Add transport context without discarding the server's useful error details.
 *
 * @param {unknown} error Original Axios or browser error.
 * @param {string} stage Human-readable upload stage.
 * @return {Error} Contextual error.
 */
function uploadError(error, stage) {
	if (error?.code === 'ERR_CANCELED') {
		return error
	}
	const serverMessage =
		error?.response?.data?.ocs?.meta?.message
		|| error?.response?.data?.message
		|| error?.message
		|| 'Unknown error'
	const status = error?.response?.status ? ` (HTTP ${error.response.status})` : ''
	const contextualError = new Error(`${stage}: ${serverMessage}${status}`)
	contextualError.cause = error
	return contextualError
}

/** @param {number} milliseconds Backoff duration. */
function delay(milliseconds) {
	return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

/** @param {() => Promise<unknown>} operation Request operation. */
async function retry(operation) {
	let lastError
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			return await operation()
		} catch (error) {
			const status = error.response?.status
			if (
				error.code === 'ERR_CANCELED'
				|| (status && status < 500 && status !== 408 && status !== 429)
			) {
				throw error
			}
			lastError = error
			if (attempt + 1 < MAX_RETRIES) {
				await delay(500 * 2 ** attempt)
			}
		}
	}
	throw lastError
}

/**
 * Upload a browser-backed video file through the Forms upload-session API.
 *
 * @param {object} options Upload options.
 * @param {number} options.formId Form id.
 * @param {number} options.questionId Video question id.
 * @param {string|null} options.shareHash Public share hash.
 * @param {File} options.file Browser-backed media file.
 * @param {AbortSignal} options.signal Cancellation signal.
 * @param {(progress: number) => void} options.onProgress Progress callback.
 * @return {Promise<object>} Existing Forms uploaded-file answer value.
 */
export async function uploadVideo({
	formId,
	questionId,
	shareHash,
	file,
	signal,
	onProgress,
}) {
	const createUrl = generateOcsUrl(
		'apps/forms/api/v3/forms/{formId}/submissions/videos/{questionId}/upload-sessions',
		{ formId, questionId },
	)
	let createResponse
	try {
		createResponse = await axios.post(
			createUrl,
			{
				fileName: file.name,
				mimeType: file.type,
				totalSize: file.size,
				shareHash: shareHash || '',
			},
			{ signal },
		)
	} catch (error) {
		throw uploadError(error, 'Could not create the upload session')
	}
	const session = OcsResponse2Data(createResponse)
	const chunkSize = session.chunkSize || DEFAULT_CHUNK_SIZE
	const chunkCount = Math.ceil(file.size / chunkSize)

	try {
		for (let index = 0; index < chunkCount; index++) {
			const start = index * chunkSize
			const end = Math.min(file.size, start + chunkSize)
			const chunk = file.slice(start, end)
			const chunkUrl = generateOcsUrl(
				'apps/forms/api/v3/video-upload-sessions/{sessionId}/chunks/{index}',
				{ sessionId: session.sessionId, index },
			)
			const formData = new FormData()
			formData.append('uploadToken', session.uploadToken)
			formData.append('contentRange', `bytes ${start}-${end - 1}/${file.size}`)
			formData.append('chunk', chunk, `chunk-${index}.part`)
			try {
				await retry(() =>
					axios.post(chunkUrl, formData, {
						signal,
						onUploadProgress: (event) => {
							onProgress(
								calculateChunkUploadProgress(
									file.size,
									start,
									chunk.size,
									event.loaded,
									event.total,
								),
							)
						},
					}),
				)
			} catch (error) {
				throw uploadError(error, `Could not upload video chunk ${index + 1}`)
			}
			onProgress(Math.min(99, Math.floor((end / file.size) * 100)))
		}

		const completeUrl = generateOcsUrl(
			'apps/forms/api/v3/video-upload-sessions/{sessionId}/complete',
			{ sessionId: session.sessionId },
		)
		const completeResponse = await axios.post(
			completeUrl,
			{ uploadToken: session.uploadToken },
			{ signal },
		)
		onProgress(100)
		return OcsResponse2Data(completeResponse)
	} catch (error) {
		const cancelUrl = generateOcsUrl(
			'apps/forms/api/v3/video-upload-sessions/{sessionId}',
			{ sessionId: session.sessionId },
		)
		await axios
			.delete(cancelUrl, {
				headers: { 'X-Forms-Upload-Token': session.uploadToken },
			})
			.catch(() => {})
		if (error?.cause || error?.code === 'ERR_CANCELED') {
			throw error
		}
		throw uploadError(error, 'Could not complete the video upload')
	}
}
