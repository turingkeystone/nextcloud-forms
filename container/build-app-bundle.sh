#!/bin/bash

# SPDX-FileCopyrightText: 2026 turingkeystone
# SPDX-License-Identifier: AGPL-3.0-or-later

set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly OUTPUT_ROOT="${PROJECT_ROOT}/dist/forms"

for required_path in appinfo/info.xml COPYING css img js l10n lib templates vendor CHANGELOG.md; do
	[[ -e "${PROJECT_ROOT}/${required_path}" ]] || {
		echo "Missing build input: ${required_path}" >&2
		exit 1
	}
done

rm -rf -- "${PROJECT_ROOT}/dist"
mkdir -p "${OUTPUT_ROOT}"

for source_path in appinfo COPYING css img js l10n lib templates vendor CHANGELOG.md; do
	cp -a "${PROJECT_ROOT}/${source_path}" "${OUTPUT_ROOT}/"
done

php -r '$xml = simplexml_load_file($argv[1]); if ($xml === false || (string)$xml->id !== "forms") { exit(1); } echo "Prepared Forms ", (string)$xml->version, PHP_EOL;' "${OUTPUT_ROOT}/appinfo/info.xml"
