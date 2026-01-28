## 调用API：
```powershell
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
        "model": "deepseek-chat",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant."},
          {"role": "user", "content": "Hello!"}
        ],
        "stream": false
      }'
```

## 模型使用：
| 分类 | 项目 | deepseek-chat | deepseek-reasoner |
|---|---|---|---|
| **基本信息** | BASE URL | https://api.deepseek.com | https://api.deepseek.com |
|  | 模型版本 | DeepSeek‑V3.2（非思考模式） | DeepSeek‑V3.2（思考模式） |
|  | 上下文长度 | 未明确 | 128K |
|  | 输出长度（默认 / 最大） | 4K / 8K | 32K / 64K |
| **功能支持** | JSON Output | 支持 | 支持 |
|  | Tool Calls | 支持 | 支持 |
|  | 对话前缀续写（Beta） | 支持 | 支持 |
|  | FIM 补全（Beta） | 支持 | 不支持 |
| **价格** | 百万 tokens 输入（缓存命中） | 0.2 元 | 0.2 元 |
|  | 百万 tokens 输入（缓存未命中） | 2 元 | 2 元 |
|  | 百万 tokens 输出 | 3 元 | 3 元 |

## Temperature 设置
temperature 参数默认为 1.0。

我们建议您根据如下表格，按使用场景设置 temperature。

| 场景	| 温度 |
|---|---|
| 代码生成/数学解题	| 0.0 |
| 数据抽取/分析	| 1.0 |
| 通用对话	| 1.3 |
| 翻译	| 1.3 |
| 创意类写作/诗歌创作	| 1.5 |

## JSON输出
DeepSeek 提供了 JSON Output 功能，来确保模型输出合法的 JSON 字符串。
注意事项
1. 设置 response_format 参数为 {'type': 'json_object'}。
2. 用户传入的 system 或 user prompt 中必须含有 json 字样，并给出希望模型输出的 JSON 格式的样例，以指导模型来输出合法 JSON。
3. 需要合理设置 max_tokens 参数，防止 JSON 字符串被中途截断。
4. 在使用 JSON Output 功能时，API 有概率会返回空的 content。我们正在积极优化该问题，您可以尝试修改 prompt 以缓解此类问题。
示例代码
```python
import json
from openai import OpenAI

client = OpenAI(
    api_key="<your api key>",
    base_url="https://api.deepseek.com",
)

system_prompt = """
The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format. 

EXAMPLE INPUT: 
Which is the highest mountain in the world? Mount Everest.

EXAMPLE JSON OUTPUT:
{
    "question": "Which is the highest mountain in the world?",
    "answer": "Mount Everest"
}
"""

user_prompt = "Which is the longest river in the world? The Nile River."

messages = [{"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}]

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages,
    response_format={
        'type': 'json_object'
    }
)

print(json.loads(response.choices[0].message.content))
```

模型输出：
```json
{
    "question": "Which is the longest river in the world?",
    "answer": "The Nile River"
}
```
