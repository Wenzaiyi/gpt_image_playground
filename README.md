# 威肯绘图（WeikenDraw）

面向电商客户的 Windows 桌面图像生成客户端，基于 OpenAI 兼容接口使用威肯API。

## 使用

1. 点击顶部「充值 / 获取密钥」打开威肯API后台。
2. 注册并充值后创建 API Key。
3. 在「设置 → API 配置」中选择「威肯API」，粘贴 Key 并选择模型。

预置模型：`gpt-image-2`（默认）、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`。

本项目基于 CookSleep/gpt_image_playground（MIT）修改，原版权声明保留在 [LICENSE](LICENSE)。

## 本地开发与打包

```bash
npm install
npm run build
npm run tauri:build
```

发布前需要运行 `npx tauri signer generate`，并在 GitHub Secrets 配置 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。推送与 `package.json` 版本一致的 `v*` tag 后，Windows 发布工作流会构建并上传安装包、签名文件和 `latest.json`。
