/**
 * Stage 2: Dev (开发者) - 逻辑实现、代码编写
 */

const stage2 = {
    system: `你是一位资深前端开发工程师（Dev），专注于代码质量和功能实现。

## 你的职责
1. 根据PM的需求文档实现功能
2. 编写清晰、可维护的代码
3. 确保所有核心功能正常运行
4. 处理基本的边界情况
5. 代码有适当的注释

## 输出格式
直接输出 JSON（不要 markdown 代码块）：
{
  "html": "完整的HTML代码",
  "css": "完整的CSS代码",
  "js": "完整的JavaScript代码"
}

## 技术规范
- 语义化 HTML 标签
- CSS 变量管理主题色
- Flexbox/Grid 布局
- 响应式设计（移动优先）
- 触摸友好（最小点击区域 44px）
- ES6+ 语法
- DOM 操作前检查元素存在
- 适当的错误处理

## 重要提醒
1. 专注于功能实现，不要过度设计样式
2. 确保核心功能100%可用
3. 代码要能直接运行，不依赖外部库
4. 样式保持简洁，后续Designer会优化`,

    user: (enrichedData, prompt) => {
        const appName = enrichedData?.appName || '应用';
        const appType = enrichedData?.appType || 'interactive';
        const appDescription = enrichedData?.appDescription || '';
        const coreFeatures = enrichedData?.coreFeatures || [];
        const userFlow = enrichedData?.userFlow || '';
        const uiLayout = enrichedData?.uiLayout || {};
        const interactionDesign = enrichedData?.interactionDesign || {};
        const technicalNotes = enrichedData?.technicalNotes || '';
        
        // 图片信息 - 使用文件路径
        const coverImagePath = enrichedData?.coverImagePath || null;
        const gameOverImagePath = enrichedData?.gameOverImagePath || null;
        const roastText = enrichedData?.roastText || '你还需要多加练习！';
        const isGame = appType === 'game';

        let imageInstructions = '';
        
        if (coverImagePath) {
            imageInstructions += `
### 封面图/开始界面（重要！图片设计师已提供）
图片设计师已生成封面图，文件路径：${coverImagePath}

你必须创建一个**开始界面**：
- HTML：创建一个 id="start-screen" 的全屏遮罩层
- CSS：直接使用图片URL设置背景：\`background-image: url('${coverImagePath}');\`
- JS：点击"开始${isGame ? '游戏' : ''}"按钮后隐藏开始界面

示例代码：
\`\`\`html
<div id="start-screen">
  <button id="start-btn">开始${isGame ? '游戏' : ''}</button>
</div>
\`\`\`

\`\`\`css
#start-screen {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #1a1a2e;
  background-image: url('${coverImagePath}');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding-bottom: 60px;
  z-index: 1000;
}
#start-screen.hidden { display: none; }
#start-btn {
  padding: 20px 60px;
  font-size: 24px;
  background: rgba(255,255,255,0.95);
  border: none;
  border-radius: 50px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  transition: transform 0.2s;
}
#start-btn:hover { transform: scale(1.05); }
\`\`\`
`;
        }

        if (isGame && gameOverImagePath) {
            imageInstructions += `
### 游戏失败界面（重要！图片设计师已提供）
图片设计师已生成游戏失败图，文件路径：${gameOverImagePath}
吐槽语：「${roastText}」

你必须创建一个**游戏结束界面**：
- HTML：创建一个 id="gameover-screen" 的全屏遮罩层，初始隐藏
- CSS：直接使用图片URL设置背景：\`background-image: url('${gameOverImagePath}');\`
- 在界面上显示吐槽语：「${roastText}」
- 显示本次得分
- 必须有一个"不服再来"按钮（不是"重新开始"，要有挑衅感！）
- 点击按钮后重置游戏，显示开始界面

示例代码：
\`\`\`html
<div id="gameover-screen">
  <div class="gameover-content">
    <div class="roast-text">${roastText}</div>
    <div id="final-score">得分: 0</div>
    <button id="retry-btn">不服再来！</button>
  </div>
</div>
\`\`\`

\`\`\`css
#gameover-screen {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #1a1a2e;
  background-image: url('${gameOverImagePath}');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  display: none;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
#gameover-screen.show { display: flex; }
.gameover-content {
  background: rgba(0,0,0,0.7);
  padding: 40px;
  border-radius: 20px;
  text-align: center;
}
.roast-text {
  font-size: 28px;
  color: #ff6b6b;
  font-weight: bold;
  margin-bottom: 20px;
}
#final-score {
  font-size: 36px;
  color: white;
  margin-bottom: 30px;
}
#retry-btn {
  padding: 20px 60px;
  font-size: 24px;
  background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
  color: white;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
#retry-btn:hover { transform: scale(1.05); }
\`\`\`
`;
        }

        return `## PM 需求文档

### 应用信息
- 名称：${appName}
- 类型：${appType}
- 描述：${appDescription}
- 原始需求：${prompt}

### 核心功能
${coreFeatures.map((f, i) => (i + 1) + '. ' + f).join('\n') || '根据需求实现'}

### 用户流程
${userFlow || '根据需求设计'}

### UI 布局
- 类型：${uiLayout.type || '单页'}
- 组件：${(uiLayout.mainComponents || []).join('、') || '根据需求'}
- 布局：${uiLayout.layout || '自由布局'}

### 交互设计
- 主要操作：${interactionDesign.primaryAction || '点击'}
- 反馈类型：${interactionDesign.feedbackType || '视觉反馈'}
- 手势支持：${(interactionDesign.gestures || []).join('、') || '点击'}

### 技术建议
${technicalNotes || '无特殊要求'}
${imageInstructions}
## 你的任务
作为开发工程师，请：
1. ${coverImagePath ? '创建开始界面（使用提供的封面图路径）' : ''}
2. 实现所有核心功能
3. ${(isGame && gameOverImagePath) ? '创建游戏结束界面（使用提供的失败图路径 + 吐槽语 + "不服再来"按钮）' : ''}
4. 确保代码可以直接运行
5. 处理基本的边界情况
6. 添加必要的注释

请输出完整的可运行代码（JSON格式）。`;
    }
};

module.exports = stage2;
