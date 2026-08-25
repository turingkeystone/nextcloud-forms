<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Tests\Unit\Http;

use OCA\Forms\Http\VideoStreamResponse;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\IOutput;
use OCP\Files\File;
use PHPUnit\Framework\MockObject\MockObject;
use Test\TestCase;

class VideoStreamResponseTest extends TestCase {
	private File|MockObject $file;

	protected function setUp(): void {
		parent::setUp();
		$this->file = $this->createMock(File::class);
		$this->file->method('getName')->willReturn('camera.mp4');
		$this->file->method('getMimeType')->willReturn('video/mp4');
		$this->file->method('getSize')->willReturn(3 * 1024 * 1024);
		$this->file->method('getEtag')->willReturn('video-etag');
		$this->file->method('getMTime')->willReturn(1_700_000_000);
	}

	public function testStreamsOnlyRequestedRangeInBoundedChunks(): void {
		$content = str_repeat('a', 3 * 1024 * 1024);
		$stream = fopen('php://temp', 'w+b');
		fwrite($stream, $content);
		rewind($stream);
		$this->file->expects($this->once())->method('fopen')->with('r')->willReturn($stream);

		$received = '';
		$output = $this->createMock(IOutput::class);
		$output->method('getHttpResponseCode')->willReturn(Http::STATUS_PARTIAL_CONTENT);
		$output->expects($this->exactly(2))
			->method('setOutput')
			->willReturnCallback(function (string $chunk) use (&$received): void {
				$this->assertLessThanOrEqual(1024 * 1024, strlen($chunk));
				$received .= $chunk;
			});

		$response = new VideoStreamResponse($this->file, 1024 * 1024, 3 * 1024 * 1024 - 1, false);
		$response->callback($output);

		$this->assertSame(2 * 1024 * 1024, strlen($received));
		$this->assertSame(Http::STATUS_PARTIAL_CONTENT, $response->getStatus());
		$this->assertSame('bytes 1048576-3145727/3145728', $response->getHeaders()['Content-Range']);
	}

	public function testHeadDoesNotOpenTheFile(): void {
		$this->file->expects($this->never())->method('fopen');
		$output = $this->createMock(IOutput::class);
		$response = new VideoStreamResponse($this->file, 0, 3 * 1024 * 1024 - 1, false, false);
		$response->callback($output);
		$this->assertSame(Http::STATUS_OK, $response->getStatus());
	}
}
