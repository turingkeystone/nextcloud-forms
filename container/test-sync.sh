#!/bin/bash

# SPDX-FileCopyrightText: 2026 turingkeystone
# SPDX-License-Identifier: AGPL-3.0-or-later

set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "${test_root}"' EXIT

mkdir -p "${test_root}/nextcloud/custom_apps/forms/appinfo" "${test_root}/bundle/appinfo"
printf '%s\n' stale > "${test_root}/nextcloud/custom_apps/forms/stale.txt"
cp "${PROJECT_ROOT}/appinfo/info.xml" "${test_root}/bundle/appinfo/info.xml"
printf '%s\n' bundled > "${test_root}/bundle/current.txt"

NEXTCLOUD_ROOT="${test_root}/nextcloud" \
BUNDLED_FORMS_ROOT="${test_root}/bundle" \
	"${PROJECT_ROOT}/container/sync-forms-bundle.sh"

[[ -f "${test_root}/nextcloud/custom_apps/forms/current.txt" ]]
[[ ! -e "${test_root}/nextcloud/custom_apps/forms/stale.txt" ]]
[[ ! -e "${test_root}/nextcloud/custom_apps/.forms-bundle.previous" ]]
[[ -z "$(find "${test_root}/nextcloud/custom_apps" -maxdepth 1 -type d -name '.forms-bundle.staging.*' -print -quit)" ]]

echo "Forms bundle synchronization test passed."
