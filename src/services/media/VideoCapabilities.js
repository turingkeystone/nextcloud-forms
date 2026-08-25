/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export const VIDEO_RESOLUTIONS = Object.freeze([
	{ value: '720p', label: '720p', width: 1280, height: 720, bitrate: 4_000_000 },
	{
		value: '1080p',
		label: '1080p',
		width: 1920,
		height: 1080,
		bitrate: 8_000_000,
	},
	{ value: '1440p', label: '2K', width: 2560, height: 1440, bitrate: 16_000_000 },
	{ value: '2160p', label: '4K', width: 3840, height: 2160, bitrate: 35_000_000 },
])

export const VIDEO_MAX_BYTES = 16 * 1024 ** 3
export const VIDEO_MAX_DURATION_SECONDS = 2 * 60 * 60
export const VIDEO_AUDIO_BITRATE = 128_000
export const VIDEO_CHUNK_DURATION_SECONDS = 2
export const VIDEO_RECORDER_TIMESLICE_MS = 1_000
export const VIDEO_RECORDING_ORIENTATIONS = Object.freeze([
	'landscape',
	'portrait',
	'any',
])

/**
 * Normalize a persisted orientation setting while preserving the legacy
 * landscape behavior for forms that predate the setting.
 *
 * @param {string|undefined} orientation Persisted setting.
 * @return {'landscape'|'portrait'|'any'} Supported orientation.
 */
export function normalizeRecordingOrientation(orientation) {
	return VIDEO_RECORDING_ORIENTATIONS.includes(orientation)
		? orientation
		: 'landscape'
}

/**
 * Check whether the current viewport orientation satisfies the form setting.
 *
 * @param {string|undefined} orientation Persisted setting.
 * @param {boolean} isPortrait Whether the viewport is portrait.
 * @return {boolean} Whether recording may start.
 */
export function recordingOrientationMatches(orientation, isPortrait) {
	const normalized = normalizeRecordingOrientation(orientation)
	return normalized === 'any' || (normalized === 'portrait') === isPortrait
}

const RECORDER_FORMAT_GROUPS = Object.freeze([
	{
		label: 'MP4 · H.264/AAC (avc1)',
		variants: [
			'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
			'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
			'video/mp4;codecs="avc1,mp4a.40.2"',
			'video/mp4;codecs=avc1,mp4a.40.2',
		],
	},
	{
		label: 'MP4 · H.264/AAC',
		variants: ['video/mp4;codecs="h264,aac"', 'video/mp4;codecs=h264,aac'],
	},
	{ label: 'MP4 · browser-selected codec', variants: ['video/mp4'] },
	{
		label: 'MP4 · AV1/AAC',
		variants: [
			'video/mp4;codecs="av01,mp4a.40.2"',
			'video/mp4;codecs=av01,mp4a.40.2',
		],
	},
	{
		label: 'MP4 · HEVC/AAC',
		variants: [
			'video/mp4;codecs="hvc1,mp4a.40.2"',
			'video/mp4;codecs=hvc1,mp4a.40.2',
		],
	},
	{
		label: 'WebM · VP9/Opus',
		variants: [
			'video/webm;codecs="vp9,opus"',
			'video/webm;codecs=vp9,opus',
			'video/webm;codecs="vp9, opus"',
		],
	},
	{
		label: 'WebM · VP8/Opus',
		variants: ['video/webm;codecs="vp8,opus"', 'video/webm;codecs=vp8,opus'],
	},
	{
		label: 'WebM · AV1/Opus',
		variants: [
			'video/webm;codecs="av01,opus"',
			'video/webm;codecs=av01,opus',
			'video/webm;codecs="av01.0.04M.08,opus"',
		],
	},
	{
		label: 'WebM · H.264/Opus',
		variants: ['video/webm;codecs="h264,opus"', 'video/webm;codecs=h264,opus'],
	},
	{ label: 'WebM · browser-selected codec', variants: ['video/webm'] },
])

