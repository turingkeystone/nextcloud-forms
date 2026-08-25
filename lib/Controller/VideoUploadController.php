<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Controller;

use OCA\Forms\Service\VideoUploadSessionService;
use OCP\AppFramework\Http\Attribute\AnonRateLimit;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\BruteForceProtection;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCS\OCSBadRequestException;
use OCP\AppFramework\OCSController;
use OCP\IRequest;

class VideoUploadController extends OCSController {
	public function __construct(
		string $appName,
		IRequest $request,
		private readonly VideoUploadSessionService $uploadService,
	) {
		parent::__construct($appName, $request);
	}

	#[CORS()]
	#[PublicPage()]
	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[BruteForceProtection(action: 'form')]
	#[AnonRateLimit(limit: 20, period: 3600)]
	#[UserRateLimit(limit: 100, period: 3600)]
	#[ApiRoute(verb: 'POST', url: '/api/v3/forms/{formId}/submissions/videos/{questionId}/upload-sessions')]
	public function create(
		int $formId,
		int $questionId,
		string $fileName,
		string $mimeType,
		int $totalSize,
		string $shareHash = '',
	): DataResponse {
		return new DataResponse($this->uploadService->create(
			$formId,
			$questionId,
			$fileName,
			$mimeType,
			$totalSize,
			$shareHash,
		));
	}

	#[CORS()]
	#[PublicPage()]
	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[BruteForceProtection(action: 'form')]
	#[ApiRoute(verb: 'PUT', url: '/api/v3/video-upload-sessions/{sessionId}/chunks/{index}')]
	public function putChunk(string $sessionId, int $index): DataResponse {
		/** @psalm-suppress NoInterfaceProperties IRequest documents the raw PUT body as a magic property. */
		$input = $this->request->put;
		if (!is_resource($input)) {
			throw new OCSBadRequestException('Chunk body is missing');
		}

		try {
			$result = $this->uploadService->putChunk(
				$sessionId,
				$this->request->getHeader('X-Forms-Upload-Token'),
				$index,
				$this->request->getHeader('Content-Range'),
				$input,
			);
		} finally {
			fclose($input);
		}

		return new DataResponse($result);
	}

	#[CORS()]
	#[PublicPage()]
	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[BruteForceProtection(action: 'form')]
	#[ApiRoute(verb: 'POST', url: '/api/v3/video-upload-sessions/{sessionId}/chunks/{index}')]
	public function postChunk(
		string $sessionId,
		int $index,
		string $uploadToken,
		string $contentRange,
	): DataResponse {
		$uploadedFile = $this->request->getUploadedFile('chunk');
		if (!is_array($uploadedFile)
			|| ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
			|| !is_string($uploadedFile['tmp_name'] ?? null)) {
			throw new OCSBadRequestException('Chunk body is missing');
		}

		$input = fopen($uploadedFile['tmp_name'], 'rb');
		if (!is_resource($input)) {
			throw new OCSBadRequestException('Could not read chunk body');
		}

		try {
			$result = $this->uploadService->putChunk(
				$sessionId,
				$uploadToken,
				$index,
				$contentRange,
				$input,
			);
		} finally {
			fclose($input);
		}

		return new DataResponse($result);
	}

	#[CORS()]
	#[PublicPage()]
	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[BruteForceProtection(action: 'form')]
	#[ApiRoute(verb: 'GET', url: '/api/v3/video-upload-sessions/{sessionId}')]
	public function status(string $sessionId): DataResponse {
		return new DataResponse($this->uploadService->status(
			$sessionId,
			$this->request->getHeader('X-Forms-Upload-Token'),
		));
	}

	#[CORS()]
	#[PublicPage()]
	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[BruteForceProtection(action: 'form')]
	#[ApiRoute(verb: 'POST', url: '/api/v3/video-upload-sessions/{sessionId}/complete')]
	public function complete(string $sessionId, string $uploadToken = ''): DataResponse {
		return new DataResponse($this->uploadService->complete(
			$sessionId,
			$uploadToken ?: $this->request->getHeader('X-Forms-Upload-Token'),
		));
	}

	#[CORS()]
	#[PublicPage()]
	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[BruteForceProtection(action: 'form')]
	#[ApiRoute(verb: 'DELETE', url: '/api/v3/video-upload-sessions/{sessionId}')]
	public function cancel(string $sessionId): DataResponse {
		$this->uploadService->cancel(
			$sessionId,
			$this->request->getHeader('X-Forms-Upload-Token'),
		);
		return new DataResponse([]);
	}
}
