#!/bin/bash

# SPDX-FileCopyrightText: 2026 turingkeystone
# SPDX-License-Identifier: AGPL-3.0-or-later

set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "${test_root}"' EXIT

mkdir -p \
	"${test_root}/nextcloud/custom_apps/forms" \
	"${test_root}/bundle/appinfo" \
	"${test_root}/source"
cp "${PROJECT_ROOT}/appinfo/info.xml" "${test_root}/bundle/appinfo/info.xml"
printf '%s\n' bundled > "${test_root}/bundle/current.txt"
printf '%s\n' stale > "${test_root}/nextcloud/custom_apps/forms/stale.txt"

printf '%s\n' '<?php $OC_Version = [33, 0, 0, 0];' > "${test_root}/source/version.php"
cp "${test_root}/source/version.php" "${test_root}/nextcloud/version.php"

printf '%s\n' '#!/bin/bash' 'exit 0' > "${test_root}/official-entrypoint.sh"
chmod +x "${test_root}/official-entrypoint.sh"

app_version="$(php -r '$xml = simplexml_load_file($argv[1]); echo (string)$xml->version;' "${PROJECT_ROOT}/appinfo/info.xml")"
printf '%s\n' \
	'<?php' \
	'if ($argv[1] === "config:app:get") {' \
	"echo '${app_version}';" \
	'}' > "${test_root}/nextcloud/occ"

NEXTCLOUD_ROOT="${test_root}/nextcloud" \
BUNDLED_FORMS_ROOT="${test_root}/bundle" \
BUNDLED_FORMS_REVISION="test-revision" \
AIO_ENTRYPOINT="${test_root}/official-entrypoint.sh" \
FORMS_SYNC_SCRIPT="${PROJECT_ROOT}/container/sync-forms-bundle.sh" \
	"${PROJECT_ROOT}/container/entrypoint-with-forms.sh"

[[ "$(<"${test_root}/nextcloud/custom_apps/.forms-bundle-revision")" == 'test-revision' ]]
[[ -f "${test_root}/nextcloud/custom_apps/forms/current.txt" ]]
[[ ! -e "${test_root}/nextcloud/custom_apps/forms/stale.txt" ]]

echo "Forms entrypoint test passed."
