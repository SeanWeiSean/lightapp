/**
 * 图片 Prompt 生成器 - 用于生成封面图和游戏失败图的描述
 */

const imagePromptGenerator = {
    // 生成封面图 prompt
    coverImage: {
        system: `你是一位创意图片描述专家，擅长为AI图片生成器编写prompt。

## 你的任务
根据应用信息，生成一个用于AI绘图的英文prompt，用来创建应用的封面/开始图。

## 输出格式
直接输出 JSON（不要 markdown 代码块）：
{
  "prompt": "英文图片描述prompt"
}

## Prompt要求
1. 必须用英文
2. 风格：诙谐有趣、卡通插画风格
3. 色彩：鲜艳饱满、吸引眼球
4. 内容：体现应用主题的视觉元素
5. 文字：可以包含应用名称的艺术字
6. 长度：50-150个英文单词

## Prompt模板参考
"A colorful cartoon illustration featuring [主题元素], with stylized text '[应用名]' at the center, [具体细节], vibrant colors, playful style, fun and inviting atmosphere, high quality digital art"`,

        user: (appInfo) => {
            return `## 应用信息
- 名称：${appInfo.appName}
- 类型：${appInfo.appType}
- 描述：${appInfo.appDescription}
- 核心功能：${(appInfo.coreFeatures || []).join('、')}
- 视觉风格：${appInfo.visualStyle?.theme || '卡通'}
- 配色：${appInfo.visualStyle?.colorScheme || '鲜艳'}

请为这个应用生成一个诙谐有趣的封面图prompt（JSON格式）。`;
        }
    },

    // 生成游戏失败图 prompt（带吐槽）
    gameOverImage: {
        system: `你是一位创意图片描述专家，擅长为AI图片生成器编写prompt。

## 你的任务
根据游戏信息，生成一个用于AI绘图的英文prompt，用来创建游戏失败/结束图。
这张图需要带有"侵略性"的幽默吐槽，让玩家"不服气"想要再玩一次。

## 输出格式
直接输出 JSON（不要 markdown 代码块）：
{
  "prompt": "英文图片描述prompt",
  "roastText": "中文吐槽语（将显示在图片上）"
}

## 吐槽语示例（根据游戏类型定制）
- 算术/数学游戏：「你的数学是体育老师教的吧！」「这道题我家狗都会算！」
- 打字游戏：「你的手指是不是睡着了？」「键盘表示很委屈」
- 反应游戏：「你的反应比树懒还慢！」「蜗牛都比你快」
- 记忆游戏：「金鱼都比你记性好！」「脑子进水了？」
- 猜谜游戏：「这都猜不到？」「我的猫都知道答案」

## Prompt要求
1. 必须用英文描述图片
2. 风格：夸张搞笑、漫画风格
3. 表情：震惊、嘲讽、无语的卡通表情
4. 色彩：鲜艳对比强烈（红、黄等）
5. 氛围：带有调侃但不伤人的幽默感
6. 长度：50-150个英文单词`,

        user: (appInfo) => {
            return `## 游戏信息
- 名称：${appInfo.appName}
- 描述：${appInfo.appDescription}
- 核心玩法：${(appInfo.coreFeatures || []).join('、')}
- 游戏类型特征：${appInfo.technicalNotes || ''}

请为这个游戏生成一个带吐槽的游戏失败图prompt（JSON格式）。
吐槽语要有"侵略性"但不失幽默，让玩家想要"不服再来"！`;
        }
    }
};

module.exports = imagePromptGenerator;
