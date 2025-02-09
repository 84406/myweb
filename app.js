// 存储对话历史
let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];

// 存储总结历史
let summaries = JSON.parse(localStorage.getItem('summaries')) || [];

// 初始化时加载历史记录
window.onload = () => {
    const chatBox = document.getElementById('chatBox');
    chatHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = `mb-4 p-3 rounded-lg max-w-[80%] ${msg.role === 'user' ? 'ml-auto bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`;
        div.innerHTML = msg.content;
        chatBox.appendChild(div);
        addEditFeature(div); // 重新绑定编辑功能
    });

    // 在chatHistory初始化后添加系统提示
    if (chatHistory.length === 0) {
        const latestSummary = summaries.length > 0 ? `\n根据上次咨询总结：${summaries[summaries.length-1].content}` : '';
        chatHistory.push({
            role: "system",
            content: `你是一位专业心理咨询师，遵循以下原则：
1. 用温暖包容的态度回应
2. 优先共情理解
3. 引导用户自我探索
4. 每次回应控制在3-5句话
5. 使用自然的口语化中文
6. 结合之前的咨询总结：${latestSummary}`
        });
    }

    // 自动加载最新总结
    if (summaries.length > 0) {
        const latestSummary = summaries[summaries.length - 1];
        document.getElementById('summary').innerHTML = latestSummary.content;
    }
};

const API_BASE = 'https://api.siliconflow.cn/v1';

async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const sendButton = document.querySelector('button');
    const message = userInput.value.trim();
    if (!message) return;

    // 禁用按钮防止重复发送
    sendButton.disabled = true;
    
    // 添加加载状态
    const loadingDiv = addMessage('<div class="dot-flashing"></div>', 'assistant');
    
    try {
        // 添加用户消息到界面和历史记录
        addMessage(message, 'user');
        chatHistory.push({ role: 'user', content: message });
        
        // 调用DeepSeek API
        const response = await fetch(`${API_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk-oxudyxhekdjepfhvbfwzsozhazoiyxqwqdjlsbsxsfujwiug'
            },
            body: JSON.stringify({
                model: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
                messages: chatHistory,
                temperature: 0.7
            })
        });

        // 新增响应状态检查
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API错误 (${response.status}): ${errorData.error?.message || '未知错误'}`);
        }
        
        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        
        // 移除加载状态
        chatBox.removeChild(loadingDiv);
        
        // 格式化AI回复（保留换行）
        const formattedResponse = aiResponse.replace(/\n/g, '<br>');
        addMessage(formattedResponse, 'assistant');
        
        // 保存到本地存储
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        
    } catch (error) {
        console.error('API调用失败详情:', {
            error: error.message,
            request: {
                messages: chatHistory,
                timestamp: new Date().toISOString()
            }
        });
        
        // 细化错误提示
        let errorMessage = '暂时无法处理请求';
        if (error.message.includes('401')) {
            errorMessage = '身份验证失败，请检查API密钥';
        } else if (error.message.includes('429')) {
            errorMessage = '请求过于频繁，请稍后再试';
        } else if (error.message.includes('timeout')) {
            errorMessage = '响应超时，请简化问题后重试';
        }
        
        addMessage(`系统提示：${errorMessage}`, 'system');
        
        // 本地备用回复
        const localResponses = [
            "我注意到您可能遇到了困扰，建议先深呼吸放松一下。",
            "这个问题值得深入探讨，我们可以分步骤慢慢分析。",
            "请告诉我更多细节，这样我可以更好地理解您的情况。"
        ];
        const localReply = localResponses[Math.floor(Math.random() * localResponses.length)];
        addMessage(localReply, 'assistant');
        chatHistory.push({ role: 'assistant', content: localReply });
    } finally {
        sendButton.disabled = false;
        userInput.value = '';
    }
}

// 将超时时间从10秒延长到20秒
const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('请求超时')), 30000)
);

// 添加重试机制
let retryCount = 0;
const maxRetries = 2;

let abortController = new AbortController();

