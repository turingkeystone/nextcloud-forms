# AIO 派生镜像

<!--
SPDX-FileCopyrightText: 2026 turingkeystone
SPDX-License-Identifier: AGPL-3.0-or-later
-->

本仓库的 GitHub Actions 会把 Forms 生产构建直接放入官方
`ghcr.io/nextcloud-releases/aio-nextcloud:latest`，并发布定制镜像：

```text
ghcr.io/turingkeystone/nextcloud-forms:latest
```

镜像保留 AIO 官方 `/start.sh` 和官方初始化入口。包装入口先保护内置 Forms
不被应用商店版本替换，执行完整的 AIO 初始化或 Nextcloud 升级，然后再次原子同步
内置 Forms、执行 `occ upgrade` 并核对安装版本。Forms 代码因此位于
`nextcloud_aio_nextcloud` 卷中，不需要额外挂载或启动后复制。

## 部署

第一次拉取私有 GHCR 镜像前，在宿主机使用具有 `read:packages` 权限的 GitHub
classic PAT 登录：

```bash
printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io -u turingkeystone --password-stdin
```

把 Compose 中 Nextcloud 服务的镜像改为：

```yaml
services:
    nextcloud-aio-nextcloud:
        image: ghcr.io/turingkeystone/nextcloud-forms:latest
        environment:
            UPDATE_NEXTCLOUD_APPS: 'no'
            INSTALL_LATEST_MAJOR: 'no'
```

其余环境变量、卷、网络、健康检查和权限继续跟随对应版本的 AIO manual-install
模板。不要挂载 `custom_apps/forms`，否则会遮住镜像管理的应用目录。

手动升级时，在宿主机联网的窗口执行常规 Compose 拉取和重建：

```bash
docker compose pull nextcloud-aio-nextcloud
docker compose up -d nextcloud-aio-nextcloud
docker compose logs -f --tail=200 nextcloud-aio-nextcloud
```

初始化完成后验证：

```bash
docker compose exec --user www-data nextcloud-aio-nextcloud php occ status
docker compose exec --user www-data nextcloud-aio-nextcloud php occ config:app:get forms installed_version
docker compose exec --user www-data nextcloud-aio-nextcloud php occ app:list --enabled
```

应用当前声明支持 Nextcloud 32 至 34。镜像入口只按主版本范围检查兼容性，不绑定
PHP 小版本、浏览器编码器版本或精确的 Nextcloud 补丁版本。若 AIO 的 Nextcloud
主版本超出范围，容器会在修改应用数据库前停止，并要求先更新本仓库的兼容声明和测试。

## 发布规则

- 默认分支更新、每周定时任务或手动运行工作流时构建镜像。
- 每个构建发布不可变的 `sha-<commit>` 标签。
- 默认分支同时发布 Forms 版本号标签和 `latest`。
- CI 使用 Nextcloud 33 + PHP 8.3 运行单元测试，再构建并检查派生镜像。
- 更新 AIO 时先手动运行工作流并等待成功，再在主机拉取新镜像。

运行期可以离线；包装入口本身不访问网络。但 AIO 官方入口在首次安装或 Nextcloud
核心升级时仍可能访问应用商店，因此应保证新镜像第一次启动期间能够联网。
