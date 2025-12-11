# LightApp 项目配置说明

## 首次运行配置

1. 复制配置模板文件：
   ```bash
   cp config.local.example.json config.local.json
   ```

2. 编辑 `config.local.json`，填入您的实际配置：
   - Cosmos DB 的 endpoint 和 key
   - 各个模型的 endpoint 和 apiKey

3. **重要**: `config.local.json` 文件包含敏感信息，已被添加到 `.gitignore`，不会提交到 Git 仓库。

## 配置文件说明

- `config.json`: 公共配置文件，包含模型参数等非敏感信息（会提交到 Git）
- `config.local.json`: 本地私有配置，包含 endpoint 和 key 等敏感信息（不会提交到 Git）
- `config.local.example.json`: 配置模板，展示需要配置的项目（会提交到 Git）

## 运行项目

确保 `config.local.json` 配置正确后，运行：
```bash
node server.js
```
