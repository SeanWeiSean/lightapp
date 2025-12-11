/**
 * LightApp Server - 四阶段流水线架构
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PROMPTS = require('./prompts/index');
const { CosmosClient } = require('@azure/cosmos');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));
app.use('/images', express.static(path.join(__dirname, 'images'))); // 图片静态服务

// 应用存储目录（本地备份）
const APPS_DIR = path.join(__dirname, 'apps');
if (!fs.existsSync(APPS_DIR)) {
    fs.mkdirSync(APPS_DIR, { recursive: true });
}

// 加载本地配置文件
const localConfigPath = path.join(__dirname, 'config.local.json');
if (!fs.existsSync(localConfigPath)) {
    console.error('错误: config.local.json 文件不存在！');
    console.error('请复制 config.local.example.json 为 config.local.json 并填入正确的配置。');
    process.exit(1);
}
const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));

// Cosmos DB 配置
const cosmosEndpoint = localConfig.cosmos.endpoint;
const cosmosKey = localConfig.cosmos.key;
const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
const cosmosDatabase = cosmosClient.database('lightapp');
const cosmosContainer = cosmosDatabase.container('onlinecollection');  // 用户分享的应用
const cosmosStoreContainer = cosmosDatabase.container('appstore');     // 商店精选应用
const cosmosImagesContainer = cosmosDatabase.container('images');      // 图片存储

// ============ 图片 Cosmos DB 操作 ============

async function saveImageToCosmos(imageId, base64Data, metadata = {}) {
    try {
        const cosmosDoc = {
            id: imageId,
            Appid: imageId,  // Partition key
            base64: base64Data,
            contentType: 'image/png',
            createdAt: new Date().toISOString(),
            ...metadata
        };
        const { resource } = await cosmosImagesContainer.items.upsert(cosmosDoc);
        console.log(`[CosmosImages] Image saved: ${imageId}`);
        return resource;
    } catch (error) {
        console.error(`[CosmosImages] Save error:`, error.message);
        throw error;
    }
}

async function getImageFromCosmos(imageId) {
    try {
        const { resource } = await cosmosImagesContainer.item(imageId, imageId).read();
        return resource;
    } catch (error) {
        if (error.code === 404) {
            return null;
        }
        console.error(`[CosmosImages] Read error:`, error.message);
        throw error;
    }
}

// 确保 images container 存在
async function ensureImagesContainer() {
    try {
        await cosmosDatabase.containers.createIfNotExists({
            id: 'images',
            partitionKey: { paths: ['/Appid'] }
        });
        console.log('[CosmosImages] Container ready');
    } catch (error) {
        console.error('[CosmosImages] Container init error:', error.message);
    }
}

// Cosmos DB 操作函数 - 用户应用
async function saveAppToCosmos(appData) {
    try {
        // Cosmos DB 需要 id 字段，使用 Appid 作为 partition key
        const cosmosDoc = {
            ...appData,
            id: appData.id,  // Cosmos DB 文档 id
            Appid: appData.id  // Partition key
        };
        const { resource } = await cosmosContainer.items.upsert(cosmosDoc);
        console.log(`[Cosmos] App saved: ${appData.id}`);
        return resource;
    } catch (error) {
        console.error(`[Cosmos] Save error:`, error.message);
        throw error;
    }
}

async function getAppFromCosmos(appId) {
    try {
        const { resource } = await cosmosContainer.item(appId, appId).read();
        return resource;
    } catch (error) {
        if (error.code === 404) {
            return null;
        }
        console.error(`[Cosmos] Read error:`, error.message);
        throw error;
    }
}

async function deleteAppFromCosmos(appId) {
    try {
        await cosmosContainer.item(appId, appId).delete();
        console.log(`[Cosmos] App deleted: ${appId}`);
        return true;
    } catch (error) {
        if (error.code === 404) {
            return false;
        }
        console.error(`[Cosmos] Delete error:`, error.message);
        throw error;
    }
}

async function listAppsFromCosmos() {
    try {
        const querySpec = {
            query: 'SELECT c.id, c.name, c.description, c.createdAt FROM c ORDER BY c.createdAt DESC'
        };
        const { resources } = await cosmosContainer.items.query(querySpec).fetchAll();
        return resources;
    } catch (error) {
        console.error(`[Cosmos] List error:`, error.message);
        throw error;
    }
}

// ============ 商店应用 Cosmos DB 操作 ============

async function saveStoreAppToCosmos(storeApp) {
    try {
        const cosmosDoc = {
            ...storeApp,
            id: storeApp.id,
            Appid: storeApp.id
        };
        const { resource } = await cosmosStoreContainer.items.upsert(cosmosDoc);
        console.log(`[CosmosStore] App saved: ${storeApp.id} - ${storeApp.name}`);
        return resource;
    } catch (error) {
        console.error(`[CosmosStore] Save error:`, error.message);
        throw error;
    }
}

async function getStoreAppFromCosmos(appId) {
    try {
        const { resource } = await cosmosStoreContainer.item(appId, appId).read();
        return resource;
    } catch (error) {
        if (error.code === 404) {
            return null;
        }
        console.error(`[CosmosStore] Read error:`, error.message);
        throw error;
    }
}

async function deleteStoreAppFromCosmos(appId) {
    try {
        await cosmosStoreContainer.item(appId, appId).delete();
        console.log(`[CosmosStore] App deleted: ${appId}`);
        return true;
    } catch (error) {
        if (error.code === 404) {
            return false;
        }
        console.error(`[CosmosStore] Delete error:`, error.message);
        throw error;
    }
}

async function listStoreAppsFromCosmos() {
    try {
        const querySpec = {
            query: 'SELECT * FROM c'
        };
        const { resources } = await cosmosStoreContainer.items.query(querySpec).fetchAll();
        // 在代码中排序，避免 Cosmos DB 复合索引问题
        resources.sort((a, b) => {
            const orderDiff = (a.order || 999) - (b.order || 999);
            if (orderDiff !== 0) return orderDiff;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        return resources;
    } catch (error) {
        console.error(`[CosmosStore] List error:`, error.message);
        throw error;
    }
}

// 启动时同步本地应用到 Cosmos DB
async function syncLocalAppsToCosmos() {
    try {
        const files = fs.readdirSync(APPS_DIR).filter(f => f.endsWith('.json'));
        console.log(`[Cosmos] Found ${files.length} local apps to sync...`);
        
        let synced = 0;
        for (const f of files) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(APPS_DIR, f), 'utf-8'));
                // 检查 Cosmos DB 中是否已存在
                const existing = await getAppFromCosmos(data.id);
                if (!existing) {
                    await saveAppToCosmos(data);
                    synced++;
                    console.log(`[Cosmos] Synced: ${data.id} - ${data.name}`);
                }
            } catch (e) {
                console.log(`[Cosmos] Skip ${f}: ${e.message}`);
            }
        }
        console.log(`[Cosmos] Sync complete: ${synced} new apps synced`);
    } catch (error) {
        console.error(`[Cosmos] Sync error:`, error.message);
    }
}

// 启动时同步本地精选应用到 Cosmos DB appstore
async function syncLocalStoreAppsToCosmos() {
    try {
        const featuredConfigPath = path.join(__dirname, 'featured-apps.json');
        if (!fs.existsSync(featuredConfigPath)) {
            console.log(`[CosmosStore] No featured-apps.json found, skip sync`);
            return;
        }
        
        const featuredConfig = JSON.parse(fs.readFileSync(featuredConfigPath, 'utf-8'));
        console.log(`[CosmosStore] Found ${featuredConfig.featured.length} featured apps to sync...`);
        
        let synced = 0;
        for (const item of featuredConfig.featured) {
            try {
                // 检查 appstore 中是否已存在
                const existing = await getStoreAppFromCosmos(item.id);
                if (!existing) {
                    // 从 onlinecollection 获取应用数据
                    const appData = await getAppFromCosmos(item.id);
                    if (appData) {
                        const storeApp = {
                            id: appData.id,
                            name: appData.name,
                            description: appData.description || appData.enrichedData?.appDescription || '',
                            code: appData.code,
                            enrichedData: appData.enrichedData,
                            category: item.category || 'tools',
                            tags: item.tags || [],
                            order: item.order || 999,
                            createdAt: appData.createdAt,
                            addedToStoreAt: new Date().toISOString()
                        };
                        await saveStoreAppToCosmos(storeApp);
                        synced++;
                    }
                }
            } catch (e) {
                console.log(`[CosmosStore] Skip ${item.id}: ${e.message}`);
            }
        }
        console.log(`[CosmosStore] Sync complete: ${synced} new store apps synced`);
    } catch (error) {
        console.error(`[CosmosStore] Sync error:`, error.message);
    }
}

// 加载配置
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

// 合并本地配置到全局配置中
if (localConfig.models) {
    for (const [modelName, modelLocalConfig] of Object.entries(localConfig.models)) {
        if (config.models[modelName]) {
            // 将本地配置的 endpoint 和 apiKey 覆盖到全局配置
            if (modelLocalConfig.endpoint) {
                config.models[modelName].endpoint = modelLocalConfig.endpoint;
            }
            if (modelLocalConfig.apiKey) {
                config.models[modelName].apiKey = modelLocalConfig.apiKey;
            }
        }
    }
}

// ========== 图片生成功能 ==========
const https = require('https');

// 图片存储目录
const IMAGES_DIR = path.join(__dirname, 'images');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * 生成图片并保存到本地文件
 * @param {string} prompt - 图片描述
 * @param {string} requestId - 请求ID
 * @param {string} imageType - 图片类型 (cover/gameover)
 * @returns {Promise<{base64: string, filePath: string}|null>}
 */
