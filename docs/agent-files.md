# Agent 临时文件与测试文件索引

最后核对：2026-11-23 12:40（北京时间）。`.agent-tmp/` 已被 `.gitignore` 忽略，不会进发布包。

## 1. 目录与命名

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `.agent-tmp/*.py`、`.agent-tmp/*.png`、`.agent-tmp/*.json` | `tmp_` 一次性 | 历次 UI 实测 / 截图 / 线上探针脚本，按日期后缀区分（`_20261122`、`_20261123`） |
| `.agent-tmp/ui/` | `tmp_` 一次性 | 2026-11-22 前后台改版期间的批量截图与测试脚本（约 106 个） |
| `.agent-tmp/autotest/` | `tmp_` 一次性 | 2026-11-22 用的 `rules.js` / `time.js` / `types.js` 编译产物 |
| `.agent-tmp/dryrun/` | `tmp_` 一次性 | Next 静态导出的 dry-run 副本（`index.js`、sourcemap、README） |
| `.agent-tmp/secrets/` | `tmp_` 一次性，**含凭据** | 2026-11-22 写入的 `tmp_admin_token_*`、`tmp_ann_id_*`、`tmp_setup_token_*`。管理员 token 12 小时早过期；建议尽快人工删除，不要再写新 token 到磁盘 |
| `.agent-tmp/enc_test.txt`、`next-dev.log`、`static.log`、`wrangler-dev*.log`、`token.txt`、`tmp_devvars_backup_*.txt` | `tmp_` 一次性 | 本地调试日志与备份；`tmp_devvars_backup_*` 对应 `worker/.dev.vars` 改动前快照 |

## 2. 仍需保留（近期排查证据）

- `tmp_live_savebar_probe_20261123.py`、`tmp_bottom_check_20261123.py`、`tmp_savebar_619_20261123.py`：保存条 fixed 定位的线上 / 本地实测脚本，见 `docs/handoff-20261123.md`。
- `tmp_verify_session_20261123.py`：前后台 token 分离后的验证（后台退出不影响前台、无 token 时必须过口令门）。
- `tmp_verify_migrate_savebar_20261123.py`：旧 token 迁移 + 保存条滚动定位验证。

## 3. 运行方式

```powershell
# 静态预览（先 npm run build）
python -m http.server 4173 --directory out

# 本地后端
cd worker; npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:http://127.0.0.1:4173

# 任选一个 tmp_ 脚本（需要 PYTHONUTF8，否则中文输出乱码）
$env:PYTHONUTF8="1"; python .agent-tmp/tmp_verify_session_20261123.py
```

## 4. 清理条件

- `*.png` 截图在对应问题确认修复后可整批删除（仓库里已有 `docs/log.md` 结论）。
- `secrets/` 三个文件确认过期后立即删除。
- `autotest/`、`dryrun/` 是旧构建产物，可随时重建，不再需要就删。

## 5. 长期测试

当前项目没有 `test_*` 长期测试文件（纯静态前端 + Worker，验证以 `typecheck`、`build` 和 Playwright 实测为主）。以后新增长期测试统一放 `tests/`，命名 `test_<模块>_<用途>.py`。
