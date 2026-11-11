# 定格 · Stillframe

本地优先的摄影作品 Web 工作台。照片、标识和编辑操作在浏览器内完成，没有上传图片的接口。

## 启动

项目路径：`/Users/liuwei/Documents/stillframe`。

本机可以双击 `启动定格.command`，脚本使用 Node 24 启动 Vite 并打开浏览器。首次使用 npx 的 Node 24 可能需要联网下载运行时；项目依赖已安装。

标准开发环境：Node 24 LTS、pnpm 9.12.3（项目含 `.nvmrc` 与锁文件）。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

本机地址 `http://127.0.0.1:5173`；同一局域网内的设备可通过 `http://<本机局域网 IP>:5173` 访问。服务监听所有网卡，请只在可信网络中启动；若无法连接，请检查系统防火墙和设备是否在同一局域网。5173 已被占用时需停止旧服务，或手动更改启动端口。

## 连续出片流程

支持先导入照片或先选模板，两种入口都进入同一个编辑工作台。导入时自动读取 EXIF、匹配品牌 Logo，并在画布上方显示照片信息；缺失信息可通过“编辑信息”补填。

工作台左侧切换模板、滤镜、文字与标识、图层，中央始终预览同一张照片，顶部步骤可随时返回。切换模板保留滤镜、拍摄信息、签名与个人素材，并可撤销；右上角“导出照片”打开导出设置。添加新照片沿用当前样式，各张照片保留自己的 EXIF，也可将样式统一应用到全部照片。

编辑时明确区分三个操作：“添加照片”将新照片加入队列；“替换照片”只替换当前队列项，保留模板、滤镜、签名和个人素材，按新照片比例适配布局，并重新读取 EXIF 与品牌；底部缩略图用于“切换照片”，保留各张照片的编辑与撤销记录。替换可撤销及重做，包含原始照片、拍摄参数和布局的整体恢复。撤销记录保留在当前浏览器会话中，草稿继续保存最新编辑状态。

## 已实现的首版功能

- 六种边框模板：经典参数、画廊留白、虚化背景、电影宽幅、拍立得和透明内嵌。
- 导入本地 JPG、PNG、WebP；文件头识别、50MB／32MP／每批50张限制、内容哈希去重。
- React-Konva 元素选择、拖动、控制点缩放、旋转、位置尺寸、比例、透明度、锁定、显隐、层级、删除与对齐。
- 添加自定义文字，上传透明 PNG／WebP Logo 和签名。
- EXIF 自动读取及手动修正，标记自动／手动来源；光圈、ISO感光度、焦距、快门、镜头、日期可选择显示，并支持独立绑定为文字元素。
- 内置尼康、富士、佳能、徕卡、哈苏、索尼、松下、理光、宾得、OM/奥林巴斯、大疆与苹果品牌选择，识别常见 EXIF 厂商名称，支持自定义。
- 八种色彩预设及曝光、对比、高光、阴影、色温、饱和度；PixiJS WebGL 调色及分块 CPU 降级。
- Worker 后台预览及原图导出；自托管中文字体、Canvas 合成和编码。
- JPG、PNG、WebP，质量与输出尺寸选项；原图不覆盖、默认不复制源元数据。
- JPG 拍摄字段白名单回写，排除 GPS、源缩略图和序列号，重建方向／尺寸。
- 批量串行导出、ZIP 打包、100MiB 分包、完成当前项后取消、失败项重试。
- 50 步布局／调色历史，批量应用当前布局；横竖图重新布局并解析各自元数据。
- Dexie 个人预设、素材与草稿；刷新后重新导入同一原图可恢复草稿。
- 深浅主题：曜石黑＋浅香槟、冷白＋柔和灰蓝（#526DA6）；响应式布局避免页面横向溢出。

## 架构

`domain` 保存业务场景和模板，`features/editor` 负责交互与属性面板，`engine` 负责色彩／合成，`workers` 提供串行图像服务，`storage` 管理 IndexedDB。

交互由 Konva 绘制，高清输出由 Worker 中 Canvas 2D 绘制；共用文档、布局、文字规则与滤镜定义。预览使用长边1600px代理图，导出重新解码原图。字体资源是静态化的 Noto Sans SC／Noto Serif SC WOFF2，支持中文，按进入画布／首次导出加载。

业务 UI 使用 Less Modules 与 CSS Variables。基础弹窗采用 Base UI 无样式控件直接定制，没有引入 Tailwind 业务样式。TypeScript 锁定在 6.0 稳定系列，以匹配当前 typescript-eslint 的支持范围；没有机械追随不兼容的新版本。

## 检查命令

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# 开发服务器运行后；使用本机 Chrome
pnpm test:e2e
```

`tests/model.test.ts` 验证模板尺寸、横竖图重排、动态绑定和像素公式。Playwright 覆盖真实导入、拖动／缩放、标识、主题、撤销、预设、草稿恢复和三种下载格式；另含24MP与20张批量压力用例。产物位于 `tests/result*`，已加入 Git 忽略。

## 当前边界

这是已跑通出片流程的首版，尚未等同于技术方案中所有阶段完成：

- 当前验证浏览器为本机 Chrome；Safari、Firefox、移动触控仍需专项验证。
- ZIP 使用受限内存 Blob 分包，尚未接 File System Access 直接流式落盘。
- 尚无照片裁剪编辑器、多选组合、吸附参考线、手写画板、自定义字体上传、云账号或跨设备同步。
- 手动 EXIF 可恢复原始读取值；当前历史主要覆盖场景与调色操作。
- 滤镜是自己的艺术调色公式，不承诺与 Lightroom／RAW 显影或专业 ICC 打印流程一致。
- 原图仅会话内持有；草稿、预设与素材受浏览器存储配额和清理策略影响。清理站点数据会删除本地记录。
- 后台 GPU 不可用时使用相同公式 CPU 路径，速度受设备影响；长图、异常字体和超大输出仍有设备限制。

## 部署

`pnpm build` 生成 `dist/`，可以由 HTTPS 静态服务器托管。提供 Dockerfile 与 Nginx SPA 配置（Docker 镜像构建尚未在本机执行）。

```sh
docker build -t stillframe .
docker run --rm -p 8080:80 stillframe
```

## 摄影与字体来源

示例摄影来自 Unsplash，保留署名：

- Stephen Coetsee：https://unsplash.com/photos/rQVOlHFFLzs
- Willian Justen de Vasconcellos：https://unsplash.com/photos/_MMP5j_fCqw
- Simon Fevery：https://unsplash.com/photos/fzSJecmxtVQ

默认署名留空，需要用户自行设置；未读取到的参数不会被打印成提示文字。字体来自 Google Fonts 的 Noto Sans SC／Noto Serif SC，许可证保存在 `public/fonts/OFL-*.txt`。用户上传照片与标识的权利归其所属权利人。
