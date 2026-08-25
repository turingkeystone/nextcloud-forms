/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const DATABASE_NAME = 'forms-video-recordings'
const DATABASE_VERSION = 1
const STORE_NAME = 'chunks'
const OPFS_DIRECTORY = 'forms-video-recordings'
const STALE_RECORDING_AGE_MS = 24 * 60 * 60 * 1000
const PAGE_SESSION_ID = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`

/** Return a collision-resistant local recording identifier. */
function randomId() {
	return (
		globalThis.crypto?.randomUUID?.()
		?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
	)
}

/** @return {Promise<IDBDatabase>} Recording database. */
function openDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
		request.onupgradeneeded = () => {
			const database = request.result
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME, {
					keyPath: ['recordingId', 'index'],
				})
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

/** @param {IDBTransaction} transaction Transaction to await. */
function transactionDone(transaction) {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = resolve
		transaction.onerror = () => reject(transaction.error)
		transaction.onabort = () => reject(transaction.error)
	})
}

/**
 * Bounded recording sink backed by OPFS, with IndexedDB Blob chunks as a
 * compatibility fallback. The caller owns queue backpressure.
 */
export class RecordingStore {
	constructor() {
		this.recordingId = `${Date.now()}-${PAGE_SESSION_ID}-${randomId()}`
		this.backend = ''
		this.fileHandle = null
		this.writable = null
		this.database = null
		this.chunkIndex = 0
		this.opfsChunksWritten = 0
		this.mimeType = ''
		this.extension = ''
		this.storageFileName = `${this.recordingId}.recording`
	}

	/**
	 * Record the format selected by MediaRecorder once it becomes available.
	 *
	 * @param {string} mimeType Recorder or Blob MIME type.
	 */
	setMimeType(mimeType) {
		if (!mimeType) {
			return
		}
		if (!mimeType.toLowerCase().startsWith('video/')) {
			throw new Error('Browser returned an invalid recording MIME type')
		}
		this.mimeType = mimeType
		this.extension = mimeType.toLowerCase().startsWith('video/mp4')
			? 'mp4'
			: 'webm'
	}

	/**
	 * Open an empty recording.
	 *
	 * @param {string} mimeType Expected recorder MIME type.
	 */
	async open(mimeType) {
		this.setMimeType(mimeType)

		try {
			if (!navigator.storage?.getDirectory) {
				throw new Error('OPFS is unavailable')
			}
			const root = await navigator.storage.getDirectory()
			const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, {
				create: true,
			})
			this.fileHandle = await directory.getFileHandle(this.storageFileName, {
				create: true,
			})
			this.writable = await this.fileHandle.createWritable()
			this.backend = 'opfs'
			return
		} catch {
			if (typeof indexedDB === 'undefined') {
				throw new Error('Browser storage is unavailable')
			}
		}

		await this.openIndexedDb()
	}

	/** Open the IndexedDB fallback backend. */
	async openIndexedDb() {
		this.database = await openDatabase()
		this.backend = 'indexeddb'
	}

	/** Discard an unusable empty OPFS recording and switch backends. */
	async fallbackFromEmptyOpfs() {
		try {
			await this.writable?.abort()
		} catch {
			// The failed stream may already be closed.
		}
		this.writable = null
		try {
			const root = await navigator.storage.getDirectory()
			const directory = await root.getDirectoryHandle(OPFS_DIRECTORY)
			await directory.removeEntry(this.storageFileName)
		} catch {
			// Stale-file cleanup will retry on the next page load.
		}
		this.fileHandle = null
		await this.openIndexedDb()
	}

	/**
	 * Append one Blob to IndexedDB.
	 *
	 * @param {Blob} blob Encoded media chunk.
	 */
	async appendIndexedDb(blob) {
		const transaction = this.database.transaction(STORE_NAME, 'readwrite')
		transaction.objectStore(STORE_NAME).put({
			recordingId: this.recordingId,
			index: this.chunkIndex++,
			blob,
		})
		await transactionDone(transaction)
	}

	/**
	 * Append one MediaRecorder Blob.
	 *
	 * @param {Blob} blob Encoded media chunk.
	 */
	async append(blob) {
		this.setMimeType(blob.type)
		if (this.backend === 'opfs') {
			try {
				await this.writable.write(blob)
				this.opfsChunksWritten++
				return
			} catch (error) {
				if (this.opfsChunksWritten > 0 || typeof indexedDB === 'undefined') {
					throw error
				}
				await this.fallbackFromEmptyOpfs()
			}
		}
		if (this.backend !== 'indexeddb') {
			throw new Error('Recording storage is not open')
		}
		await this.appendIndexedDb(blob)
	}

	/**
	 * Close the sink and return a browser-backed File for preview and upload.
	 *
	 * @return {Promise<File>} Final recording.
	 */
	async finalize() {
		if (!this.mimeType || !this.extension) {
			throw new Error('Browser did not report the recorded video format')
		}
		const fileName = `recording-${Date.now()}.${this.extension}`
		if (this.backend === 'opfs') {
			await this.writable.close()
			this.writable = null
			const file = await this.fileHandle.getFile()
			return new File([file], fileName, { type: this.mimeType })
		}

		const chunks = await this.getIndexedDbChunks()
		return new File(
			chunks.map((chunk) => chunk.blob),
			fileName,
			{ type: this.mimeType },
		)
	}

	async getIndexedDbChunks() {
		const transaction = this.database.transaction(STORE_NAME, 'readonly')
		const range = IDBKeyRange.bound(
			[this.recordingId, 0],
			[this.recordingId, Number.MAX_SAFE_INTEGER],
		)
		const request = transaction.objectStore(STORE_NAME).getAll(range)
		const rows = await new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		return rows
	}

	/** Delete this recording's persistent data. */
	async remove() {
		try {
			if (this.writable) {
				await this.writable.abort()
				this.writable = null
			}
			if (this.backend === 'opfs' && this.fileHandle) {
				const root = await navigator.storage.getDirectory()
				const directory = await root.getDirectoryHandle(OPFS_DIRECTORY)
				await directory.removeEntry(this.storageFileName)
			}
			if (this.backend === 'indexeddb' && this.database) {
				const chunks = await this.getIndexedDbChunks()
				const transaction = this.database.transaction(
					STORE_NAME,
					'readwrite',
				)
				for (const chunk of chunks) {
					transaction
						.objectStore(STORE_NAME)
						.delete([chunk.recordingId, chunk.index])
				}
				await transactionDone(transaction)
				this.database.close()
				this.database = null
			}
		} catch {
			// Cleanup is retried by cleanupStaleRecordings on the next page load.
		}
	}
}

/**
 * Check whether a recording belongs to an expired page session.
 *
 * Legacy identifiers without a timestamp are stale because they cannot belong
 * to a page running this version.
 *
 * @param {string} recordingId Persistent recording identifier.
 * @param {number} now Current timestamp, injectable for tests.
 * @return {boolean} Whether the recording can be removed.
 */
export function isStaleRecordingId(recordingId, now = Date.now()) {
	const [createdText] = recordingId.split('-', 1)
	const created = Number(createdText)
	return (
		!Number.isSafeInteger(created)
		|| created <= 0
		|| created < now - STALE_RECORDING_AGE_MS
	)
}

/** Remove expired recordings without touching active sibling tabs. */
export async function cleanupStaleRecordings() {
	if (navigator.storage?.getDirectory) {
		try {
			const root = await navigator.storage.getDirectory()
			const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, {
				create: true,
			})
			for await (const name of directory.keys()) {
				if (isStaleRecordingId(name)) {
					await directory.removeEntry(name)
				}
			}
		} catch {
			// IndexedDB cleanup still runs below.
		}
	}

	if (typeof indexedDB === 'undefined') {
		return
	}
	try {
		const database = await openDatabase()
		const transaction = database.transaction(STORE_NAME, 'readwrite')
		const store = transaction.objectStore(STORE_NAME)
		const request = store.openCursor()
		request.onsuccess = () => {
			const cursor = request.result
			if (!cursor) {
				return
			}
			if (isStaleRecordingId(cursor.value.recordingId)) {
				cursor.delete()
			}
			cursor.continue()
		}
		await transactionDone(transaction)
		database.close()
	} catch {
		// An unavailable storage backend simply disables its cleanup path.
	}
}
