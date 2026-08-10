# 灶房（Zaofang）

[![CI](https://github.com/Fuguidan/zaofang-local-recipes/actions/workflows/ci.yml/badge.svg)](https://github.com/Fuguidan/zaofang-local-recipes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

一个本地优先、重视隐私的中文菜谱应用。支持在电脑浏览器运行，也可以通过 Capacitor 打包成 Android APK 安装到手机。

菜谱、图片、标签、推荐历史、模型配置和诊断日志默认保存在当前浏览器或 Android 应用的本地空间，不需要账号、云数据库或网站托管。

## 功能

- 菜谱新增、查看、修改、删除、搜索、分页和缩略图展示。
- JPG、PNG、WebP、HEIC/HEIF 图片上传，以及裁剪、旋转、平移和缩放。
- 按人数、早餐/午餐/晚餐、口味和标签进行本地规则推荐，默认推荐“人数 + 1”道菜。
- 本地营养估算：热量、蛋白质、碳水、脂肪、膳食纤维和钠。
- 本地 ZIP 导入导出、冲突处理和大图片流式备份。
- 可选的 AI 文字生成、图片识别、思考开关和 Token 用量统计。
- PWA 离线使用、脱敏诊断日志和 Android 原生文件导出。
- `weixin/` 中同时提供微信小程序版本，主项目不依赖它运行。

## 隐私与安全

- 应用不会自动上传菜谱、图片、日志或备份。
- AI 默认关闭，只有用户在设置中启用并主动点击生成时才会请求模型。
- AI 请求只包含当前图片、菜名或补充说明，不会发送整个菜谱库。
- API Key 由用户在应用设置中填写并保存在本机，不进入源码、APK、ZIP 业务备份或诊断日志。
- `.env`、签名文件、本地数据库、用户图片、日志、ZIP、APK 和本机 SDK 配置均被 Git 忽略。
- 浏览器中的 API Key 不是操作系统密钥链级别的安全存储，请使用权限和额度受限的个人密钥。

安全问题请参阅 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中粘贴密钥、私人菜谱、图片或诊断日志。

## 环境要求

- Node.js `22.13.0` 或更高版本
- npm（随 Node.js 安装）
- Android 打包额外需要 JDK 21、Android SDK Platform 36 和 Build Tools 36

macOS、Windows、Linux 的环境说明见 [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)。

## 在电脑运行网站版

```bash
git clone https://github.com/Fuguidan/zaofang-local-recipes.git
cd zaofang-local-recipes
npm ci
npm run dev
```

根据终端提示打开本地地址，通常是 [http://localhost:3000](http://localhost:3000)。

检查和构建：

```bash
npm run typecheck
npm run test
npm run build
npm run start
```

首次配置可复制无密钥示例：

```bash
cp .env.example .env.local
```

`.env` 只适合预填接口地址、模型名和 AI 默认开关。不要把 API Key 写入任何 `VITE_` 环境变量，因为它们会进入浏览器或 APK 前端包。

本机执行 `npm run dev` 时，Web AI 请求会经过同源开发代理，以绕开常见浏览器 CORS 限制。不开启 AI 时，菜谱管理、推荐、营养计算和备份完全不需要模型接口。

## 构建 Android APK

先安装并配置 JDK 21 与 Android SDK，然后执行：

```bash
npm ci
npm run android:apk
```

APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

把 APK 发送到 Android 手机，在系统设置中允许当前文件管理器或浏览器“安装未知应用”后即可安装。

这是使用调试证书签名的 APK，适合个人使用、开发测试和小范围体验。长期分发或应用商店发布应使用由项目维护者自行保管的正式签名密钥；签名文件不得提交到 Git。

完整安装和打包步骤见 [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)。

## AI 配置

应用使用 OpenAI-compatible Chat Completions 请求格式。设置页需要填写：

- HTTPS 接口地址
- 模型名称
- API Key
- “允许使用 AI 生成”开关

文字连接成功不代表模型支持图片，请再运行“测试图片能力”。图片模型失败时仍可以使用“仅文字生成”，所有失败场景都会保留原始图片和文字。

仓库不提供或共享模型 API Key，模型调用产生的费用由使用者自己的模型服务账户承担。

## 本地数据与备份

网站版使用 IndexedDB，Android 版使用 WebView 本地数据库及应用私有文件目录。不同浏览器、域名和设备之间的数据不会自动同步。

卸载应用、清除浏览器网站数据或清除 Android 应用数据前，请先在“数据管家”导出 ZIP。业务备份不包含 API Key、诊断日志或错误堆栈。

## 项目结构

```text
app/          网站主要界面和业务代码
android/      Capacitor Android 原生工程
capacitor/    Android 使用的静态 Web 入口
public/       PWA 图标、清单和 Service Worker
worker/       本地/可选托管环境的 AI 同源代理
tests/        自动化测试
docs/         环境、营养设计和开发记录
weixin/       独立的微信小程序版本
```

## 参与开发

欢迎提交 Issue 和 Pull Request。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。提交前至少执行：

```bash
npm run test
npm run build
```

## 下载版本

源代码可以从仓库克隆。后续 APK 会通过 [GitHub Releases](https://github.com/Fuguidan/zaofang-local-recipes/releases) 提供，不把二进制文件提交到 Git 历史。

## 许可证与数据来源

项目代码采用 [MIT License](LICENSE)。本地营养数据由 USDA FoodData Central 公共数据整理而来，营养结果仅为估算值，不能替代医疗或专业营养建议。
