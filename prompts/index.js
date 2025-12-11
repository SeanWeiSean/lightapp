/**
 * LightApp 多阶段 AI 流水线 Prompt 配置
 * 
 * 角色分工：
 * - Stage 1: PM (产品经理) - 需求分析、功能规划
 * - Stage 2: Dev (开发者) - 逻辑实现、代码编写
 * - Stage 3: Tester (测试员) - 漏洞查找、边界测试
 * - Stage 4: Designer (设计师) - 画面优化、视觉增强
 * - Stage 5: 对话式优化（用户迭代）
 * - ImagePrompt: 图片描述生成器
 */

const stage1 = require('./stage1-pm');
const stage2 = require('./stage2-dev');
const stage3 = require('./stage3-tester');
const stage4 = require('./stage4-designer');
const stage5 = require('./stage5-refine');
const imagePrompt = require('./image-prompt');

const PROMPTS = {
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
    imagePrompt
};

module.exports = PROMPTS;
