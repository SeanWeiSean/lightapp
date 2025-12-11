// 测试图片生成API
const https = require('https');

const url = 'https://fabricrouter-external.ingress-dlis.ingress.kors.microsoft-falcon.net/dlis-webxtchinatestaccount.t2imf/v1/images/generations';

const requestBody = {
    model: "SyndicationAPI-TextToImage-ModelB-1",
    prompt: "天苍苍，野茫茫",
    negative_prompt: " ",
    size: "1024x1024",
    true_cfg_scale: 1.0,
    num_inference_steps: 8,
    seed: 42
};

const postData = JSON.stringify(requestBody);

const urlObj = new URL(url);
const options = {
    hostname: urlObj.hostname,
    port: 443,
    path: urlObj.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('🎨 发送图片生成请求...');
console.log('Prompt:', requestBody.prompt);
console.log('');

const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('状态码:', res.statusCode);
        console.log('');
        
        try {
            const result = JSON.parse(data);
            console.log('响应结构:', JSON.stringify(Object.keys(result), null, 2));
            
            if (result.data && result.data[0]) {
                const imageData = result.data[0];
                console.log('图片数据字段:', Object.keys(imageData));
                
                if (imageData.b64_json) {
                    const base64 = imageData.b64_json;
                    console.log('✅ 成功获取Base64图片');
                    console.log('Base64长度:', base64.length);
                    console.log('Base64前100字符:', base64.substring(0, 100) + '...');
                    
                    // 保存为文件
                    const fs = require('fs');
                    const buffer = Buffer.from(base64, 'base64');
                    fs.writeFileSync('test-output.png', buffer);
                    console.log('');
                    console.log('📁 图片已保存到 test-output.png');
                } else if (imageData.url) {
                    console.log('✅ 获取到图片URL:', imageData.url);
                } else {
                    console.log('图片数据:', JSON.stringify(imageData, null, 2).substring(0, 500));
                }
            } else {
                console.log('完整响应:', JSON.stringify(result, null, 2).substring(0, 1000));
            }
        } catch (e) {
            console.log('解析响应失败:', e.message);
            console.log('原始响应:', data.substring(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error('请求错误:', e.message);
});

req.write(postData);
req.end();