// 生成总结
async function generateSummary() {
    abortController = new AbortController();
    const summaryDiv = document.getElementById('summary');
    const generateBtn = document.getElementById('generateSummaryBtn');
    
    try {
        // 新增网络检测
        if (!navigator.onLine) {
            summaryDiv.innerHTML = '<div class="text-red-500">网络未连接，请检查网络设置</div>';
            return;
        }

        // 保存原始按钮文字
        const originalText = generateBtn.innerText;
        // 显示加载状态
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="animate-pulse">生成中...</span>';
        summaryDiv.innerHTML = '<div class="text-gray-400">正在分析对话内容...</div>';

        const response = await Promise.race([
            fetch(`${API_BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer sk-oxudyxhekdjepfhvbfwzsozhazoiyxqwqdjlsbsxsfujwiug'
                },
                body: JSON.stringify({
                    model: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
                    messages: [{
                        role: "system",
                        content: "用中文总结对话，要求：1.列出3-5个关键点 2.每个点用•开头 3.总字数不超过150字 4.使用简洁的口语化表达"
                    }, ...chatHistory],
                    temperature: 0.5
                }),
                signal: abortController.signal
            }),
            timeoutPromise
        ]);

        // 新增HTTP状态码检查
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API错误: ${errorData.error?.message || response.status}`);
        }
        const data = await response.json();
        const summaryContent = data.choices[0].message.content;
        
        // 存储总结
        summaries.push({
            date: new Date().toLocaleString(),
            content: summaryContent,
            chatHistory: chatHistory // 保存关联的对话历史
        });
        localStorage.setItem('summaries', JSON.stringify(summaries));
        
        // 显示带格式的总结
        summaryDiv.innerHTML = summaryContent.replace(/\n/g, '<br>');
        
        document.getElementById('summary').contentEditable = true;
        document.getElementById('summary').style.minHeight = '100px';
        document.getElementById('summary').addEventListener('blur', () => {
            // 可以在此添加自动保存逻辑（如果需要）
        });
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('请求已取消');
        }
        if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(generateSummary, 2000); // 2秒后重试
        }
        console.error('生成总结失败:', {
            error: error.message,
            status: error.response?.status
        });

        // 细化错误提示
        if (error.message.includes('401')) {
            summaryDiv.innerHTML = '<div class="text-red-500">身份验证失败，请检查API密钥</div>';
        } else if (error.message.includes('429')) {
            summaryDiv.innerHTML = '<div class="text-red-500">请求过于频繁，请稍后再试</div>';
        } else if (error.message.includes('超时')) {
            summaryDiv.innerHTML = '<div class="text-red-500">请求超时，建议：<br>1. 检查网络连接<br>2. 稍后重试</div>';
        } else {
            summaryDiv.innerHTML = `<div class="text-red-500">服务异常：${error.message}</div>`;
        }
    } finally {
        // 恢复按钮状态
        generateBtn.disabled = false;
        generateBtn.textContent = '生成总结';
    }
}

// 添加取消按钮
function cancelRequest() {
    abortController.abort();
}

