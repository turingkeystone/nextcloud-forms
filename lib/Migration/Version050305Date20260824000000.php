<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version050305Date20260824000000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();
		if ($schema->hasTable('forms_v2_video_uploads')) {
			return null;
		}

		$table = $schema->createTable('forms_v2_video_uploads');
		$table->addColumn('id', Types::INTEGER, [
			'autoincrement' => true,
			'notnull' => true,
		]);
		$table->addColumn('session_token', Types::STRING, [
			'notnull' => true,
			'length' => 64,
		]);
		$table->addColumn('upload_token_hash', Types::STRING, [
			'notnull' => true,
			'length' => 64,
		]);
		$table->addColumn('form_id', Types::INTEGER, ['notnull' => true]);
		$table->addColumn('question_id', Types::INTEGER, ['notnull' => true]);
		$table->addColumn('owner_id', Types::STRING, [
			'notnull' => true,
			'length' => 64,
		]);
		$table->addColumn('file_name', Types::STRING, [
			'notnull' => true,
			'length' => 256,
		]);
		$table->addColumn('mime_type', Types::STRING, [
			'notnull' => true,
			'length' => 255,
		]);
		$table->addColumn('total_size', Types::BIGINT, [
			'notnull' => true,
			'unsigned' => true,
		]);
		$table->addColumn('received_size', Types::BIGINT, [
			'notnull' => true,
			'unsigned' => true,
			'default' => 0,
		]);
		$table->addColumn('chunk_size', Types::INTEGER, [
			'notnull' => true,
			'unsigned' => true,
		]);
		$table->addColumn('chunk_count', Types::INTEGER, [
			'notnull' => true,
			'unsigned' => true,
		]);
		$table->addColumn('state', Types::STRING, [
			'notnull' => true,
			'length' => 16,
			'default' => 'open',
		]);
		$table->addColumn('uploaded_file_id', Types::INTEGER, [
			'notnull' => false,
			'default' => null,
		]);
		$table->addColumn('created', Types::INTEGER, ['notnull' => true]);
		$table->addColumn('updated', Types::INTEGER, ['notnull' => true]);
		$table->addColumn('expires', Types::INTEGER, ['notnull' => true]);
		$table->setPrimaryKey(['id'], 'forms_video_uploads_id');
		$table->addUniqueIndex(['session_token'], 'forms_video_session');
		$table->addIndex(['expires'], 'forms_video_expires');

		return $schema;
	}
}
