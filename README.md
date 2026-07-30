# 灶房

一个数据留在本机的中文菜谱 PWA。支持菜谱增删改查、按人数和餐次进行本地规则推荐、完整 ZIP 备份、离线安装、脱敏诊断日志，以及可关闭的远程图片解析。

## 隐私边界

- 菜谱、图片、标签、推荐历史、模型配置和诊断日志保存在浏览器 IndexedDB。
- 不使用账号、云数据库、云同步或自动遥测。
- 远程图片解析默认关闭。启用后只发送当前图片、补充文字和固定解析提示。
- AI 生成必须在设置中开启，并由用户在菜谱编辑页点击“智能生成”才会调用。
- API Key、诊断日志和错误堆栈不进入业务 ZIP 备份。
- 浏览器本地保存的 API Key 不具备操作系统密钥链级别的保护。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

构建与测试：

```bash
npm run typecheck
npm run test
npm run build
```

模型接口可通过 `.env` 预填非密钥默认值：

```bash
VITE_AI_ENDPOINT=https://example.com/v1/chat/completions
VITE_AI_MODEL=your-vision-or-text-model
VITE_AI_ENABLED=false
```

API Key 不建议放入 `.env` 注入前端包或 APK，请在应用“设置与诊断”中手动填写。

## Android APK

Android 版本使用 Capacitor 封装，页面资源直接包含在 APK 内，不依赖网站托管。菜谱和图片保存在应用自己的本地数据目录中。

生成可侧载的调试 APK：

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21
export ANDROID_HOME=/usr/local/share/android-commandlinetools
npm run android:apk
```

输出文件为 `android/app/build/outputs/apk/debug/app-debug.apk`。发送到 Android 手机后，允许当前文件管理器“安装未知应用”即可安装。卸载应用或清除应用数据会删除手机中的菜谱，操作前请先在“数据管家”导出 ZIP。

完整环境安装、MacBook 启动、Android APK 打包和 iOS/Xcode 打包说明见 [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)。

## 使用流程

1. 在“我的菜谱”中添加、编辑或删除菜谱；支持 JPG、PNG、WebP、HEIC/HEIF。Android APK 会优先用原生能力把 HEIC 转为 JPEG，转换失败时仍保留原图并可保存。
2. 需要 AI 时，先在“设置与诊断”打开“允许使用 AI 生成”并填写模型配置，再在添加菜谱时上传图片或填写菜名，点击“智能生成”。
3. 在“今日推荐”输入人数、餐次、口味和标签。默认推荐菜品数为人数加一。
4. 在“数据管家”导出完整 ZIP；换设备后选择同一 ZIP 即可恢复。
5. 在“设置与诊断”主动开启调试模式、下载脱敏日志或配置支持图片输入的兼容模型接口。

详细开发进展见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
