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
2. 在仓库 Secrets 配置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，并把生成的公钥写入 `src-tauri/tauri.conf.json` 的 updater `pubkey`。
3. 更新版本号后推送与 `package.json` 一致的 `v*` tag，触发 Windows 安装包、`.sig` 和 `latest.json` 发布。

## 本地打包

```bash
npm install
npm run build
npm run tauri:build
```

本地更新包签名时需通过环境变量提供 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，不要写入文件或提交。
