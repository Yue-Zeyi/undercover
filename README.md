# 谁是卧底 · 好友局

uni-app + Vue 3 + TypeScript 的多人联网小游戏。每人使用自己的手机，通过房间号或邀请链接加入同一局。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm install
npm run dev
```

- H5：`http://localhost:5173`
- 后端：`http://localhost:3001/api/health`
- 手机与电脑连接同一局域网后，访问终端输出的 Network 地址。邀请链接使用当前访问地址，手机邀请好友时请使用局域网地址，不能使用 localhost。
- 至少 4 名玩家可以开局。每个浏览器存储空间对应一个玩家；在电脑上模拟多人时使用独立浏览器或独立无痕会话。

`npm run dev:h5` 和 `npm run dev:server` 可以分别启动前后端。端口默认是 5173、3001；后端可通过 `PORT` 环境变量修改，同时需修改 Vite 代理目标。

## 已实现

- 创建房间、人数和卧底数设置、8 个词库主题、3 档难度和混合难度、60/90/120 秒发言。
- 昵称、8 个头像、准备、房主转移、邀请链接与房间号。H5 大厅邀请弹窗会本地生成带房间二维码的邀请海报，支持保存海报和复制邀请链接；iPhone 未自动下载时可长按图片保存。
- H5 首次访问会提示保存平台入口二维码，支持下载或长按截图；完成提示后会在本机记住状态，不再重复打扰。
- 服务端随机发词，同房间用完当前筛选词池才重复，每局随机交换平民词与卧底词；各客户端只收到自己的词语，结束前不公开身份。
- 看词确认、按座位轮流文字发言、服务器超时推进。
- 不可投自己，每轮每人一票；平票候选人再次发言后重投；无人投票则进入下一轮。
- 自动判定双方胜负、身份揭晓、词语共同点与区别复盘、发言记录、原房间再来一局。
- 对局中可发起提前结束或踢人申请；发起人自动计入同意，在线且未挂机玩家达到半数同意后生效。
- 会话凭证持久保存、心跳与重连、刷新恢复、切后台隐藏词语、显式退出。
- 发言、投票、出局和结算节点提供轻量音效，首页顶部可以随时开关，设置保存在本机。
- 房间首页按钮及“挂机回首页”：保留原房间、座位、词语和已提交投票，首页可返回房间，刷新后仍保留首页状态。
- 大厅离线座位保留 2 分钟，过期自动释放；投票目标主动退出后，投给他的玩家可以重新投票，其他有效票保留。

## 挂机与退出

- 点击房间内的首页图标，或在退出弹窗中选择“挂机回首页”，会保持连接并向其他玩家显示“挂机中”。回首页后不会显示自己的词语。
- 大厅挂机会取消准备，所有人回到房间并准备后才能开局。房主挂机时，有在线且非挂机玩家就移交房主；原房主返回后不会自动拿回房主权限。
- 对局中挂机保留身份、词语、座位和已提交投票，对局倒计时继续，不自动代发言或代投票。首页显示当前对局进度，点击“返回房间”恢复原对局。
- “确认退出”才会真正离开房间；进行中的玩家会出局。首页保留房间时，创建/加入区域的主按钮为“退出当前房间”，确认退出后才能创建或加入其他房间。
- 回首页挂机与关闭网页、切到手机后台不同：后两种情况仍按离线与重连规则处理，大厅离线超过 2 分钟会释放座位。

## 词库

内置 **480 组词对**，每组包含两个相近但可区分的词、主题、难度、共同点和区别说明。每个主题 60 组，其中轻松、标准、烧脑各 20 组；默认使用全部主题的标准难度，共 160 组。

| 主题 | 文件 | 词对数 |
| --- | --- | --- |
| 日常生活 | `server/word-bank/daily.ts` | 60 |
| 吃吃喝喝 | `server/word-bank/food.ts` | 60 |
| 出行天地 | `server/word-bank/places.ts` | 60 |
| 职业身份 | `server/word-bank/jobs.ts` | 60 |
| 自然万物 | `server/word-bank/nature.ts` | 60 |
| 文娱时光 | `server/word-bank/culture.ts` | 60 |
| 运动休闲 | `server/word-bank/sports.ts` | 60 |
| 数码科技 | `server/word-bank/tech.ts` | 60 |

`GET /api/catalog` 仅返回词库数量及主题/难度统计，供创建页显示当前可用数量。完整词库只在服务端加载，词语说明仅在结算时发送。开发服务器禁止通过静态路径读取后端和测试目录。重开保留本房间的抽词记录，词池用尽时重新洗牌且避免立即抽到上一组；新房间不继承其他房间的记录。

新增词对时，在对应主题数组中添加：

```ts
['第一个词', '第二个词', 'normal', '两个词共有的具体特征', '分别指出两个词的真实区别']
```

词对需处于可比较的概念层级，避免同义别称、上下位包含关系和生僻知识凑数。难度以描述时的相似程度和区分难度为依据。修改后运行 `npm test`，会检查正反顺序重复、文字格式、各主题难度覆盖、抽词循环和隐私。语义是否准确、是否有趣仍需内容审阅及实际试玩，不能仅靠数量检查判断。