export const BROWSER_DEFAULT_FORMAT_ID = 'browser-default'
export const PREFERRED_MP4_FORMAT_LABEL = 'MP4 · H.264/AAC (avc1)'

/**
 * Return the configured resolution object.
 *
 * @param {string} value Resolution identifier.
 * @return {object|undefined} Resolution definition.
 */
export function getResolution(value) {
	return VIDEO_RESOLUTIONS.find((resolution) => resolution.value === value)
}

const FRAME_RATE_TOLERANCE = 0.98

/**
 * Mobile browsers may swap width and height in getSettings() while the device
 * is held in portrait, even though constraints use the camera's primary
 * landscape orientation.
 *
 * @param {MediaTrackSettings} settings Applied track settings.
 * @param {object} resolution Requested landscape resolution.
 * @return {boolean} Whether the actual dimensions match in either orientation.
 */
function dimensionsMatch(settings, resolution) {
	return (
		(settings.width === resolution.width
			&& settings.height === resolution.height)
		|| (settings.width === resolution.height
			&& settings.height === resolution.width)
	)
}

/**
 * Accept broadcast-rate equivalents such as 29.97 and 59.94 fps.
 *
 * An omitted frame rate is accepted because the specification allows browsers
 * to omit settings they cannot determine.
 *
 * @param {MediaTrackSettings} settings Applied track settings.
 * @param {number} frameRate Requested frame rate.
 * @return {boolean} Whether the configured rate is sufficiently close.
 */
function frameRateMatches(settings, frameRate) {
	return (
		typeof settings.frameRate !== 'number'
		|| settings.frameRate >= frameRate * FRAME_RATE_TOLERANCE
	)
}

/**
 * Apply a resolution using bounded compatibility fallbacks and verify the
 * actual settings after every attempt.
 *
 * @param {MediaStreamTrack} track Active video track.
 * @param {object} resolution Requested resolution.
 * @param {number} frameRate Requested frame rate.
 * @return {Promise<boolean>} Whether the requested output was actually applied.
 */
async function tryApplyVideoSettings(track, resolution, frameRate) {
	const attempts = [
		{
			width: { exact: resolution.width },
			height: { exact: resolution.height },
			aspectRatio: { ideal: 16 / 9 },
			frameRate: {
				min: frameRate * FRAME_RATE_TOLERANCE,
				ideal: frameRate,
				max: frameRate,
			},
		},
		{
			width: { exact: resolution.width },
			height: { exact: resolution.height },
			aspectRatio: { ideal: 16 / 9 },
			frameRate: { ideal: frameRate },
		},
		{
			width: { ideal: resolution.width },
			height: { ideal: resolution.height },
			aspectRatio: { ideal: 16 / 9 },
			frameRate: { ideal: frameRate },
		},
	]

	for (const constraints of attempts) {
		try {
			await track.applyConstraints(constraints)
			const settings = track.getSettings()
			if (
				dimensionsMatch(settings, resolution)
				&& frameRateMatches(settings, frameRate)
			) {
				return true
			}
		} catch {
			// Try the next bounded compatibility form.
		}
	}

	return false
}

/**
 * Probe output sizes on the active camera track, then restore the requested
 * default. Actual output settings are checked because capability ranges do not
 * prove that width, height and frame rate are available together.
 *
 * @param {MediaStreamTrack} track Active video track.
 * @param {string[]} allowed Allowed resolution identifiers.
 * @param {number} frameRate Requested frame rate.
 * @param {string} preferred Preferred resolution to restore.
 * @return {Promise<string[]>} Supported resolution identifiers.
 */
export async function probeResolutions(track, allowed, frameRate, preferred) {
	const supported = []
	const candidates = VIDEO_RESOLUTIONS.filter((resolution) =>
		allowed.includes(resolution.value),
	)

	for (const resolution of candidates) {
		if (await tryApplyVideoSettings(track, resolution, frameRate)) {
			supported.push(resolution.value)
		}
	}

	const restore = getResolution(
		supported.includes(preferred) ? preferred : supported[0],
	)
	if (restore) {
		await applyVideoSettings(track, restore.value, frameRate)
	}

	return supported
}

