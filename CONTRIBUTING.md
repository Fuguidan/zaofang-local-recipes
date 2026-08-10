# 参与贡献

感谢你参与灶房项目。提交代码即表示你同意自己的贡献按照项目的 MIT License 发布。

## 开始开发

1. Fork 仓库并从 `main` 创建功能分支。
2. 安装 Node.js 22.13 或更高版本。
3. 执行 `npm ci` 安装锁定版本的依赖。
4. 使用 `npm run dev` 启动本地网站。

请勿在 Issue、提交、测试样本或 Pull Request 中包含 API Key、签名文件、真实菜谱、私人图片、ZIP 备份或完整诊断日志。

## 修改要求

- 保持本地优先和默认不联网的隐私边界。
- AI 请求必须由用户明确开启并主动触发。
- 日志不得记录密钥、图片、完整提示词、模型响应或完整菜谱正文。
- 数据写入、备份导入和数据库升级应在失败时保持原数据可恢复。
- 新功能或缺陷修复需要补充相应测试。
- 同步更新 `docs/DEVELOPMENT.md`。

## 提交前检查

```bash
npm run typecheck
npm run test
npm run build
```

修改 Android 相关代码时还应执行：

```bash
npm run android:apk
```

微信小程序相关改动在 `weixin/` 中执行：

```bash
cd weixin
npm run check
```

## 提交信息

使用简洁的 Conventional Commits 风格：

```text
feat(recipe): 增加菜谱筛选
fix(android): 修复文件导出失败
test(backup): 覆盖损坏ZIP回滚
docs(readme): 更新本地运行说明
```

每个提交只处理一个明确功能、测试、修复或文档主题。

## Pull Request

Pull Request 请说明：

- 修改了什么以及为什么修改
- 对用户行为和数据兼容性的影响
- 执行过的验证命令
- 涉及界面时提供脱敏截图
- 是否影响隐私、备份格式、Android 或 AI 请求边界