## 检查与构建

```sh
npm test
npm run typecheck
npm run build:h5
npm run build:mp-weixin
```

H5 产物在 `dist/build/h5`；微信小程序产物在 `dist/build/mp-weixin`。

## 公网部署

当前开发地址仅供本机或局域网访问。异地玩家需要可访问的服务器和 HTTPS 域名。

1. 在服务器安装 Node.js 和项目依赖，执行 `npm run build:h5`。
2. 使用进程管理工具常驻运行 `npm start`，默认监听 3001。
3. 将 `dist/build/h5` 作为静态站点，用反向代理把 `/api/` 和 `/ws` 转发给后端。
4. 为站点配置 HTTPS，WebSocket 自动使用 WSS。浏览器前后端使用同源地址，不需要配置跨域。

生产 H5 可以不设置 `VITE_API_BASE_URL`，前端会按当前访问地址请求同源的 `/api` 和 `/ws`；这样同一份静态包可以换域名部署。若使用独立 API 域名，再在构建前设置该变量，并确认 HTTPS 与 WebSocket 域名均可访问。

Nginx 的相关 location 配置如下，应放在已配置证书的 server 块内：

```nginx
root /srv/wodi/dist/build/h5;
index index.html;

location / {
    try_files $uri $uri/ /index.html;
}

location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
}

location /ws {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 90s;
}

location = /admin { return 302 /admin/; }
location /admin/ { try_files $uri $uri/ =404; }
```

管理后台地址为 `https://你的域名/admin/`。管理员账号和密码必须通过环境变量设置；未设置 `ADMIN_PASSWORD` 时，管理后台会拒绝登录：

```sh
ADMIN_USERNAME=你的账号 ADMIN_PASSWORD=你的强密码 WODI_DATA_DIR=/srv/wodi-data npm start
```

后台登录后可以设置系统名称和备案号、维护词对。备案号会显示在前台底部，并链接到工信部备案查询网站。

不要把 Vite 开发服务器用于公网生产环境。当前 uni-app 编译工具链包含上游依赖的 npm audit 告警，需要随 DCloud 兼容版本升级处理；服务端业务仅依赖 Node.js、ws，未采用这些编译工具处理请求。

## 微信小程序

1. 在 `src/manifest.json` 设置自己的 `mp-weixin.appid`。
2. 在构建前设置生产 API 地址。复制 `.env.example` 为 `.env.local`，填入你自己的 HTTPS 后端域名，再执行 `npm run build:mp-weixin`。
   ```sh
   VITE_API_BASE_URL=https://你的服务域名 npm run build:mp-weixin
   ```
3. 微信开发者工具导入 `dist/build/mp-weixin`。在微信后台配置对应的 request 和 socket 合法域名。
4. 已具备微信分享入口，复用昵称会话。正式发布前还需验证微信真机、隐私声明及平台发布流程；当前没有接入微信账号登录。

## 首版边界

- 房间存在单个服务进程内存中，服务重启会结束未完成的对局。不支持多实例共享房间或跨服务器恢复。
- 房间两小时无玩家状态操作后清理；最多 500 个房间，每房保留最近 160 条发言/系统消息。
- 大厅离线超过 2 分钟释放座位并撤销凭证；对局中离线保留座位和词语，按服务器计时跳过发言/投票，回到大厅时清理过期离线席位。
- 480 组内置词对位于 `server/word-bank/`，可通过 `https://你的域名/admin/` 维护。后台修改会落盘到 `WODI_DATA_DIR` 指定目录（默认 `data/wodi-admin.json`）。
- 首版为文字玩法，没有内置语音、随机匹配和玩家账号系统；管理员使用独立账号登录后台。

## 文件结构

```text
shared/protocol.ts          前后端消息与快照类型
shared/word-catalog.ts      主题、难度和公开词库统计类型
server/engine.ts            房间、规则、计时与私密快照
server/index.ts             HTTP / WebSocket 服务
server/admin-store.ts       管理后台配置与词库持久化
server/word-bank/           按主题维护的中文词库与复盘说明
server/words.ts             词库汇总与公开数量统计
server/word-selection.ts    同房间去重抽词
src/services/connection.ts  uni-app 请求、心跳与重连
src/services/sound.ts       音效开关与轻量提示音
src/services/invite.ts      H5 邀请链接拼接与跨端回退文本
src/services/qr.ts          H5 二维码矩阵与图片生成
src/stores/game.ts          会话恢复及 Pinia 状态
src/pages/index/index.vue   页面入口、入口提示、邀请和弹窗
src/components/             大厅、对局、入口提示、邀请分享和通用控件
src/static/                 人物插画、头像和 Lucide 图标
tests/                      客户端连接与恢复测试
```

图标来源为 Lucide，许可证位于 `src/static/icons/LICENSE`。人物与桌游插画为本项目制作的 SVG。