/**
 * Apply a previously probed recording combination.
 *
 * @param {MediaStreamTrack} track Active video track.
 * @param {string} resolutionValue Resolution identifier.
 * @param {number} frameRate Target frame rate.
 */
export async function applyVideoSettings(track, resolutionValue, frameRate) {
	const resolution = getResolution(resolutionValue)
	if (!resolution) {
		throw new Error('Unknown video resolution')
	}

	if (!(await tryApplyVideoSettings(track, resolution, frameRate))) {
		throw new Error('Camera did not apply the requested video settings')
	}
}

/**
 * Request a preferred camera output without treating a browser-selected
 * fallback as an error.
 *
 * @param {MediaStreamTrack} track Active video track.
 * @param {string} resolutionValue Preferred resolution identifier.
 * @param {number} frameRate Preferred frame rate.
 */
export async function requestPreferredVideoSettings(
	track,
	resolutionValue,
	frameRate,
) {
	const resolution = getResolution(resolutionValue)
	if (!resolution) {
		return
	}
	const supportsResizeMode =
		navigator.mediaDevices?.getSupportedConstraints?.().resizeMode === true
	await track
		.applyConstraints({
			width: { ideal: resolution.width },
			height: { ideal: resolution.height },
			frameRate: { ideal: frameRate },
			...(supportsResizeMode ? { resizeMode: { ideal: 'none' } } : {}),
		})
		.catch(() => {})
}

/**
 * Probe concrete recording formats through the standard synchronous browser
 * capability API. Browser default remains available as an unconstrained
 * fallback because its concrete MIME type is only known after recording starts.
 *
 * @return {Promise<object[]>} Supported format definitions.
 */
export async function probeRecorderFormats() {
	if (typeof MediaRecorder === 'undefined') {
		return []
	}

	const supported = [
		{
			id: BROWSER_DEFAULT_FORMAT_ID,
			label: 'Browser default',
			mimeType: '',
		},
	]
	if (typeof MediaRecorder.isTypeSupported !== 'function') {
		return supported
	}

	for (const group of RECORDER_FORMAT_GROUPS) {
		const detectedMimeType = group.variants.find((mimeType) => {
			try {
				return MediaRecorder.isTypeSupported(mimeType)
			} catch {
				return false
			}
		})
		if (!detectedMimeType) {
			continue
		}

		supported.push({
			id: detectedMimeType,
			label: group.label,
			mimeType: detectedMimeType,
		})
	}

	return supported.filter(
		(format, index, formats) =>
			formats.findIndex((candidate) => candidate.id === format.id) === index,
	)
}

/**
 * Prefer broadly playable MP4/H.264/AAC while retaining browser default as a
 * safe fallback on devices, such as some Android Chrome builds, without MP4
 * recording support.
 *
 * @param {object[]} formats Detected recorder formats.
 * @return {string} Selected format identifier.
 */
export function pickDefaultRecorderFormat(formats) {
	return (
		formats.find((format) => format.label === PREFERRED_MP4_FORMAT_LABEL)?.id
		|| formats.find((format) => format.label === 'MP4 · H.264/AAC')?.id
		|| formats.find((format) => format.label === 'MP4 · browser-selected codec')
			?.id
		|| formats.find((format) => format.id === BROWSER_DEFAULT_FORMAT_ID)?.id
		|| formats[0]?.id
		|| ''
	)
}

/**
 * Select the MIME type passed to MediaRecorder.
 *
 * Match RecordingMobile by passing the selected detected MIME type through
 * unchanged. Browser default remains represented by an empty string, which
 * makes the MediaRecorder constructor omit its options object.
 *
 * @param {object} selectedFormat Selected detected format.
 * @return {string} MIME type to pass to MediaRecorder, or an empty string.
 */
export function getRecorderMimeType(selectedFormat) {
	return selectedFormat?.mimeType || ''
}

