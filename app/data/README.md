# 本地营养标准数据

`nutrition-foods.json` 是应用内置的只读营养参考库，共 7,342 条食品记录。数据由以下 USDA FoodData Central 官方下载集生成：

- Foundation Foods，2026-04-30
- SR Legacy，2018-04

原始数据采用 CC0 公共领域许可。本项目只提取每 100 克的热量、蛋白质、碳水化合物、脂肪、膳食纤维和钠，并去除同名重复记录；不包含用户菜谱或个人数据。

重新生成时，从 [USDA 下载页](https://fdc.nal.usda.gov/download-datasets/) 获取两个 JSON 压缩包并解压，然后运行：

```bash
node scripts/generate-nutrition-data.mjs <Foundation JSON> <SR Legacy JSON> app/data/nutrition-foods.json
```

生成后必须执行类型检查、全部测试和 Web/Android 构建，并在 `docs/DEVELOPMENT.md` 记录来源版本、记录数和变更原因。
