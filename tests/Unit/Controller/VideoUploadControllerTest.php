<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Tests\Unit\Controller;

use OCA\Forms\Controller\VideoUploadController;
use OCA\Forms\Service\VideoUploadSessionService;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCS\OCSBadRequestException;
use OCP\IRequest;
use PHPUnit\Framework\MockObject\MockObject;
use Test\TestCase;

class VideoUploadControllerTest extends TestCase {
	private IRequest|MockObject $request;
	private VideoUploadSessionService|MockObject $uploadService;
	private VideoUploadController $controller;

	protected function setUp(): void {
		parent::setUp();

		$this->request = $this->createMock(IRequest::class);
		$this->uploadService = $this->createMock(VideoUploadSessionService::class);
		$this->controller = new VideoUploadController(
			'forms',
			$this->request,
			$this->uploadService,
		);
	}

	public function testPostChunkStreamsMultipartUpload(): void {
		$temporaryFile = tempnam(sys_get_temp_dir(), 'forms-video-test-');
		self::assertIsString($temporaryFile);
		file_put_contents($temporaryFile, 'video-chunk');

		try {
			$this->request->expects($this->once())
				->method('getUploadedFile')
				->with('chunk')
				->willReturn([
					'error' => UPLOAD_ERR_OK,
					'tmp_name' => $temporaryFile,
				]);
			$this->uploadService->expects($this->once())
				->method('putChunk')
				->with(
					'session-id',
					'upload-token',
					2,
					'bytes 20-30/31',
					self::callback(static function ($input): bool {
						return is_resource($input)
							&& stream_get_contents($input) === 'video-chunk';
					}),
				)
				->willReturn(['receivedSize' => 31]);

			self::assertEquals(
				new DataResponse(['receivedSize' => 31]),
				$this->controller->postChunk(
					'session-id',
					2,
					'upload-token',
					'bytes 20-30/31',
				),
			);
		} finally {
			unlink($temporaryFile);
		}
	}

	public function testPostChunkRejectsUploadErrors(): void {
		$this->request->expects($this->once())
			->method('getUploadedFile')
			->with('chunk')
			->willReturn([
				'error' => UPLOAD_ERR_INI_SIZE,
				'tmp_name' => '',
			]);
		$this->uploadService->expects($this->never())->method('putChunk');

		$this->expectException(OCSBadRequestException::class);
		$this->controller->postChunk(
			'session-id',
			0,
			'upload-token',
			'bytes 0-9/10',
		);
	}
}
