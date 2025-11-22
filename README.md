# ityxb
传智教育满分脚本-多AI增强版 2025.11.22

支持言溪题库，把token复制进去即可答题

题库地址：[https://tk.enncy.cn/](https://tk.enncy.cn/)

# 需要搭配油猴使用，脚本已经同步上传[greasyfork.org](https://greasyfork.org/zh-CN/scripts/555204-%E4%BC%A0%E6%99%BA%E6%95%99%E8%82%B2%E6%BB%A1%E5%88%86%E8%84%9A%E6%9C%AC-%E5%A4%9Aai%E5%A2%9E%E5%BC%BA%E7%89%88-2025-11-22)

AI答题正确配置方法
打开配置面板，填入：
```
API Key: sk-OgpTIaWVlpVB66ib290c867cA4784871B6C6274462C451B0

API地址: https://burn.hair/v1/chat/completions
(注意：必须包含完整路径 /v1/chat/completions)

模型名称: gpt-4o-mini
(或者 gpt-3.5-turbo，看你的中转支持哪个)
```

推荐使用 [https://api.chatanywhere.com.cn]( https://api.chatanywhere.com.cn)的API中转

**主要新增功能**

1.模型支持

OpenAI (GPT): GPT-4o, GPT-4o-mini, GPT-4-turbo等

Claude (Anthropic): Claude 3.5 Sonnet, Claude 3 Opus等

Google Gemini: Gemini 2.0 Flash, Gemini 1.5 Pro等

DeepSeek: 国产模型，性价比高

自定义API: 兼容OpenAI格式的任意API

2.库配置UI优化​

右上角关闭图标: 配置弹窗和题库项都添加了右上角✕关闭按钮

悬停动画效果: 关闭按钮hover时有旋转和放大效果

更好的视觉反馈: 圆形按钮设计，红色渐变背景

3.统一的AI接口适配

自动适配不同AI模型的API格式

统一的错误处理和响应解析

支持不同的认证方式 (Bearer Token, API Key等)

4.强的配置界面

AI提供商下拉选择

模型自动切换

实时统计显示AI状态

详细的配置提示

* * *

![2025-11-09_004044_870.png](./_resources/2025-11-09_004044_870.png)

**脚本预览**

![2025-11-09_002523_565.png](./_resources/2025-11-09_002523_565.png)



![2025-11-09_002436_843.png](./_resources/2025-11-09_002436_843.png)



![2025-11-09_002417_296.png](./_resources/2025-11-09_002417_296.png)



