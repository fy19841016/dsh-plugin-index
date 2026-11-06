# dsh-plugin-index

自建 DSH 插件索引，供 DeepSeek Harness 的「设置 → 插件 → 发现 → 添加索引源」使用。

索引地址（直接用这个）：

    https://raw.githubusercontent.com/fy19841016/dsh-plugin-index/main/index.json

当前收录：`dsh-usage-cost` 1.5.0（git，commit 7e0581c）— 侧边栏 token 用量 / 费用估算 / 峰谷时段 / 账号余额。

## 改索引的固定流程

1. 改 `index.json`。
2. 本地预检（会把 DSH 读取时拒绝的规则先跑一遍）：

       node verify-index.mjs index.json

3. push 到 `main`；GitHub Actions 的 `validate-index` 会再校验一次，红了就别指望 DSH 能读。
4. 等 3–5 分钟：`raw.githubusercontent.com` 有 `max-age=300` 的边缘缓存，这期间 DSH 读到的还是旧版。
5. DSH 里刷新「发现」页确认。

## 已知会被 DSH 拒绝的写法

- `source.path` 不能是 `.` / `..` / 绝对路径；仓库根目录的包**直接省略 `path`**。
- `format` 必须是数字 `1`。
- `versions` 不能空；`version` 必须是 semver。
- `source.type` 只接受 `npm` 或 `git`；git 必须给 `url`（https）和 40 位 `commit`。
- 本地化文本对象必须含非空 `en`。

## 校验器

`verify-index.mjs` 是零依赖 Node 22 脚本，CI 与本地共用；失败时按 `$.plugins[0].versions[0].source.path` 这种路径报错，和 DSH 的报错形式一致。
