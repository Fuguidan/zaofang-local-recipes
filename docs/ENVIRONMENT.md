# 灶房运行与打包环境说明

本文记录当前项目在 MacBook 上的运行环境、安装位置、安装方式、启动命令，以及 Android / iOS 打包方式。

## 1. Xcode 是什么

Xcode 是 Apple 官方的开发工具，作用类似 Android 开发里的 Android Studio 加 SDK。做 iOS 应用时，Xcode 负责：

- 提供 iOS SDK、模拟器和真机调试能力。
- 打开 Capacitor 生成的 iOS 原生工程。
- 管理 iPhone 真机运行、签名证书、App ID 和打包归档。
- 导出可安装或可提交 App Store / TestFlight 的 iOS 包。

简单说：Capacitor 负责把 Web 应用接进 iOS 原生壳，Xcode 负责把这个原生工程编译、签名、安装或导出。

## 2. Xcode 安装方式

推荐方式：

1. 打开 Mac 的 App Store。
2. 搜索 `Xcode`。
3. 点击获取或安装。
4. 安装完成后打开一次 Xcode，按提示接受许可协议并安装附加组件。

也可以从 Apple Developer 网站下载指定版本：

1. 打开 `https://developer.apple.com/download/all/`。
2. 使用 Apple ID 登录。
3. 搜索 `Xcode`，下载需要的版本。
4. 解压并放到 `/Applications/Xcode.app`。

安装后建议执行：

```bash
xcodebuild -version
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license
```

如果只是在模拟器运行，一般有 Apple ID 即可。若要安装到真机、导出 IPA、使用 TestFlight 或上架 App Store，需要配置 Apple Developer 账号、签名证书和 Team。

## 3. 当前项目位置

项目目录：

```bash
/Users/wuyangjun/fuguidan/code/caipu
```

关键文件：

- `package.json`：项目依赖和常用脚本。
- `package-lock.json`：精确依赖版本。
- `capacitor.config.ts`：Capacitor 应用配置。
- `vite.capacitor.config.ts`：Android / iOS 原生壳使用的静态 Web 构建配置。
- `android/`：已生成的 Android 原生工程。
- `artifacts/zaofang-android-debug.apk`：当前已生成的 Android 调试安装包。

当前还没有生成 `ios/` 目录。只有执行 `npx cap add ios` 后，才会出现 iOS 原生工程。

## 4. 当前本机环境位置

Codex 当前使用的 Node.js：

```bash
/Users/wuyangjun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

当前已确认版本：

```bash
node v24.14.0
npm 10.8.2
```

Java / JDK：

```bash
/usr/local/opt/openjdk@21
```

当前已确认版本：

```bash
OpenJDK 21.0.12
```

Android SDK：

```bash
/usr/local/share/android-commandlinetools
```

当前已确认安装包：

```text
build-tools;35.0.0
build-tools;36.0.0
platform-tools;37.0.0
platforms;android-36
```

查看本机安装内容：

```bash
cd /Users/wuyangjun/fuguidan/code/caipu

npm ls --depth=0
brew list --versions openjdk@21
JAVA_HOME=/usr/local/opt/openjdk@21 ANDROID_HOME=/usr/local/share/android-commandlinetools \
  /usr/local/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager --list_installed
```

## 5. 环境安装方式

安装项目依赖：

```bash
cd /Users/wuyangjun/fuguidan/code/caipu
npm install
```

如果系统 Node.js 低于 22.13，可以临时使用 Codex 缓存的 Node.js：

```bash
export PATH="/Users/wuyangjun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
```

安装 Android 打包依赖的参考命令：

```bash
brew install openjdk@21 android-commandlinetools

export JAVA_HOME=/usr/local/opt/openjdk@21
export ANDROID_HOME=/usr/local/share/android-commandlinetools

yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0"
```

说明：接受 Android SDK License 需要由使用者确认。不要把 API Key、签名密钥、用户菜谱 ZIP 或日志文件提交到 Git。

模型配置可以通过项目根目录的 `.env` 预填非密钥默认值：

```bash
VITE_AI_ENDPOINT=https://example.com/v1/chat/completions
VITE_AI_MODEL=your-vision-or-text-model
VITE_AI_ENABLED=false
```

这些变量会在构建时进入前端程序或移动端安装包。当前实现不会从 `.env` 读取 API Key，API Key 请在应用“设置与诊断”中手动填写，只保存在当前设备的本地数据库。

## 6. MacBook 本地运行

启动开发环境：

```bash
cd /Users/wuyangjun/fuguidan/code/caipu
export PATH="/Users/wuyangjun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm install
npm run dev
```

常用检查：

```bash
npm run typecheck
npm run test
npm run build
```

AI 生成使用规则：

- 设置页未打开“允许使用 AI 生成”时，不会发起任何模型请求。
- 添加菜谱时必须先上传图片或填写菜品名称，再点击“智能生成”才会调用模型。
- “测试文本连接”只验证接口地址、模型名和 API Key 的基础可用性；图片解析前建议再点击“测试图片能力”。
- MacBook 本机 Web 开发环境通过 `npm run dev` 启动时，AI 请求会自动走本机开发代理，浏览器只访问 `localhost`，由本机开发服务器转发到模型接口，用于规避常见 CORS 拦截。
- 静态网页、非本机地址或没有运行开发服务器时不能使用上述代理；遇到 `cors_or_network` 时，请确认是否正在用 `npm run dev` 打开页面，并检查接口地址、网络和模型服务是否允许当前访问方式。
- 遇到 `vision_not_supported` 时，说明接口可连接但当前模型或服务不支持图片输入，请换支持视觉的模型或只用菜名生成。
- 遇到 `bad_model_payload` 时，说明接口返回 JSON 中没有可识别的模型文本内容。当前兼容 `choices[].message.content`、`choices[].text`、`output_text` 和 `output[].content[].text`；如果仍失败，请确认接口是否为 Chat Completions/Responses 兼容格式。
- Android APK 上传 HEIC/HEIF 图片时会先尝试 Android 原生转换为 JPEG，用于预览、保存、AI 生成和 ZIP 备份。
- Web 环境会继续尝试浏览器原生解码和 `heic2any` 转换。
- 如果 HEIC/HEIF 转换失败，应用会保留原始图片并允许保存菜谱；该图片不会发送给模型，可填写菜名走文本生成。
- 未配置 API Key、模型接口异常、用户取消或模型返回异常时，原始图片和文字会保留，可继续手动保存。

生产预览：

```bash
npm run build
npm run start
```

## 7. Android APK 打包

Android 版本使用 Capacitor 封装，Web 页面资源直接包含在 APK 内，不依赖网站托管。菜谱、图片、设置和诊断日志保存在 Android 应用自己的本地数据目录中。

生成可侧载安装的调试 APK：

```bash
cd /Users/wuyangjun/fuguidan/code/caipu
export PATH="/Users/wuyangjun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export JAVA_HOME=/usr/local/opt/openjdk@21
export ANDROID_HOME=/usr/local/share/android-commandlinetools

npm run android:apk
```

输出文件：

```bash
android/app/build/outputs/apk/debug/app-debug.apk
artifacts/zaofang-android-debug.apk
```

安装到 Android 手机：

1. 把 `artifacts/zaofang-android-debug.apk` 发送到手机。
2. 在手机文件管理器中打开 APK。
3. 按系统提示允许该来源“安装未知应用”。
4. 安装后即可离线使用本地菜谱、推荐、ZIP 导入导出和诊断面板。

Android APK 导出 ZIP 时会先显示默认文件名，然后打开系统文件选择器。你可以选择下载目录、网盘目录或其他支持写入的位置；保存完成后页面会显示文件名和系统 URI，并提供“打开导出的文件”按钮，用系统文件管理器或 ZIP 查看器打开该备份。

注意：当前 APK 使用 Android 调试证书，适合测试和小范围自用。正式长期分发或上架应用商店时，需要生成 release 包并使用项目所有者保管的正式签名密钥。

## 8. iOS 工程与 IPA 打包

前置条件：

- 已安装 Xcode。
- 已打开 Xcode 并完成首次组件安装。
- 如需真机安装或导出 IPA，需要配置 Apple Developer 账号和签名 Team。

首次生成 iOS 工程：

```bash
cd /Users/wuyangjun/fuguidan/code/caipu
export PATH="/Users/wuyangjun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"

npm install @capacitor/ios
npx cap add ios
npm run build:android:web
npx cap sync ios
npx cap open ios
```

后续同步 Web 改动到 iOS：

```bash
cd /Users/wuyangjun/fuguidan/code/caipu
export PATH="/Users/wuyangjun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"

npm run build:android:web
npx cap sync ios
npx cap open ios
```

在 Xcode 中运行或打包：

1. 打开 `ios/App/App.xcworkspace`。
2. 选择 `App` target。
3. 在 `Signing & Capabilities` 中选择 Team。
4. 连接 iPhone 或选择模拟器后点击运行。
5. 如需导出 IPA，选择 `Product > Archive`，归档完成后通过 Organizer 导出。

说明：iOS 不像 Android 那样可以随意侧载 APK。真机安装和 IPA 分发通常都需要 Apple 签名体系支持。

## 9. 数据安全提醒

- 卸载 Android / iOS 应用或清除应用数据，会删除手机本地菜谱。
- 换手机、重装应用、清除数据前，请先在应用的“数据管家”导出 ZIP。
- ZIP 业务备份不包含 API Key、诊断日志和错误堆栈。
- 诊断日志只在本机保存，不自动上传。
- AI 日志只记录来源类别、结果、耗时和错误编号，不记录图片内容、完整提示词、完整响应或完整菜谱正文。
- HEIC 转换日志只记录转换阶段、结果和脱敏错误摘要，不记录图片内容。