async function generateAndSaveImage(prompt, requestId, imageType = 'cover', retryCount = 0) {
    const MAX_RETRIES = 2;
    const imageConfig = config.models.text2image;
    if (!imageConfig) {
        console.log(`[${requestId}] 图片生成模型未配置，跳过图片生成`);
        return null;
    }

    console.log(`[${requestId}] 🎨 生成${imageType === 'cover' ? '封面' : '结束'}图${retryCount > 0 ? ` (重试 ${retryCount}/${MAX_RETRIES})` : ''}: ${prompt.substring(0, 80)}...`);
    
    const requestBody = {
        model: imageConfig.model,
        prompt: prompt.substring(0, 500),
        negative_prompt: "text, watermark, ugly, blurry, low quality",
        size: imageConfig.size || "512x512",
        true_cfg_scale: imageConfig.true_cfg_scale || 1.0,
        num_inference_steps: imageConfig.num_inference_steps || 8,
        seed: Math.floor(Math.random() * 100000)
    };

    return new Promise((resolve) => {
        const postData = JSON.stringify(requestBody);
        const urlObj = new URL(imageConfig.endpoint);
        
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 90000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                if (res.statusCode !== 200) {
                    console.log(`[${requestId}] ⚠️ 图片API返回错误 ${res.statusCode}: ${data.substring(0, 200)}`);
                    // 500 错误时尝试重试
                    if (res.statusCode === 500 && retryCount < MAX_RETRIES) {
                        console.log(`[${requestId}] 🔄 等待 2 秒后重试...`);
                        await new Promise(r => setTimeout(r, 2000));
                        resolve(await generateAndSaveImage(prompt, requestId, imageType, retryCount + 1));
                    } else {
                        resolve(null);
                    }
                    return;
                }
                try {
                    const result = JSON.parse(data);
                    if (result.data && result.data[0] && result.data[0].b64_json) {
                        const base64 = result.data[0].b64_json;
                        
                        // 生成图片ID
                        const imageId = `${requestId}-${imageType}`;
                        
                        // 保存图片到本地文件（备份，方便调试）
                        const fileName = `${imageId}.png`;
                        const filePath = path.join(IMAGES_DIR, fileName);
                        const buffer = Buffer.from(base64, 'base64');
                        fs.writeFileSync(filePath, buffer);
                        
                        // 保存图片到 Cosmos DB images 容器
                        try {
                            await saveImageToCosmos(imageId, base64, {
                                requestId: requestId,
                                imageType: imageType,
                                prompt: prompt.substring(0, 200)
                            });
                            console.log(`[${requestId}] ✅ ${imageType}图已保存到数据库 (${Math.round(base64.length/1024)}KB)`);
                        } catch (dbError) {
                            console.log(`[${requestId}] ⚠️ 图片保存到数据库失败: ${dbError.message}`);
                        }
                        
                        resolve({
                            imageId: imageId,
                            localPath: filePath
                        });
                    } else {
                        console.log(`[${requestId}] ⚠️ 图片响应格式异常: ${JSON.stringify(result).substring(0, 200)}`);
                        resolve(null);
                    }
                } catch (e) {
                    console.log(`[${requestId}] ⚠️ 图片解析失败: ${e.message}, 响应: ${data.substring(0, 200)}`);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.log(`[${requestId}] ⚠️ 图片请求失败: ${e.message}`);
            resolve(null);
        });

        req.on('timeout', () => {
            console.log(`[${requestId}] ⚠️ 图片请求超时`);
            req.destroy();
            resolve(null);
        });

        req.write(postData);
        req.end();
    });
}

