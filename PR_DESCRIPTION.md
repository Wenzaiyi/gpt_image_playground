# 威肯绘图 Windows 客户端改版

## 改动内容

- 统一品牌为「威肯绘图」（WeikenDraw），更新窗口标题、Tauri identifier、安装包名称、页面标题、PWA manifest 与图标。
- 删除赞助商/推广配置、赞助弹窗和在线体验入口；关于页保留 MIT 归属并注明基于 CookSleep/gpt_image_playground 修改。
- 预置唯一推荐的「威肯API」OpenAI 兼容配置：`https://panel.weekendapi.site/v1`，模型为 `gpt-image-2`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`，不包含任何 API Key。
- 顶部新增「充值 / 获取密钥」按钮，打开威肯API后台。
- 自动更新地址切换到 `Wenzaiyi/gpt_image_playground` GitHub Releases，pubkey 保留占位。
- 删除 Vercel、GitHub Pages、Docker 工作流，仅保留 Windows Tauri 发布工作流。

## 还需要手动完成

1. 运行 `npx tauri signer generate` 生成签名密钥。
2. 在仓库 Secrets 配置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，公钥已配置到 `src-tauri/tauri.conf.json` 的 updater `pubkey`；仍需在仓库 Secrets 配置私钥和密码。
3. 更新版本号后推送与 `package.json` 一致的 `v*` tag，触发 Windows 安装包、`.sig` 和 `latest.json` 发布。

## 本地打包

```bash
npm install
npm run build
npm run tauri:build
```

本地更新包签名时需通过环境变量提供 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，不要写入文件或提交。

## 余额查询说明

已检查威肯API公开可访问的 OpenAI 兼容入口；当前环境无法确认 sub2api 的余额/用量接口契约（未提供可验证的 `/v1/usage` 响应或 dashboard billing API），因此未猜测并实现余额展示，保留「充值 / 获取密钥」入口。


# 1.0.1 改动

- 合并为单一“威肯API”预置配置，默认模型为 gpt-image-2，并支持首页切换三个预置模型。
- API 配置中新增“获取模型”，调用 GET /models 合并返回模型 ID，并显示中文错误提示。
- 保留 Agent 与高级功能，批量提交开关默认关闭。
- productName 改为 WeikenDraw，窗口标题保持“威肯绘图”，安装包文件名使用英文产品名。
- 修复 Windows 发布工作流的 updater JSON 上传配置，确保生成 latest.json。
- 版本号升级至 1.0.1。


## 1.0.1 首页与发布修订

- Windows productName 恢复为“威肯绘图”，发布工作流通过 `assetNamePattern` 生成 `WeikenDraw_[version]_[arch][setup][ext]` 英文资产名。
- 首页默认收起高级参数，突出提示词、参考图和生成按钮；未配置 API Key 时提供设置与充值入口，Agent 顶部入口保留。
- 批量提交设置默认关闭（`showBatchPrompt` 与 `batchPromptEnabled` 默认均为 `false`）。