// 添加消息到聊天窗口
function addMessage(content, role) {
    const chatBox = document.getElementById('chatBox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `mb-4 p-3 rounded-lg max-w-[80%] ${
        role === 'user' 
            ? 'ml-auto bg-blue-100 text-blue-800' 
            : 'bg-gray-100 text-gray-800'
    }`;
    
    // 允许HTML换行显示
    messageDiv.innerHTML = content; // 改为innerHTML以支持<br>标签
    
    // 添加双击编辑功能
    messageDiv.ondblclick = function() {
        const originalContent = this.textContent;
        const textarea = document.createElement('textarea');
        textarea.className = 'w-full p-2 border rounded';
        textarea.value = originalContent;
        
        this.replaceWith(textarea);
        textarea.focus();
        
        textarea.onblur = function() {
            const newContent = this.value.trim();
            const newElement = document.createElement('div');
            newElement.className = messageDiv.className;
            newElement.textContent = newContent || originalContent;
            
            // 更新历史记录
            const index = Array.from(chatBox.children).indexOf(textarea) - 1; // 排除欢迎信息
            if (index >= 0) {
                chatHistory[index].content = newContent;
                localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            }
            
            textarea.replaceWith(newElement);
            newElement.ondblclick = messageDiv.ondblclick; // 重新绑定事件
        }
    };
    
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageDiv;
}

// 清除记录（可选功能）
function clearHistory() {
    if (!confirm('确定要清除所有对话记录吗？此操作不可恢复！')) return;
    
    localStorage.removeItem('chatHistory');
    chatHistory = [];
    document.getElementById('chatBox').innerHTML = '<div class="text-gray-500">欢迎，我是您的心理咨询助手，请问有什么可以帮您？</div>';
    document.getElementById('summary').innerHTML = '总结将在此处显示...';
    alert('已清除所有对话记录');
}

async function testAPI() {
    try {
        const response = await fetch(`${API_BASE}/models`, {
            headers: {
                'Authorization': 'Bearer sk-oxudyxhekdjepfhvbfwzsozhazoiyxqwqdjlsbsxsfujwiug'
            }
        });
        alert(`API连通正常，状态码：${response.status}`);
    } catch (error) {
        alert(`API连接失败：${error.message}`);
    }
}

// 本地简易总结
function localSummary() {
    const userMessages = chatHistory.filter(m => m.role === 'user').map(m => m.content);
    const aiMessages = chatHistory.filter(m => m.role === 'assistant').map(m => m.content);
    
    const summary = `
        <div class="text-gray-600">
            <h3 class="font-semibold">用户主要问题 (${userMessages.length}个):</h3>
            <ul class="list-disc pl-5">${userMessages.map(m => `<li>${m}</li>`).join('')}</ul>
            <h3 class="font-semibold mt-2">咨询建议 (${aiMessages.length}条):</h3>
            <ul class="list-disc pl-5">${aiMessages.map(m => `<li>${m}</li>`).join('')}</ul>
        </div>
    `;
    document.getElementById('summary').innerHTML = summary.replace(/\n/g, '');
}

function localResponse(message) {
    const defaultResponses = [
        "我理解您现在可能有困扰，建议先深呼吸放松一下。",
        "这个问题值得深入探讨，我们可以慢慢分析。",
        "请告诉我更多细节，这样我可以更好地理解您的情况。"
    ];
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// 修改sendMessage中的catch块
addMessage(localResponse(), 'assistant');

// 添加总结历史查看功能
function showSummaryHistory() {
    const historyDiv = document.createElement('div');
    historyDiv.className = 'fixed right-4 bottom-20 bg-white p-4 rounded-lg shadow-lg max-h-96 overflow-y-auto';
    historyDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <h3 class="font-bold mb-2">历史总结 (${summaries.length})</h3>
            <button onclick="this.parentElement.parentElement.remove()" class="text-gray-500 hover:text-gray-700">×</button>
        </div>
        ${summaries.map((s, i) => `
            <div class="mb-2 p-2 border-b">
                <p class="text-sm text-gray-500">${s.date}</p>
                <div class="summary-content">${s.content}</div>
                <button onclick="loadSummary(${i})" class="text-blue-500 text-sm">加载</button>
                <button onclick="editSummary(${i})" class="text-green-500 text-sm ml-2">编辑</button>
            </div>
        `).join('')}
    `;
    // 点击外部关闭
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-40';
    backdrop.onclick = () => {
        historyDiv.remove();
        backdrop.remove();
    };
    document.body.appendChild(backdrop);
    document.body.appendChild(historyDiv);
}

function loadSummary(index) {
    if (index >= 0 && index < summaries.length) {
        chatHistory = summaries[index].chatHistory;
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        location.reload(); // 重新加载页面应用历史
    }
}

// 添加选择删除功能
function showDeletePanel() {
    const panel = document.createElement('div');
    panel.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center';
    panel.innerHTML = `
        <div class="bg-white p-4 rounded-lg w-96">
            <h3 class="text-lg font-bold mb-4">选择要删除的内容</h3>
            <div class="space-y-2">
                <label class="flex items-center">
                    <input type="checkbox" id="deleteMessages" class="mr-2" checked>
                    删除所有对话记录
                </label>
                <label class="flex items-center">
                    <input type="checkbox" id="deleteSummaries" class="mr-2">
                    删除所有总结记录
                </label>
            </div>
            <div class="mt-4 flex justify-end gap-2">
                <button onclick="this.parentElement.parentElement.remove()" class="px-4 py-2 border rounded">
                    取消
                </button>
                <button onclick="confirmDelete()" class="bg-red-500 text-white px-4 py-2 rounded">
                    确认删除
                </button>
            </div>
        </div>
    `;
    // 点击外部关闭
    panel.onclick = (e) => {
        if (e.target === panel) {
            panel.remove();
        }
    };
    document.body.appendChild(panel);
}

function confirmDelete() {
    const deleteMessages = document.getElementById('deleteMessages').checked;
    const deleteSummaries = document.getElementById('deleteSummaries').checked;
    
    if (deleteMessages) {
        localStorage.removeItem('chatHistory');
        chatHistory = [];
    }
    if (deleteSummaries) {
        localStorage.removeItem('summaries');
        summaries = [];
    }
    
    location.reload();
} 