// 阶段信息
const STAGES = [
    { id: 'stage1', name: 'PM · 需求分析', description: '理解需求，规划功能和交互' },
    { id: 'stage1_5', name: 'Artist · 图片生成', description: '生成封面图和游戏失败图' },
    { id: 'stage2', name: 'Dev · 逻辑实现', description: '编写核心代码和业务逻辑' },
    { id: 'stage3', name: 'Tester · 漏洞查找', description: '测试边界情况，修复潜在问题' },
    { id: 'stage4', name: 'Designer · 画面优化', description: '优化视觉效果和用户体验' }
];

/**
 * 根据 stage 获取模型配置（支持动态指定模型）
 */
function getModelConfig(stage, overrideModelKey = null) {
    // 如果指定了模型，直接使用
    if (overrideModelKey && config.models[overrideModelKey]) {
        return config.models[overrideModelKey];
    }
    // 否则使用默认配置
    const stageConfig = config.stages[stage];
    if (!stageConfig) {
        throw new Error(`Unknown stage: ${stage}`);
    }
    const modelKey = stageConfig.modelKey;
    const modelConfig = config.models[modelKey];
    if (!modelConfig) {
        throw new Error(`Unknown model: ${modelKey}`);
    }
    return modelConfig;
}

/**
 * 获取流水线配置（供前端使用）
 */
function getPipelineConfig() {
    // 返回可用模型和阶段配置（不暴露敏感信息）
    const models = {};
    for (const [key, m] of Object.entries(config.models)) {
        models[key] = {
            key: key,
            name: m.name,
            displayName: m.displayName || m.name  // 使用 config.json 中的 displayName
        };
    }
    const stages = {};
    for (const [key, s] of Object.entries(config.stages)) {
        stages[key] = {
            name: s.name,
            defaultModel: s.defaultModel || s.modelKey,
            availableModels: s.availableModels || Object.keys(config.models)
        };
    }
    return { models, stages };
}

/**
 * 调用 LLM API（非流式）
 */
