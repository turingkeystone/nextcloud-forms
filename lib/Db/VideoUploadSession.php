<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getSessionToken()
 * @method void setSessionToken(string $value)
 * @method string getUploadTokenHash()
 * @method void setUploadTokenHash(string $value)
 * @method int getFormId()
 * @method void setFormId(int $value)
 * @method int getQuestionId()
 * @method void setQuestionId(int $value)
 * @method string getOwnerId()
 * @method void setOwnerId(string $value)
 * @method string getFileName()
 * @method void setFileName(string $value)
 * @method string getMimeType()
 * @method void setMimeType(string $value)
 * @method int getTotalSize()
 * @method void setTotalSize(int $value)
 * @method int getReceivedSize()
 * @method void setReceivedSize(int $value)
 * @method int getChunkSize()
 * @method void setChunkSize(int $value)
 * @method int getChunkCount()
 * @method void setChunkCount(int $value)
 * @method string getState()
 * @method void setState(string $value)
 * @method ?int getUploadedFileId()
 * @method void setUploadedFileId(?int $value)
 * @method int getCreated()
 * @method void setCreated(int $value)
 * @method int getUpdated()
 * @method void setUpdated(int $value)
 * @method int getExpires()
 * @method void setExpires(int $value)
 */
class VideoUploadSession extends Entity {
	protected $sessionToken;
	protected $uploadTokenHash;
	protected $formId;
	protected $questionId;
	protected $ownerId;
	protected $fileName;
	protected $mimeType;
	protected $totalSize;
	protected $receivedSize;
	protected $chunkSize;
	protected $chunkCount;
	protected $state;
	protected $uploadedFileId;
	protected $created;
	protected $updated;
	protected $expires;

	public function __construct() {
		$this->addType('formId', 'integer');
		$this->addType('questionId', 'integer');
		$this->addType('totalSize', 'integer');
		$this->addType('receivedSize', 'integer');
		$this->addType('chunkSize', 'integer');
		$this->addType('chunkCount', 'integer');
		$this->addType('uploadedFileId', 'integer');
		$this->addType('created', 'integer');
		$this->addType('updated', 'integer');
		$this->addType('expires', 'integer');
	}
}