/**
 * Decide whether MediaRecorder output may be persisted as periodic chunks.
 *
 * WebM chunks can be concatenated for browser-backed storage. WebKit has had
 * interoperability problems with timesliced MP4 recordings, so MP4 and an
 * unknown browser-default format follow the RecordingMobile-compatible path:
 * one final Blob emitted when recording stops.
 *
 * @param {string|undefined} mimeType Recorder output MIME type.
 * @return {boolean} Whether periodic chunks are safe for this container.
 */
export function shouldUseChunkedRecording(mimeType) {
	return mimeType?.toLowerCase().startsWith('video/webm') ?? false
}

/**
 * Start MediaRecorder using a container-compatible output strategy.
 *
 * @param {MediaRecorder} recorder Configured recorder.
 */
export function startMediaRecorder(recorder) {
	if (shouldUseChunkedRecording(recorder.mimeType)) {
		recorder.start(VIDEO_RECORDER_TIMESLICE_MS)
		return
	}
	recorder.start()
}

/**
 * Calculate recording duration from a monotonic clock so throttled interval
 * callbacks do not make the displayed duration drift.
 *
 * @param {number} startedAt Monotonic start timestamp in milliseconds.
 * @param {number} now Current monotonic timestamp in milliseconds.
 * @param {number} totalPausedMilliseconds Completed pause duration.
 * @param {number|null} pausedAt Current pause start, if paused.
 * @return {number} Whole elapsed recording seconds.
 */
export function calculateRecordingElapsedSeconds(
	startedAt,
	now,
	totalPausedMilliseconds,
	pausedAt = null,
) {
	const currentPause = pausedAt !== null ? now - pausedAt : 0
	return Math.max(
		0,
		Math.floor(
			(now - startedAt - totalPausedMilliseconds - currentPause) / 1000,
		),
	)
}

/**
 * Pick the default resolution while preserving the 1080p-first product rule.
 *
 * @param {string[]} supported Supported resolution identifiers.
 * @param {string} preferred Form owner's preferred resolution.
 * @return {string} Selected resolution identifier.
 */
export function pickDefaultResolution(supported, preferred = '1080p') {
	if (supported.includes(preferred)) {
		return preferred
	}
	if (supported.includes('720p')) {
		return '720p'
	}
	return supported[0] ?? ''
}

/**
 * Estimate bytes needed for a recording, including a 20 percent safety margin.
 *
 * @param {string} resolutionValue Resolution identifier.
 * @param {number} durationSeconds Maximum duration.
 * @param {boolean} withAudio Whether audio is enabled.
 * @return {number} Estimated storage bytes.
 */
export function estimateRecordingBytes(resolutionValue, durationSeconds, withAudio) {
	const resolution = getResolution(resolutionValue)
	if (!resolution) {
		return 0
	}
	const bitsPerSecond = resolution.bitrate + (withAudio ? VIDEO_AUDIO_BITRATE : 0)
	return Math.ceil(((bitsPerSecond * durationSeconds) / 8) * 1.2)
}

/**
 * Use quota estimates only to determine whether the next bounded recording
 * chunk is likely to fit. Browser quota and usage values are conservative,
 * implementation-defined estimates and must not reserve the whole recording.
 *
 * @param {StorageEstimate} estimate Browser storage estimate.
 * @param {string} resolutionValue Resolution identifier.
 * @param {boolean} withAudio Whether audio is enabled.
 * @return {boolean} Whether recording can attempt to start.
 */
export function hasRecordingStartCapacity(estimate, resolutionValue, withAudio) {
	if (
		!Number.isFinite(estimate?.quota)
		|| estimate.quota <= 0
		|| !Number.isFinite(estimate?.usage)
	) {
		return true
	}

	const available = Math.max(0, estimate.quota - estimate.usage)
	const nextChunkBytes = estimateRecordingBytes(
		resolutionValue,
		VIDEO_CHUNK_DURATION_SECONDS,
		withAudio,
	)
	return nextChunkBytes > 0 && available >= nextChunkBytes
}