async function callLLMSimple(stage, messages, requestId = '', overrideModelKey = null) {
    const modelConfig = getModelConfig(stage, overrideModelKey);
    const url = `${modelConfig.endpoint}${config.api.path}`;
    const tag = requestId ? `[${requestId}][${stage}]` : `[${stage}]`;
    
    console.log(`${tag} Calling LLM: ${modelConfig.name} (${modelConfig.model})`);
    console.log(`${tag} URL: ${url}`);
    
    const requestBody = {
        model: modelConfig.model,
        messages: messages,
        max_tokens: modelConfig.max_tokens || 4096,
        stream: false,
        temperature: modelConfig.temperature || 0.7
    };

    // 添加可选参数
    if (modelConfig.top_p !== undefined) {
        requestBody.top_p = modelConfig.top_p;
    }
    if (modelConfig.top_k !== undefined) {
        requestBody.top_k = modelConfig.top_k;
    }
    if (modelConfig.repetition_penalty !== undefined) {
        requestBody.repetition_penalty = modelConfig.repetition_penalty;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${modelConfig.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`${tag} LLM Error:`, response.status, errorText);
        throw new Error(`LLM API Error: ${response.status}`);
    }

    const data = await response.json();
    
    // 详细日志：检查响应结构
    if (!data.choices || data.choices.length === 0) {
        console.error(`${tag} Empty choices in response:`, JSON.stringify(data).substring(0, 500));
    }
    
    const content = data.choices?.[0]?.message?.content || '';
    console.log(`${tag} Response length: ${content.length}`);
    
    // 如果内容为空，记录更多信息
    if (!content) {
        console.error(`${tag} Empty content. Full response:`, JSON.stringify(data).substring(0, 1000));
    }
    
    return content;
}

/**
 * 从 LLM 响应中提取 JSON
 */
function extractJSON(content) {
    // 清理常见的问题
    let cleaned = content.trim();
    
    // 移除 <think>...</think> 标签（某些模型会输出思考过程）
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    // 移除可能的 markdown 代码块标记
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    
    // 尝试直接解析
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // 继续尝试其他方法
    }

    // 尝试提取 ```json 代码块
    const jsonMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (e2) {
            console.error('JSON parse error in code block');
        }
    }

    // 尝试提取 { } 包裹的内容（贪婪匹配最外层）
    const braceMatch = cleaned.match(/\{[\s\S]*\}/);
    if (braceMatch) {
        let jsonStr = braceMatch[0];
        
        try {
            return JSON.parse(jsonStr);
        } catch (e3) {
            // 尝试更激进的修复：处理未转义的引号
            try {
                // 记录详细错误信息
                console.error('JSON parse error details:', e3.message);
                console.error('JSON snippet (first 500 chars):', jsonStr.substring(0, 500));
                
                // 尝试使用 eval（不推荐但作为后备）
                // 先验证基本结构
                if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
                    const result = (new Function('return ' + jsonStr))();
                    if (result && typeof result === 'object') {
                        console.log('Recovered JSON using eval fallback');
                        return result;
                    }
                }
            } catch (e4) {
                console.error('Eval fallback also failed');
            }
        }
    }

    // 最后尝试：查找包含 html/css/js 键的对象
    const keyMatch = content.match(/"html"\s*:\s*"[\s\S]*?"css"\s*:\s*"[\s\S]*?"js"\s*:\s*"/);
    if (keyMatch) {
        console.error('Found JSON keys but failed to parse. Response may have malformed escaping.');
    }

    console.error('Full response (first 1000 chars):', content.substring(0, 1000));
    throw new Error('Failed to extract JSON from response');
}

// 从 package.json 读取版本号
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const APP_VERSION = packageJson.version;

/**
 * 健康检查 - 包含版本号，用于 K8s readinessProbe
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        version: APP_VERSION,
        features: ['pipeline-config', 'stage-generate', 'refine'],  // 支持的功能列表
        timestamp: new Date().toISOString() 
    });
});

/**
 * 从数据库获取图片（支持跨机器访问）
 */
