# 用药管理器

给姥姥用的全天进食、用药、喝水提醒与打卡网站。前台一屏看清「现在该做什么、还有多久、几点做」，后台可以补录、改排程、发公告、看历史。

- 前台（老人/陪伴人员）：`https://yu-xiaohei.github.io/Grandma-s-medication-record/`
- 后台（管理员）：`https://yu-xiaohei.github.io/Grandma-s-medication-record/admin/`
- 前端：Next.js 静态导出，托管在 GitHub Pages
- 后端：Cloudflare Workers + D1（免费额度足够一个家庭使用）

## 目录

```
app/            页面（首页 / admin）与全局样式
components/     前台卡片、打卡抽屉、口令门、后台各页
lib/            排程数据、时间/规则计算、API 封装、缓存与离线队列
worker/         Cloudflare Worker（API + D1）
public/         图标、manifest、Service Worker
scripts/        构建后生成离线预缓存清单
.github/        Pages 自动部署
```

## 前台行为要点

- 主卡显示当前/下一项，带倒计时和计划时间；下面是今天全部时间点。
- 口令：4 位数字，用网页内置大键盘输入；同一台设备 7 天免输。
- 每项要逐条勾选（或点「暂缓」）后才能点「完成」。
- 「未完成」必须过了计划时间 5 分钟才能点，并且要二次确认。
- 早于计划时间 5 分钟以上点「完成」会先提醒一次（提前打卡不代表提前吃药）。
- 一直没打卡：距离下一项只剩 70% 的间隔时，这一项自动记为未完成，主卡直接显示下一项。比例可以在后台调整（30~95）。
- 断了网也能看（首次打开后会缓存），打卡先存在本机，联网自动上传。

## 部署状态

已经上线：Worker `https://grandma-medication-api.yu-xiaohei.workers.dev`，D1 `grandma_medication`。
GitHub Actions 变量 `API_BASE` 指向该 Worker，推送到 `main` 会自动构建并发布 Pages。

## 首次部署（换新环境时照着做）

### 1. 建 D1 数据库

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create grandma_medication
```

把输出的 `database_id` 填进 `worker/wrangler.toml`。

### 2. 配密钥并部署

```bash
cd worker
npx wrangler secret put TOKEN_SECRET        # 随便一串 32 字节以上的随机字符
npx wrangler secret put PASSWORD_PEPPER     # 另一串随机字符
npx wrangler secret put SETUP_TOKEN         # 初始化口令，设置完可以删掉
npx wrangler d1 execute grandma_medication --remote --file=src/schema.sql
npx wrangler deploy
```

`wrangler.toml` 里的 `ALLOWED_ORIGINS` 已经是 `https://yu-xiaohei.github.io`。

### 3. 初始化账号（只做一次）

```bash
curl -X POST https://grandma-medication-api.<你的子域>.workers.dev/api/setup \
  -H "content-type: application/json" \
  -H "x-setup-token: <SETUP_TOKEN>" \
  -d "{\"username\":\"Admin\",\"password\":\"Admin12345678\",\"pin\":\"0000\"}"
```

初始化后 `admins` 表不为空，这个接口会返回 409，不能再被调用。

> 初始口令 `0000`、管理员 `Admin / Admin12345678` 只用于第一次进入。进后台后立刻在「排程设置 → 口令与密码」里改掉，然后执行 `npx wrangler secret delete SETUP_TOKEN`。

### 4. GitHub Pages

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
2. Settings → Secrets and variables → Actions → **Variables** 新增 `API_BASE`，值为 Worker 地址（例如 `https://grandma-medication-api.xxx.workers.dev`）。
3. 推送到 `main`，Actions 会自动构建并发布。

如果以后绑了自定义域名，再加一个 `BASE_PATH` 变量，值填 `/`。

## 本地开发

```bash
# 后端
cd worker
npx wrangler d1 execute grandma_medication --local --file=src/schema.sql
npx wrangler dev --port 8787

# 前端（另开一个窗口）
echo NEXT_PUBLIC_API_BASE=http://127.0.0.1:8787 > .env.local
npm install
npm run dev
```

本地需要 `worker/.dev.vars`（已在 `.gitignore` 里）：

```
TOKEN_SECRET="任意随机串"
PASSWORD_PEPPER="另一串随机串"
SETUP_TOKEN="local-setup-token"
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

## 数据规则

- 排程改动只影响「今天及以后」，历史记录沿用当天的排程快照显示。
- 记录只在「当前生效日」可改；过了切天时间（默认 00:00，可调）锁死为只读。
- 每次写入都会在 `record_events` 留痕。

## 说明

- 时间表内容照搬《老人全天进食与用药时间表_手机版-新.xlsx》Sheet 1，总水量 610 ml、营养液 900 ml、辅食 300 ml。
- 密码哈希用 HMAC + pepper，而不是 PBKDF2，是为了留在 Workers 免费版 CPU 额度内，安全强度按「家庭自用」设计。

## 日常维护

```powershell
cd worker
npx wrangler tail                                  # 线上日志
npx wrangler deploy                                # 改完 Worker 后发布

# 看最近记录
npx wrangler d1 execute grandma_medication --remote --command "SELECT day, task_id, status FROM records ORDER BY day DESC, task_id LIMIT 20;"

# 备份整库（建议每月一次，存到家里网盘）
npx wrangler d1 export grandma_medication --remote --output=backup-$(Get-Date -Format yyyyMMdd).sql
```

前端口令和管理员密码在后台「排程设置 → 口令与密码」里改。`/api/setup` 初始化完就把 `SETUP_TOKEN` 换成不会保存的随机值了，等于永久关闭。
