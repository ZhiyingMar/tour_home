# 星光小屋

一间单人玩的温馨小屋：可以走动、窝沙发、点壁炉、睡觉、读信，窗外跟着真实时间变化，还有一只尾巴装着星空的小松鼠"小星"陪着你聊天。

纯前端静态页面，没有后端、没有账号、没有构建步骤。所有数据只存在你这台设备的浏览器里。

## 本地运行

需要一个静态文件服务器（直接双击 `index.html` 不行，浏览器不允许从 `file://` 加载模块）。

```bash
cd tour_home
python3 -m http.server 8765
```

然后打开 <http://localhost:8765>。

想预览别的时段，在网址后面加 `?hour=`，例如 `?hour=6.5`（朝霞）、`?hour=14`（午后）、`?hour=22`（深夜）。

## 怎么玩

| 操作 | 触屏 | 电脑 |
| --- | --- | --- |
| 走动 | 点地板 | 点地板，或 WASD / 方向键 |
| 互动 | 点物品，或走近后点右下角大按钮 | 同左，或按 E / 空格 |
| 和小星聊天 | 点小星 | 点小星，Esc 关闭 |

| 出门 / 回屋 | 点屋里右边的门；在屋外点小屋的门 | 同左 |
| 缩放镜头 | 双指捏合 | 滚轮 |

屋外有花园、池塘、长椅和一条铁路，草地和树林向四面八方无限延伸（远处的草木按坐标现算，没有边界），地平线是弯的。小星会一直跟着你。

右上角四个按钮：📖 小星的记忆本、⚙️ 设置、🔊 声音、？ 操作说明。

## 小星的 AI 对话

不填 API key 也能玩，小星会说几句预设台词。想让它真的聊天：

1. 在 [Claude Console](https://platform.claude.com/settings/keys) 创建一个 API key（建议绑定到单个 workspace，并设一个过期时间）。
2. 游戏里点 ⚙️，把 key 粘贴进去，保存。

设置页里还能改：小星对你的称呼（默认"小颖"）、模型名（默认 `claude-opus-5-5`，想省钱可以改成 `claude-haiku-5-5`）、Workspace ID（只有 key 没绑定 workspace 时才需要），并显示本次会话调用了多少次 API。

### 浏览器直接调用 API 需要什么

依据 Anthropic 官方文档 [Authentication → Browser-based applications](https://platform.claude.com/docs/en/manage-claude/authentication#browser-based-applications)：

- 浏览器发的是跨域（CORS）请求，API 只在请求带有 `anthropic-dangerous-direct-browser-access: true` 请求头时才接受。代码在 `js/ai.js` 里加了这个头，你不需要做任何额外配置。
- 官方并不推荐把 key 放在网页里，因为能打开页面的人都能读到它。这个游戏之所以可以这样做：key 是你自己粘贴的，只存在这台设备的 `localStorage`，直接发给 `api.anthropic.com`，不写进代码、环境变量或仓库，也不经过任何别的服务器。
- 所以请注意：**不要在公用设备上填 key**；清除浏览器网站数据会把 key 一起清掉；如果怀疑泄露，去 Console 里把这个 key 停用。
- 开启了零数据保留（ZDR）或 Compliance API 的组织不能从浏览器直连，会返回 401，这时游戏会提示并改用预设台词。

### 回复长度和费用

- 每次请求 `max_tokens` 上限 600，提示词要求不超过三句，客户端还会再截到最多三句。
- 每条消息会带上"最近事件摘要（最多 12 条）+ 最近 10 句对话"，所以单次调用很小。
- 调用次数只统计本次打开页面期间，刷新后归零。

## 小星的记忆

游戏自动记下你做的事：窝沙发、点燃/熄灭壁炉、睡觉、起床、读信、摸小星、和小星聊天，以及当时的时间和时段。只保留最近 200 条。

在 📖 记忆本里可以查看、删除单条、全部清空，也可以导出成 JSON 文件备份，或者从 JSON 文件导入（和现有记录合并去重）。换设备时用导出/导入搬家。

## 部署到 GitHub Pages

1. 在 GitHub 上新建一个仓库（公开仓库即可使用免费的 Pages）。
2. 在项目目录里：

   ```bash
   git init
   git add .
   git commit -m "星光小屋"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 打开仓库的 **Settings → Pages**，**Source** 选 **Deploy from a branch**，分支选 `main`、目录选 `/ (root)`，保存。
4. 等一两分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

仓库里没有任何密钥，可以放心公开。所有路径都是相对路径，放在子目录下也能跑。

## 在 iPad 上添加到主屏幕

1. 用 **Safari** 打开上面的网址（必须是 Safari）。
2. 点工具栏的 **分享** 按钮（方框加向上箭头）。
3. 选 **添加到主屏幕**，点 **添加**。
4. 从主屏幕图标打开，会全屏运行，没有地址栏。横屏玩效果最好。

注意：主屏幕图标和 Safari 里打开的页面各有一份独立的本地数据。API key、存档、记忆本要在从图标打开的那一份里重新填；记忆可以用导出/导入搬过去。

## 代码结构

```
index.html            页面骨架和所有面板
css/style.css         界面样式
js/config.js          房间尺寸、游戏名、信的文字、扩展开关
js/main.js            入口：场景、输入、互动、主循环
js/room.js            小屋、家具、灯光、壁炉
js/outdoor.js         屋外：小屋外观、池塘、铁路、无限延伸的草木、天空
js/bend.js            让地平线向下弯的着色器补丁
js/scenery.js         窗外风景（实时画在一张画布上）
js/player.js          玩家角色
js/xiaoxing.js        小星的模型、行为、预设台词
js/nav.js             寻路
js/ai.js              调用 Claude API、提示词、设置
js/memory.js          事件记录（记忆）
js/panels.js          聊天框、设置页、记忆本
js/ui.js              时钟、按钮、气泡、弹窗
js/audio.js           合成音效
js/store.js           存档和事件总线
js/time.js            时间和昼夜
vendor/               Three.js（r170，已放进仓库，不依赖 CDN）
```

常见的修改：

- 改信的内容、游戏名：`js/config.js`
- 改小星的性格和说话方式：`js/ai.js` 里的 `systemPrompt()`
- 改预设台词：`js/xiaoxing.js` 里的 `PRESET_LINES`
- 改家具位置或加家具：`js/room.js`（记得同步 `obstacles` 占地）

## 预留的扩展位（现在都没实现）

- **厨房与做菜**：屋里屋外的切换在 `js/main.js` 的 `switchArea`，厨房可以照这个方式作为第三个场景加进来（比如在左墙开一扇门），新房间照 `buildRoom` 的写法写一个 `buildKitchen`。新动作在 `js/memory.js` 的 `LABEL` 里加一行就会进记忆。
- **联机**：玩家的所有动作都经过 `js/store.js` 的 `bus.emit('action', …)`，联机时在这里把事件同步出去。
- **四季**：`js/scenery.js` 的 `PALETTES` 按季节加配色，再改 `js/config.js` 的 `SEASON`。