app.get('/api/images/:imageId', async (req, res) => {
    const { imageId } = req.params;
    
    try {
        const imageDoc = await getImageFromCosmos(imageId);
        if (!imageDoc || !imageDoc.base64) {
            return res.status(404).json({ success: false, error: 'Image not found' });
        }
        
        // 返回图片二进制数据
        const buffer = Buffer.from(imageDoc.base64, 'base64');
        res.set('Content-Type', imageDoc.contentType || 'image/png');
        res.set('Cache-Control', 'public, max-age=31536000'); // 缓存1年
        res.send(buffer);
    } catch (error) {
        console.error(`[API] Get image error:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取流水线配置
 */
app.get('/api/config/pipeline', (req, res) => {
    res.json({ success: true, ...getPipelineConfig() });
});

/**
 * 单阶段生成接口（简单 JSON 返回）
 */
app.post('/api/generate/stage', async (req, res) => {
    const { prompt, stageId, existingCode, enrichedData, modelKey } = req.body;
    
    // 生成唯一请求ID，方便追踪并发请求
    const requestId = `R${Date.now().toString(36).slice(-4)}`;

    console.log(`\n========== [${requestId}] Stage ${stageId} ==========`);
    console.log(`[${requestId}] 用户原始输入: ${prompt?.substring(0, 60)}...`);
    if (enrichedData?.appName) {
        console.log(`[${requestId}] enrichedData: appName=${enrichedData.appName}, enrichedPrompt=${enrichedData.enrichedPrompt?.substring(0, 50)}...`);
    }
    if (existingCode?.html) {
        console.log(`[${requestId}] existingCode: HTML ${existingCode.html.length} chars, CSS ${existingCode.css?.length || 0} chars, JS ${existingCode.js?.length || 0} chars`);
    }

    if (!prompt || !stageId) {
        return res.status(400).json({ success: false, error: 'Missing prompt or stageId' });
    }

    const stagePrompt = PROMPTS[stageId];
    if (!stagePrompt) {
        return res.status(400).json({ success: false, error: `Invalid stage: ${stageId}` });
    }

    try {
        let messages;
        if (stageId === 'stage1') {
            // 阶段1: Prompt 丰富，只需要用户原始 prompt
            messages = [
                { role: 'system', content: stagePrompt.system },
                { role: 'user', content: stagePrompt.user(prompt) }
            ];
        } else if (stageId === 'stage2') {
            // 阶段2: 代码生成，需要 enrichedData（阶段1的输出）
            messages = [
                { role: 'system', content: stagePrompt.system },
                { role: 'user', content: stagePrompt.user(enrichedData || {}, prompt) }
            ];
        } else if (stageId === 'stage3') {
            // 阶段3: 交互增强，需要现有代码 + enrichedData
            messages = [
                { role: 'system', content: stagePrompt.system },
                { role: 'user', content: stagePrompt.user(existingCode, prompt, enrichedData) }
            ];
        } else {
            // 阶段4: 代码审查，需要现有代码 + enrichedData
            messages = [
                { role: 'system', content: stagePrompt.system },
                { role: 'user', content: stagePrompt.user(existingCode, enrichedData) }
            ];
        }

        const response = await callLLMSimple(stageId, messages, requestId, modelKey);
        const result = extractJSON(response);

        let responseData;
        if (stageId === 'stage1') {
            // 阶段1：PM 只返回需求文档，不处理图片
            responseData = {
                enrichedData: result,
                code: {
                    appName: result.appName || 'LightApp',
                    description: result.description || '',
                    html: '',
                    css: '',
                    js: ''
                }
            };
            console.log(`[${requestId}][${stageId}] ✓ Success! appName=${result.appName}, appType=${result.appType}`);
        } else {
            // 阶段2/3/4 返回代码
            responseData = {
                code: {
                    appName: enrichedData?.appName || existingCode?.appName || 'LightApp',
                    description: enrichedData?.description || existingCode?.description || '',
                    html: result.html || existingCode?.html || '',
                    css: result.css || existingCode?.css || '',
                    js: result.js || existingCode?.js || ''
                }
            };
            console.log(`[${requestId}][${stageId}] ✓ Success!`);
        }

        res.json({ success: true, ...responseData });

    } catch (error) {
        console.error(`[${requestId}][${stageId}] ✗ Error:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Stage 1.5: 图片生成阶段
 * 接收 PM 的输出（enrichedData），生成封面图和游戏失败图
 */
app.post('/api/generate/stage1_5', async (req, res) => {
    const { enrichedData, model } = req.body;
    const requestId = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    console.log(`\n========== [${requestId}] Stage 1.5: 图片生成 ==========`);
    
    if (!enrichedData) {
        return res.status(400).json({ success: false, error: 'Missing enrichedData from Stage 1' });
    }
    
    // 获取模型配置
    const stageConfig = config.stages.stage1_5;
    const textModelKey = model || stageConfig?.modelKey || 'qwen3instruct';
    
    try {
        let coverImagePrompt = null;
        let gameOverImagePrompt = null;
        let roastText = null;
        let coverImageData = null;
        let gameOverImageData = null;
        
        // 步骤1: 用文本模型生成封面图的 prompt
        console.log(`[${requestId}] 🎨 [Step 1] 生成封面图描述 (模型: ${textModelKey})...`);
        try {
            const coverPromptMessages = [
                { role: 'system', content: PROMPTS.imagePrompt.coverImage.system },
                { role: 'user', content: PROMPTS.imagePrompt.coverImage.user(enrichedData) }
            ];
            const coverPromptResponse = await callLLMSimple('stage1_5', coverPromptMessages, requestId + '-coverPrompt', textModelKey);
            const coverPromptResult = extractJSON(coverPromptResponse);
            coverImagePrompt = coverPromptResult.prompt;
            console.log(`[${requestId}] ✅ 封面图描述: ${coverImagePrompt?.substring(0, 80)}...`);
        } catch (e) {
            console.log(`[${requestId}] ⚠️ 封面图描述生成失败: ${e.message}`);
        }
        
        // 步骤2: 如果是游戏，生成游戏失败图的 prompt
        if (enrichedData.appType === 'game') {
            console.log(`[${requestId}] 🎨 [Step 2] 生成游戏失败图描述 (模型: ${textModelKey})...`);
            try {
                const gameOverPromptMessages = [
                    { role: 'system', content: PROMPTS.imagePrompt.gameOverImage.system },
                    { role: 'user', content: PROMPTS.imagePrompt.gameOverImage.user(enrichedData) }
                ];
                const gameOverPromptResponse = await callLLMSimple('stage1_5', gameOverPromptMessages, requestId + '-gameOverPrompt', textModelKey);
                const gameOverPromptResult = extractJSON(gameOverPromptResponse);
                gameOverImagePrompt = gameOverPromptResult.prompt;
                roastText = gameOverPromptResult.roastText;
                console.log(`[${requestId}] ✅ 游戏失败图描述: ${gameOverImagePrompt?.substring(0, 80)}...`);
                console.log(`[${requestId}] ✅ 吐槽语: ${roastText}`);
            } catch (e) {
                console.log(`[${requestId}] ⚠️ 游戏失败图描述生成失败: ${e.message}`);
            }
        }
        
        // 步骤3: 调用图片生成 API 生成封面图
        if (coverImagePrompt) {
            console.log(`[${requestId}] 🖼️ [Step 3] 调用图片API生成封面图...`);
            coverImageData = await generateAndSaveImage(coverImagePrompt, requestId, 'cover');
            if (coverImageData) {
                console.log(`[${requestId}] ✅ 封面图已保存: ${coverImageData.filePath}`);
            }
        }
        
        // 步骤4: 如果有游戏失败图 prompt，生成失败图
        if (gameOverImagePrompt) {
            console.log(`[${requestId}] 🖼️ [Step 4] 调用图片API生成游戏失败图...`);
            gameOverImageData = await generateAndSaveImage(gameOverImagePrompt, requestId, 'gameover');
            if (gameOverImageData) {
                console.log(`[${requestId}] ✅ 游戏失败图ID: ${gameOverImageData.imageId}`);
            }
        }
        
        // 返回更新后的 enrichedData - 使用相对路径，支持跨机器访问
        // 使用相对路径 /api/images/xxx，这样无论在哪台机器都能正确访问
        const coverImagePath = coverImageData?.imageId ? `/api/images/${coverImageData.imageId}` : null;
        const gameOverImagePath = gameOverImageData?.imageId ? `/api/images/${gameOverImageData.imageId}` : null;
        
        const updatedEnrichedData = {
            ...enrichedData,
            coverImagePrompt: coverImagePrompt,
            gameOverImagePrompt: gameOverImagePrompt,
            roastText: roastText,
            // 存储图片ID，方便后续查询
            coverImageId: coverImageData?.imageId || null,
            gameOverImageId: gameOverImageData?.imageId || null,
            // 给 Dev 的是相对路径，跨机器访问时自动指向当前服务器
            coverImagePath: coverImagePath,
            gameOverImagePath: gameOverImagePath
        };
        
        console.log(`[${requestId}][stage1_5] ✓ Success! hasCover=${!!coverImageData}, hasGameOver=${!!gameOverImageData}`);
        if (coverImageData) console.log(`[${requestId}] 封面图路径: ${coverImagePath}`);
        if (gameOverImageData) console.log(`[${requestId}] 失败图路径: ${gameOverImagePath}`);
        
        res.json({
            success: true,
            enrichedData: updatedEnrichedData
        });
        
    } catch (error) {
        console.error(`[${requestId}][stage1_5] ✗ Error:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 完整四阶段生成（一次性返回）
 */
app.post('/api/generate/full', async (req, res) => {
    const { prompt, stages = ['stage1'] } = req.body;

    console.log('\n========== Full Generation ==========');
    console.log('Prompt:', prompt);
    console.log('Stages:', stages);

    if (!prompt) {
        return res.status(400).json({ success: false, error: 'Missing prompt' });
    }

    let currentCode = null;
    const results = [];

    try {
        for (const stageId of stages) {
            const stagePrompt = PROMPTS[stageId];
            if (!stagePrompt) continue;

            console.log(`\n--- Running ${stageId} ---`);

            let messages;
            if (stageId === 'stage1') {
                messages = [
                    { role: 'system', content: stagePrompt.system },
                    { role: 'user', content: stagePrompt.user(prompt) }
                ];
            } else {
                messages = [
                    { role: 'system', content: stagePrompt.system },
                    { role: 'user', content: stagePrompt.user(currentCode, prompt) }
                ];
            }

            const response = await callLLMSimple(stageId, messages);
            const result = extractJSON(response);

            if (stageId === 'stage1') {
                currentCode = {
                    appName: result.appName || 'LightApp',
                    description: result.description || '',
                    html: result.html || '',
                    css: result.css || '',
                    js: result.js || ''
                };
            } else {
                currentCode = {
                    ...currentCode,
                    html: result.html || currentCode.html,
                    css: result.css || currentCode.css,
                    js: result.js || currentCode.js
                };
            }

            results.push({ stage: stageId, success: true });
        }

        console.log('\n========== Generation Complete ==========');
        res.json({ success: true, code: currentCode, results });

    } catch (error) {
        console.error('Generation error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            partialCode: currentCode,
            results 
        });
    }
});

/**
 * 对话式优化接口 (Stage 5)
 */
app.post('/api/generate/refine', async (req, res) => {
    const { instruction, existingCode, enrichedData, originalPrompt, modelKey } = req.body;
    const requestId = 'R' + Math.random().toString(36).substring(2, 7);

    console.log(`\n========== [${requestId}] Stage stage5 (Refine) ==========`);
    console.log(`[${requestId}] Instruction: ${instruction?.substring(0, 100)}...`);
    if (modelKey) console.log(`[${requestId}] Model: ${modelKey}`);

    if (!instruction) {
        return res.status(400).json({ success: false, error: '请输入修改指令' });
    }

    if (!existingCode || (!existingCode.html && !existingCode.css && !existingCode.js)) {
        return res.status(400).json({ success: false, error: '没有可修改的代码' });
    }

    try {
        const stagePrompt = PROMPTS.stage5;
        const messages = [
            { role: 'system', content: stagePrompt.system },
            { role: 'user', content: stagePrompt.user(existingCode, instruction, enrichedData, originalPrompt) }
        ];

        console.log(`[${requestId}][stage5] Calling LLM for refinement...`);
        const response = await callLLMSimple('stage5', messages, requestId, modelKey);
        const result = extractJSON(response);

        console.log(`[${requestId}][stage5] ✓ Refinement successful!`);

        res.json({
            success: true,
            code: {
                html: result.html || existingCode.html,
                css: result.css || existingCode.css,
                js: result.js || existingCode.js
            }
        });

    } catch (error) {
        console.error(`[${requestId}][stage5] ✗ Refine error:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ 分享功能 API ============

// 保存应用 (使用 Cosmos DB)
app.post('/api/apps/save', async (req, res) => {
    try {
        const { code, name, description, enrichedData } = req.body;
        if (!code || (!code.html && !code.css && !code.js)) {
            return res.status(400).json({ success: false, error: '没有可保存的代码' });
        }
        const id = crypto.randomBytes(4).toString('hex');
        const appName = name || enrichedData?.appName || '未命名应用';
        const appData = {
            id,
            name: appName,
            description: description || enrichedData?.description || '',
            code,
            enrichedData,
            createdAt: new Date().toISOString()
        };
        
        // 保存到 Cosmos DB
        await saveAppToCosmos(appData);
        
        // 同时保存本地备份
        fs.writeFileSync(path.join(APPS_DIR, `${id}.json`), JSON.stringify(appData, null, 2));
        
        console.log(`[Save] App saved: ${id} - ${appName}`);
        res.json({ success: true, id, url: `/app/${id}`, name: appName });
    } catch (error) {
        console.error('[Save] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取应用列表 (从 Cosmos DB)
app.get('/api/apps', async (req, res) => {
    try {
        const apps = await listAppsFromCosmos();
        res.json({ success: true, apps });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取精选应用列表（商店页面）- 从 Cosmos DB appstore container 获取
app.get('/api/apps/featured', async (req, res) => {
    try {
        // 直接从 appstore container 获取所有商店应用
        const storeApps = await listStoreAppsFromCosmos();
        
        // 获取分类配置
        const featuredConfigPath = path.join(__dirname, 'featured-apps.json');
        let categories = [];
        if (fs.existsSync(featuredConfigPath)) {
            const featuredConfig = JSON.parse(fs.readFileSync(featuredConfigPath, 'utf-8'));
            categories = featuredConfig.categories || [];
        }
        
        res.json({ 
            success: true, 
            featured: storeApps,
            categories: categories
        });
    } catch (error) {
        console.error('[Store] List error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 添加应用到精选（管理员操作）- 保存到 Cosmos DB appstore container
app.post('/api/apps/featured', async (req, res) => {
    try {
        const { id, category, tags, order } = req.body;
        
        // 从 onlinecollection 获取应用数据
        const appData = await getAppFromCosmos(id);
        if (!appData) {
            return res.status(404).json({ success: false, error: '应用不存在' });
        }
        
        // 构建商店应用数据
        const storeApp = {
            id: appData.id,
            name: appData.name,
            description: appData.description || appData.enrichedData?.appDescription || '',
            code: appData.code,
            enrichedData: appData.enrichedData,
            category: category || 'tools',
            tags: tags || [],
            order: order || 999,
            createdAt: appData.createdAt,
            addedToStoreAt: new Date().toISOString()
        };
        
        // 保存到 appstore container
        await saveStoreAppToCosmos(storeApp);
        
        console.log(`[Store] App added: ${appData.id} - ${appData.name}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[Store] Add error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 从精选移除 - 从 Cosmos DB appstore container 删除
app.delete('/api/apps/featured/:id', async (req, res) => {
    try {
        await deleteStoreAppFromCosmos(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('[Store] Delete error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取应用数据 (从 Cosmos DB，本地备份作为 fallback)
app.get('/api/apps/:id', async (req, res) => {
    try {
        // 先尝试从 Cosmos DB 获取
        let data = await getAppFromCosmos(req.params.id);
        
        // 如果 Cosmos DB 没有，尝试本地文件
        if (!data) {
            const filePath = path.join(APPS_DIR, `${req.params.id}.json`);
            if (fs.existsSync(filePath)) {
                data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                // 同步到 Cosmos DB
                await saveAppToCosmos(data).catch(e => console.log('[Cosmos] Sync failed:', e.message));
            }
        }
        
        if (!data) {
            return res.status(404).json({ success: false, error: '应用不存在' });
        }
        res.json({ success: true, app: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 删除应用 (同时删除 Cosmos DB 和本地)
app.delete('/api/apps/:id', async (req, res) => {
    try {
        // 删除 Cosmos DB
        await deleteAppFromCosmos(req.params.id);
        
        // 删除本地文件
        const filePath = path.join(APPS_DIR, `${req.params.id}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PWA Manifest 动态生成 (从 Cosmos DB)
app.get('/app/:id/manifest.json', async (req, res) => {
    try {
        let data = await getAppFromCosmos(req.params.id);
        if (!data) {
            // fallback 到本地文件
            const filePath = path.join(APPS_DIR, `${req.params.id}.json`);
            if (fs.existsSync(filePath)) {
                data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        }
        if (!data) {
            return res.status(404).json({ error: 'Not found' });
        }
        const manifest = {
            name: data.name || 'LightApp',
            short_name: (data.name || 'App').substring(0, 12),
            description: data.description || '由 LightApp 生成的应用',
            start_url: `/app/${req.params.id}`,
            display: 'standalone',
            background_color: '#0f0f17',
            theme_color: '#6366f1',
            orientation: 'any',
            icons: [
                {
                    src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100" rx="20"/><text x="50" y="68" text-anchor="middle" font-size="50" fill="white">⚡</text></svg>',
                    sizes: '192x192',
                    type: 'image/svg+xml',
                    purpose: 'any maskable'
                }
            ]
        };
        res.setHeader('Content-Type', 'application/manifest+json');
        res.json(manifest);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 直接访问应用页面 (PWA 支持, 从 Cosmos DB)
app.get('/app/:id', async (req, res) => {
    try {
        let data = await getAppFromCosmos(req.params.id);
        if (!data) {
            // fallback 到本地文件
            const filePath = path.join(APPS_DIR, `${req.params.id}.json`);
            if (fs.existsSync(filePath)) {
                data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        }
        if (!data) {
            return res.status(404).send('<h1>404 - 应用不存在</h1><p><a href="/">返回首页</a></p>');
        }
        const { html, css, js } = data.code;
        const appId = req.params.id;
        const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${data.name}</title>
    
    <!-- PWA Meta Tags -->
    <meta name="application-name" content="${data.name}">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="${data.name}">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#6366f1">
    <meta name="description" content="${data.description || '由 LightApp 生成的应用'}">
    
    <!-- PWA Manifest -->
    <link rel="manifest" href="/app/${appId}/manifest.json">
    
    <!-- iOS Icon (inline SVG as data URI) -->
    <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='%236366f1' width='100' height='100' rx='20'/><text x='50' y='68' text-anchor='middle' font-size='50' fill='white'>⚡</text></svg>">
    
    <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            width: 100%; 
            height: 100%; 
            overflow: auto;
            -webkit-overflow-scrolling: touch;
        }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }
        /* 安装按钮样式 */
        #pwa-install-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            border: none;
            border-radius: 25px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            display: none;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
            z-index: 9999;
            transition: all 0.3s ease;
        }
        #pwa-install-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
        }
        #pwa-install-btn.show { display: flex; }
        #pwa-install-btn svg { width: 18px; height: 18px; }
        ${css || ''}
    </style>
</head>
<body>
    ${html || ''}
    
    <!-- 安装到桌面按钮 -->
    <button id="pwa-install-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        安装到桌面
    </button>
    
    <script>${js || ''}<\/script>
    
    <!-- PWA 安装逻辑 -->
    <script>
    (function() {
        let deferredPrompt = null;
        const installBtn = document.getElementById('pwa-install-btn');
        
        // 监听 beforeinstallprompt 事件
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.classList.add('show');
            console.log('[PWA] 可以安装到桌面');
        });
        
        // 点击安装按钮
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                // 如果没有 deferredPrompt，提示用户手动安装
                alert('请使用浏览器菜单中的"添加到主屏幕"或"安装应用"选项');
                return;
            }
            
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log('[PWA] 用户选择:', outcome);
            
            if (outcome === 'accepted') {
                installBtn.classList.remove('show');
            }
            deferredPrompt = null;
        });
        
        // 检测是否已安装
        window.addEventListener('appinstalled', () => {
            installBtn.classList.remove('show');
            console.log('[PWA] 应用已安装');
        });
        
        // 检测是否在 standalone 模式（已安装）
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            console.log('[PWA] 已在独立模式运行');
        }
    })();
    <\/script>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(page);
    } catch (error) {
        res.status(500).send('<h1>500 - 服务器错误</h1>');
    }
});

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    console.log(`
╔════════════════════════════════════════════════╗
║         🚀 LightApp Server Started             ║
╠════════════════════════════════════════════════╣
║  URL:  http://localhost:${PORT}                  ║
║  Storage: Azure Cosmos DB                      ║
║                                                ║
║  Endpoints:                                    ║
║  - GET  /api/health                            ║
║  - POST /api/generate/stage                    ║
║  - POST /api/generate/full                     ║
╚════════════════════════════════════════════════╝
    `);
    
    // 启动时同步本地应用到 Cosmos DB
    await syncLocalAppsToCosmos();
    // 同步商店应用到 appstore container
    await syncLocalStoreAppsToCosmos();
    // 确保 images container 存在
    await ensureImagesContainer();
});
