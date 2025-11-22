// ==UserScript==
// @name         传智教育满分脚本-多AI增强版 2025.11.22
// @namespace    https://stu.ityxb.com/
// @version      13.5
// @description  多AI模型支持(全手动输入版) + 题库右上角关闭 + 模块化架构 + 性能优化
// @author       多AI增强版
// @match        https://stu.ityxb.com/*
// @connect      tk.enncy.cn
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @connect      api.deepseek.com
// @connect      burn.hair
// @connect      api.chatanywhere.com.cn
// @connect      openrouter.ai
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // ================ AI 模型配置 (无预设列表，全手动) ================
  const AI_MODELS = {
    openai: {
      name: "OpenAI (GPT)",
      endpoint: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini", // 仅作为建议默认值
      authType: "Bearer",
      formatRequest: (config, question) => ({
        model: config.ai_model,
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: "你是专业答题助手。直接给出准确答案,不要解释。多个答案用#分隔。",
          },
          { role: "user", content: question },
        ],
      }),
      parseResponse: (data) => data.choices[0].message.content.trim(),
    },
    claude: {
      name: "Claude (Anthropic)",
      endpoint: "https://api.anthropic.com/v1/messages",
      defaultModel: "claude-3-5-sonnet-20241022", // 仅作为建议默认值
      authType: "x-api-key",
      formatRequest: (config, question) => ({
        model: config.ai_model,
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: "你是专业答题助手。直接给出准确答案,不要解释。多个答案用#分隔。\n\n" + question,
          },
        ],
      }),
      parseResponse: (data) => data.content[0].text.trim(),
      extraHeaders: (config) => ({
        "anthropic-version": "2023-06-01",
      }),
    },
    gemini: {
      name: "Google Gemini",
      // 注意: URL包含 {model} 占位符
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      defaultModel: "gemini-2.0-flash-exp", // 仅作为建议默认值
      authType: "query",
      formatRequest: (config, question) => ({
        contents: [
          {
            parts: [
              {
                text: "你是专业答题助手。直接给出准确答案,不要解释。多个答案用#分隔。\n\n" + question,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
      parseResponse: (data) => data.candidates[0].content.parts[0].text.trim(),
      buildUrl: (config) => {
        // 支持用户自定义URL，若URL含{model}则替换
        let url = config.ai_url;
        if (url.includes("{model}")) {
          url = url.replace("{model}", config.ai_model);
        }
        return `${url}?key=${config.ai_key}`;
      },
    },
    deepseek: {
      name: "DeepSeek",
      endpoint: "https://api.deepseek.com/chat/completions", // 修正为官方最新路径
      defaultModel: "deepseek-chat",
      authType: "Bearer",
      formatRequest: (config, question) => ({
        model: config.ai_model,
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: "你是专业答题助手。直接给出准确答案,不要解释。多个答案用#分隔。",
          },
          { role: "user", content: question },
        ],
      }),
      parseResponse: (data) => data.choices[0].message.content.trim(),
    },
    custom: {
      name: "自定义 API",
      endpoint: "",
      defaultModel: "custom-model",
      authType: "Bearer",
      formatRequest: (config, question) => ({
        model: config.ai_model,
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: "你是专业答题助手。直接给出准确答案,不要解释。多个答案用#分隔。",
          },
          { role: "user", content: question },
        ],
      }),
      parseResponse: (data) => {
        // 尝试多种解析格式
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content.trim();
        }
        if (data.content && data.content[0] && data.content[0].text) {
          return data.content[0].text.trim();
        }
        if (data.response) {
          return data.response.trim();
        }
        throw new Error("无法解析响应格式");
      },
    },
  };

  // ================ 工具函数模块 ================
  const Utils = {
    sanitizeHTML(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    },

    normalizeText(text) {
      return text
        .replace(/^[A-Z]\.?\s*/, "")
        .replace(/[\s\n\r\t]+/g, "")
        .toLowerCase()
        .trim();
    },

    throttle(fn, delay) {
      let lastCall = 0;
      return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
          lastCall = now;
          return fn.apply(this, args);
        }
      };
    },

    debounce(fn, delay) {
      let timer = null;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    encrypt(text, salt = "chuanzhi_v13") {
      try {
        return btoa(
          text
            .split("")
            .map((c, i) =>
              String.fromCharCode(
                c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length)
              )
            )
            .join("")
        );
      } catch (e) {
        return text;
      }
    },

    decrypt(encrypted, salt = "chuanzhi_v13") {
      try {
        return atob(encrypted)
          .split("")
          .map((c, i) =>
            String.fromCharCode(
              c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length)
            )
          )
          .join("");
      } catch (e) {
        return encrypted;
      }
    },
  };

  // ================ 缓存管理模块 ================
  const CacheManager = {
    MAX_SIZE: 1000,
    EXPIRE_DAYS: 30,

    get(key) {
      const cache = GM_getValue("tiku_cache_v13", {});
      const item = cache[key];

      if (!item) return null;

      if (item.timestamp) {
        const now = Date.now();
        const expireTime = this.EXPIRE_DAYS * 86400000;
        if (now - item.timestamp > expireTime) {
          delete cache[key];
          GM_setValue("tiku_cache_v13", cache);
          return null;
        }
      }

      return item.answer;
    },

    set(key, answer) {
      const cache = GM_getValue("tiku_cache_v13", {});

      if (Object.keys(cache).length >= this.MAX_SIZE) {
        const entries = Object.entries(cache)
          .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0))
          .slice(Math.floor(this.MAX_SIZE * 0.2));

        const newCache = {};
        entries.forEach(([k, v]) => (newCache[k] = v));
        GM_setValue("tiku_cache_v13", newCache);
      }

      cache[key] = {
        answer: answer,
        timestamp: Date.now(),
      };

      GM_setValue("tiku_cache_v13", cache);
    },

    clear() {
      GM_setValue("tiku_cache_v13", {});
    },

    getSize() {
      return Object.keys(GM_getValue("tiku_cache_v13", {})).length;
    },
  };

  // ================ 配置管理模块 ================
  const ConfigManager = {
    DEFAULT_CONFIG: {
      // AI配置
      ai_enabled: false,
      ai_provider: "openai", // openai, claude, gemini, deepseek, custom
      ai_key: "",
      ai_url: "https://api.openai.com/v1/chat/completions",
      ai_model: "gpt-4o-mini",

      // 题库配置
      banks: [
        {
          name: "言溪题库",
          enabled: false,
          homepage: "https://tk.enncy.cn/",
          url: "https://tk.enncy.cn/query",
          method: "GET",
          token: "",
        },
      ],

      logLevel: "INFO",
    },

    load() {
      return GM_getValue("chuanzhi_config_v13_5", this.DEFAULT_CONFIG);
    },

    save(config) {
      const saveConfig = JSON.parse(JSON.stringify(config));
      if (saveConfig.ai_key) {
        saveConfig.ai_key = Utils.encrypt(saveConfig.ai_key);
      }
      saveConfig.banks.forEach((bank) => {
        if (bank.token) {
          bank.token = Utils.encrypt(bank.token);
        }
      });

      GM_setValue("chuanzhi_config_v13_5", saveConfig);
    },

    decrypt(config) {
      if (config.ai_key) {
        config.ai_key = Utils.decrypt(config.ai_key);
      }
      config.banks.forEach((bank) => {
        if (bank.token) {
          bank.token = Utils.decrypt(bank.token);
        }
      });
      return config;
    },

    validate(config) {
      const errors = [];

      if (config.ai_enabled) {
        if (!config.ai_key || config.ai_key.length < 5) {
          errors.push("AI API Key 格式不正确(至少5个字符)");
        }
        // 移除了URL强制校验，允许localhost等
        if (!config.ai_model) {
          errors.push("AI 模型名称不能为空");
        }
      }

      config.banks.forEach((bank, i) => {
        if (bank.enabled) {
          if (!bank.url || !bank.url.match(/^https?:\/\/.+/)) {
            errors.push(`题库 ${i + 1} URL 格式不正确`);
          }
        }
      });

      return errors;
    },

    export() {
      const config = this.load();
      const data = JSON.stringify(config, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chuanzhi_config_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    import(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const config = JSON.parse(e.target.result);
            const errors = this.validate(config);
            if (errors.length > 0) {
              reject(new Error(errors.join("\n")));
            } else {
              this.save(config);
              resolve(config);
            }
          } catch (error) {
            reject(new Error("配置文件格式错误"));
          }
        };
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsText(file);
      });
    },
  };

  // ================ 日志管理模块 ================
  const Logger = {
    LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
    currentLevel: 1,
    maxLogs: 100,
    logs: [],

    init(level = "INFO") {
      this.currentLevel = this.LEVELS[level] || this.LEVELS.INFO;
    },

    log(msg, level = "INFO") {
      const levelValue = this.LEVELS[level] || this.LEVELS.INFO;
      if (levelValue < this.currentLevel) return;

      const logDiv = document.getElementById("fix_log");
      if (!logDiv) return;

      const colors = {
        DEBUG: "#999",
        INFO: "#0ff",
        WARN: "#ff0",
        ERROR: "#f00",
        SUCCESS: "#0f0",
        CACHE: "#f0f",
      };

      const entry = document.createElement("div");
      entry.className = "log-e";
      const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      entry.innerHTML = `
        <span style="color:${colors[level] || "#0ff"};">[${time}] [${level}]</span>
        ${Utils.sanitizeHTML(msg)}
      `;

      logDiv.insertBefore(entry, logDiv.firstChild);

      while (logDiv.children.length > this.maxLogs) {
        logDiv.removeChild(logDiv.lastChild);
      }

      const consoleMethod =
        level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log";
      console[consoleMethod](`[传智助手] ${msg}`);

      this.logs.push({ time, level, msg });
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }
    },

    debug(msg) {
      this.log(msg, "DEBUG");
    },
    info(msg) {
      this.log(msg, "INFO");
    },
    warn(msg) {
      this.log(msg, "WARN");
    },
    error(msg) {
      this.log(msg, "ERROR");
    },
    success(msg) {
      this.log(msg, "SUCCESS");
    },
    cache(msg) {
      this.log(msg, "CACHE");
    },

    export() {
      const content = this.logs
        .map((log) => `[${log.time}] [${log.level}] ${log.msg}`)
        .join("\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chuanzhi_logs_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    },

    clear() {
      const logDiv = document.getElementById("fix_log");
      if (logDiv) logDiv.innerHTML = "";
      this.logs = [];
    },
  };

  // ================ 请求限流器 ================
  const RateLimiter = {
    requests: [],
    maxRequests: 10,
    timeWindow: 60000,

    async throttle() {
      const now = Date.now();
      this.requests = this.requests.filter((t) => now - t < this.timeWindow);

      if (this.requests.length >= this.maxRequests) {
        const waitTime = this.timeWindow - (now - this.requests[0]);
        Logger.warn(`API限流:等待 ${Math.ceil(waitTime / 1000)} 秒`);
        await Utils.sleep(waitTime);
      }

      this.requests.push(Date.now());
    },
  };

  // ================ API 客户端模块 ================
  const APIClient = {
    async requestWithRetry(options, maxRetries = 3) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await this.request(options);
        } catch (error) {
          if (i === maxRetries - 1) throw error;
          const delay = Math.pow(2, i) * 1000;
          Logger.warn(`请求失败,${delay}ms 后重试 (${i + 1}/${maxRetries})`);
          await Utils.sleep(delay);
        }
      }
    },

    request(options) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          ...options,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response);
            } else {
              reject(
                new Error(`HTTP ${response.status}: ${response.statusText}`)
              );
            }
          },
          onerror: (error) =>
            reject(new Error(`网络错误: ${error.error || "未知错误"}`)),
          ontimeout: () => reject(new Error("请求超时")),
        });
      });
    },

    async queryBank(bank, question, options, type) {
      await RateLimiter.throttle();

      let url = bank.url;
      const params = {
        token: bank.token || "",
        title: question,
        options: options,
        type: type,
      };

      if (bank.method === "GET") {
        const query = new URLSearchParams(params);
        url += (url.includes("?") ? "&" : "?") + query.toString();
      }

      const response = await this.request({
        method: bank.method || "GET",
        url: url,
        headers: { "Content-Type": "application/json" },
        data: bank.method === "POST" ? JSON.stringify(params) : undefined,
        timeout: 10000,
      });

      const data = JSON.parse(response.responseText);

      let answer = null;
      if (data.code === 0 && data.data) {
        answer = data.data.answer || data.data;
      } else if (data.answer) {
        answer = data.answer;
      } else if (data.data) {
        answer = data.data;
      }

      if (answer && typeof answer === "string" && answer.length > 0) {
        return answer;
      }

      throw new Error("未找到答案");
    },

    async queryAI(config, question) {
      await RateLimiter.throttle();

      const provider = AI_MODELS[config.ai_provider] || AI_MODELS.openai;
      const requestData = provider.formatRequest(config, question);

      // 构建请求头
      const headers = {
        "Content-Type": "application/json",
      };

      // 根据不同的认证类型设置请求头
      if (provider.authType === "Bearer") {
        headers.Authorization = `Bearer ${config.ai_key}`;
      } else if (provider.authType === "x-api-key") {
        headers["x-api-key"] = config.ai_key;
      }

      // 添加额外的请求头
      if (provider.extraHeaders) {
        Object.assign(headers, provider.extraHeaders(config));
      }

      // 构建请求URL
      let url = config.ai_url;
      if (provider.buildUrl) {
        url = provider.buildUrl(config);
      }

      const response = await this.request({
        method: "POST",
        url: url,
        headers: headers,
        data: JSON.stringify(requestData),
        timeout: 30000,
      });

      const data = JSON.parse(response.responseText);
      return provider.parseResponse(data);
    },
  };

  // ================ 题目处理模块 ================
  const QuestionProcessor = {
    config: null,
    elementCache: new WeakMap(),

    init(config) {
      this.config = config;
    },

    detectQuestions() {
      const selectors = [
        ".questionItem",
        ".question-item-box",
        ".question-item",
        ".item-box",
      ];

      for (const sel of selectors) {
        const questions = document.querySelectorAll(sel);
        if (questions.length > 0) {
          Logger.debug(`使用选择器: ${sel}`);
          return Array.from(questions);
        }
      }
      return [];
    },

    extractQuestionText(element) {
      const selectors = [
        ".question-title-box .myEditorTxt",
        ".stem",
        ".title",
        ".question-title",
        ".question-stem",
      ];

      for (const sel of selectors) {
        const el = element.querySelector(sel);
        if (el && el.innerText.trim()) {
          return el.innerText.trim();
        }
      }

      const lines = element.innerText.split("\n").filter((l) => l.trim());
      return lines[0] || "";
    },

    extractOptions(element) {
      const optionElements = element.querySelectorAll(
        ".option, .radio_item, label"
      );
      const options = [];

      optionElements.forEach((opt) => {
        const text = opt.innerText.trim();
        if (text) options.push(text);
      });

      return options.join("###");
    },

    detectQuestionType(element) {
      const text = element.innerText;

      if (
        text.includes("单选") ||
        element.querySelectorAll('input[type="radio"]').length > 0
      ) {
        return "0";
      }
      if (
        text.includes("多选") ||
        element.querySelectorAll('input[type="checkbox"]').length > 0
      ) {
        return "1";
      }
      if (text.includes("判断")) {
        return "3";
      }
      if (
        text.includes("填空") ||
        element.querySelectorAll('input[type="text"]').length > 0
      ) {
        return "2";
      }
      return "0";
    },

    async processQuestion(element, num, total) {
      try {
        if (element.querySelector(".answer-mark")) {
          Logger.debug(`第${num}题已处理,跳过`);
          return { status: "skipped", num };
        }

        const questionText = this.extractQuestionText(element);

        if (!questionText || questionText.length < 5) {
          Logger.warn(`第${num}题无法提取题目文本`);
          return { status: "failed", num, reason: "无法提取题目" };
        }

        Logger.info(`第${num}题: ${questionText.substring(0, 40)}...`);

        const cached = CacheManager.get(questionText);
        if (cached) {
          this.fillAnswer(element, cached, "缓存", num);
          Logger.cache(`第${num}题 [缓存] ${cached}`);
          return { status: "success", num, source: "cache", answer: cached };
        }

        const options = this.extractOptions(element);
        const type = this.detectQuestionType(element);

        const enabledBanks = this.config.banks.filter((b) => b.enabled);

        if (enabledBanks.length > 0) {
          for (const bank of enabledBanks) {
            try {
              const answer = await APIClient.queryBank(
                bank,
                questionText,
                options,
                type
              );
              CacheManager.set(questionText, answer);
              this.fillAnswer(element, answer, bank.name, num);
              Logger.success(`第${num}题 [${bank.name}] ${answer}`);
              return {
                status: "success",
                num,
                source: bank.name,
                answer,
              };
            } catch (error) {
              Logger.debug(
                `第${num}题 [${bank.name}] 未找到: ${error.message}`
              );
            }
          }
        }

        if (this.config.ai_enabled && this.config.ai_key) {
          const providerName = AI_MODELS[this.config.ai_provider]?.name || "AI";
          Logger.info(`第${num}题 使用${providerName}答题`);
          const answer = await APIClient.queryAI(this.config, questionText);
          CacheManager.set(questionText, answer);
          this.fillAnswer(element, answer, providerName, num);
          Logger.success(`第${num}题 [${providerName}] ${answer}`);
          return { status: "success", num, source: providerName, answer };
        }

        Logger.error(`第${num}题 所有方式均未找到答案`);
        return { status: "failed", num, reason: "未找到答案" };
      } catch (error) {
        Logger.error(`第${num}题 处理异常: ${error.message}`);
        return { status: "error", num, error: error.message };
      }
    },

    fillAnswer(element, answer, source, num) {
      const mark = document.createElement("div");
      mark.className = "answer-mark";
      mark.textContent = `✅ [${source}] 答案: ${answer}`;

      const titleBox = element.querySelector(
        ".question-title-box, .stem, .title"
      );
      if (titleBox) {
        titleBox.appendChild(mark);
      } else {
        element.insertBefore(mark, element.firstChild);
      }

      const answers = answer
        .split("#")
        .map((a) => a.trim())
        .filter((a) => a);

      this.fillChoiceAnswer(element, answers);
      this.fillBlankAnswer(element, answers);
    },

    fillChoiceAnswer(element, answers) {
      const options = element.querySelectorAll("label, .option, .radio_item");

      options.forEach((option) => {
        let optionText = (option.innerText || "").trim();
        optionText = Utils.normalizeText(optionText);

        answers.forEach((ans) => {
          const cleanAns = Utils.normalizeText(ans);

          if (
            optionText.includes(cleanAns) ||
            cleanAns.includes(optionText) ||
            optionText === cleanAns
          ) {
            setTimeout(() => {
              option.click();

              const input = option.querySelector("input");
              if (input) {
                input.checked = true;
                input.dispatchEvent(new Event("change", { bubbles: true }));
              }

              option.dispatchEvent(
                new MouseEvent("click", {
                  bubbles: true,
                  cancelable: true,
                })
              );
            }, 100);
          }
        });
      });
    },

    fillBlankAnswer(element, answers) {
      const inputs = element.querySelectorAll('input[type="text"], textarea');
      inputs.forEach((input, i) => {
        if (answers[i]) {
          input.value = answers[i];
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    },
  };

  // ================ 样式定义 ================
  GM_addStyle(`
    #FIX_PANEL {
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, rgba(0,0,0,0.95), rgba(20,20,20,0.95));
      color: #0f0;
      border: 3px solid #0f0;
      border-radius: 15px;
      padding: 0;
      z-index: 999999999;
      box-shadow: 0 0 60px rgba(0,255,0,0.5);
      font-family: 'Consolas', 'Monaco', monospace;
      width: 450px;
      min-width: 300px;
      max-width: 800px;
      height: auto;
      min-height: 200px;
      max-height: 90vh;
      overflow: auto;
      cursor: move;
    }

    @media (max-width: 768px) {
      #FIX_PANEL {
        width: 90% !important;
        max-width: 350px;
      }
      #FIX_CFG {
        width: 90% !important;
        padding: 15px;
      }
    }

    #panel_header {
      background: linear-gradient(135deg, #0f0, #00aa00);
      color: #000;
      padding: 12px 20px;
      border-radius: 12px 12px 0 0;
      cursor: move;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
    }

    #panel_content {
      padding: 20px;
      overflow-y: auto;
      max-height: calc(90vh - 60px);
    }

    #minimize_btn {
      background: #ff0;
      color: #000;
      border: none;
      width: 25px;
      height: 25px;
      border-radius: 50%;
      cursor: pointer;
      font-weight: bold;
      font-size: 18px;
      line-height: 1;
      transition: all 0.3s;
    }

    #minimize_btn:hover {
      background: #ffff00;
      transform: scale(1.1);
    }

    #FIX_PANEL.minimized {
      width: 200px !important;
      height: 50px !important;
    }

    #FIX_PANEL.minimized #panel_content {
      display: none;
    }

    #fix_log {
      max-height: 40vh;
      overflow-y: auto;
      margin: 15px 0;
      padding-right: 5px;
    }

    #fix_log::-webkit-scrollbar,
    #FIX_PANEL::-webkit-scrollbar,
    #FIX_CFG::-webkit-scrollbar {
      width: 6px;
    }

    #fix_log::-webkit-scrollbar-thumb,
    #FIX_PANEL::-webkit-scrollbar-thumb,
    #FIX_CFG::-webkit-scrollbar-thumb {
      background: #0f0;
      border-radius: 3px;
    }

    .log-e {
      margin: 8px 0;
      padding: 10px;
      background: rgba(0, 255, 0, 0.08);
      border-radius: 8px;
      border-left: 4px solid #0f0;
      font-size: 13px;
      line-height: 1.5;
      word-break: break-all;
    }

    .cfg-btn {
      background: linear-gradient(135deg, #0f0, #00cc00) !important;
      color: #000 !important;
      padding: 12px 20px !important;
      border: none !important;
      border-radius: 10px !important;
      cursor: pointer !important;
      font-weight: bold !important;
      font-size: 15px !important;
      margin: 8px 0 !important;
      width: 100%;
      transition: all 0.3s;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }

    .cfg-btn:hover {
      background: linear-gradient(135deg, #00ff00, #0f0) !important;
      box-shadow: 0 0 25px rgba(0,255,0,0.6);
      transform: translateY(-2px);
    }

    .cfg-btn:active {
      transform: translateY(0);
    }

    .cfg-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    #FIX_CFG {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, rgba(0,0,0,0.98), rgba(20,20,20,0.98));
      color: #0f0;
      border: 5px solid #0f0;
      border-radius: 20px;
      padding: 30px;
      padding-top: 50px;
      z-index: 9999999999;
      width: 600px;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 0 100px rgba(0,255,0,0.8);
    }

    #cfg_close_btn {
      position: absolute;
      top: 15px;
      right: 15px;
      width: 35px;
      height: 35px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f00, #c00);
      color: #fff;
      border: none;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
      z-index: 10;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(255,0,0,0.3);
    }

    #cfg_close_btn:hover {
      background: linear-gradient(135deg, #ff0000, #ff3333);
      transform: scale(1.1) rotate(90deg);
      box-shadow: 0 4px 12px rgba(255,0,0,0.5);
    }

    #cfg_close_btn:active {
      transform: scale(0.95) rotate(90deg);
    }

    .cfg-section {
      background: rgba(0,255,0,0.05);
      padding: 20px;
      border-radius: 12px;
      margin: 15px 0;
      border: 2px solid rgba(0,255,0,0.3);
    }

    .cfg-section h3 {
      margin: 0 0 15px 0;
      font-size: 18px;
      color: #00ff00;
      border-bottom: 2px solid #0f0;
      padding-bottom: 10px;
    }

    #FIX_CFG input[type="text"],
    #FIX_CFG input[type="password"],
    #FIX_CFG select {
      width: 100%;
      padding: 12px;
      margin: 8px 0;
      background: rgba(0,0,0,0.6);
      border: 2px solid #0f0;
      border-radius: 8px;
      color: #0f0;
      font-size: 14px;
      font-family: 'Consolas', monospace;
      transition: all 0.3s;
      box-sizing: border-box;
    }

    #FIX_CFG input[type="text"]:focus,
    #FIX_CFG input[type="password"]:focus,
    #FIX_CFG select:focus {
      outline: none;
      border-color: #00ff00;
      box-shadow: 0 0 15px rgba(0,255,0,0.4);
    }

    #FIX_CFG input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin-right: 10px;
      cursor: pointer;
    }

    #FIX_CFG label {
      display: flex;
      align-items: center;
      margin: 10px 0;
      cursor: pointer;
      font-size: 15px;
    }

    #FIX_CFG select {
      cursor: pointer;
    }

    #FIX_CFG select option {
      background: #000;
      color: #0f0;
    }

    .bank-item {
      background: rgba(0,0,0,0.4);
      padding: 15px;
      border-radius: 10px;
      margin: 10px 0;
      border: 2px solid rgba(0,255,0,0.2);
      transition: all 0.3s;
      position: relative;
    }

    .bank-item.disabled {
      opacity: 0.5;
    }

    .bank-item:hover {
      border-color: rgba(0,255,0,0.5);
    }

    .bank-item-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 25px;
      height: 25px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f00, #c00);
      color: #fff;
      border: none;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
      font-weight: bold;
      box-shadow: 0 2px 5px rgba(255,0,0,0.3);
    }

    .bank-item-close:hover {
      background: linear-gradient(135deg, #ff0000, #ff3333);
      transform: scale(1.1) rotate(90deg);
      box-shadow: 0 3px 8px rgba(255,0,0,0.5);
    }

    .answer-mark {
      background: linear-gradient(135deg, rgba(0,255,0,0.2), rgba(0,200,0,0.2)) !important;
      border: 2px solid #0f0 !important;
      padding: 12px !important;
      margin: 12px 0 !important;
      border-radius: 10px !important;
      color: #0f0 !important;
      font-weight: bold !important;
      font-size: 15px !important;
    }

    .btn-group {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .btn-group button {
      flex: 1;
      min-width: 120px;
    }

    #progress_bar {
      width: 100%;
      height: 6px;
      background: rgba(0,255,0,0.2);
      border-radius: 3px;
      margin: 10px 0;
      overflow: hidden;
    }

    #progress_fill {
      height: 100%;
      background: linear-gradient(90deg, #0f0, #00ff00);
      width: 0%;
      transition: width 0.3s;
    }

    .stats-box {
      background: rgba(0,255,0,0.1);
      padding: 10px;
      border-radius: 8px;
      margin: 10px 0;
      font-size: 13px;
    }

    .stats-item {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
    }

    .ai-provider-hint {
      background: rgba(0,255,0,0.05);
      padding: 10px;
      border-radius: 6px;
      margin: 10px 0;
      border-left: 3px solid #0f0;
      font-size: 12px;
      line-height: 1.6;
    }
  `);

  // ================ UI 管理模块 ================
  const UIManager = {
    config: null,
    processing: false,

    init(config) {
      this.config = config;
      this.createPanel();
      this.createConfigDialog();
      this.bindEvents();
      this.makeDraggable();
    },

    createPanel() {
      const panel = document.createElement("div");
      panel.id = "FIX_PANEL";
      panel.innerHTML = `
        <div id="panel_header">
          <span style="font-size:18px;">📊 传智满分助手 v13.5</span>
          <button id="minimize_btn" title="最小化/还原">−</button>
        </div>
        <div id="panel_content">
          <button id="open_cfg" class="cfg-btn">⚙️ 配置中心</button>
          <button id="start_answer" class="cfg-btn" style="background: linear-gradient(135deg, #ff0, #ffcc00) !important;">
            ▶️ 开始答题
          </button>
          <div class="stats-box" id="stats_box">
            <div class="stats-item">
              <span>缓存大小:</span>
              <span id="cache_size">0</span>
            </div>
            <div class="stats-item">
              <span>启用题库:</span>
              <span id="enabled_banks">0</span>
            </div>
            <div class="stats-item">
              <span>AI模型:</span>
              <span id="ai_status">未启用</span>
            </div>
          </div>
          <div id="progress_bar">
            <div id="progress_fill"></div>
          </div>
          <div id="fix_log"></div>
          <div style="text-align:center;color:#ff0;font-size:15px;margin-top:12px;text-shadow: 0 0 8px #ff0;" id="fix_status">
            等待开始...
          </div>
        </div>
      `;
      document.body.appendChild(panel);

      this.updateStats();
    },

    createConfigDialog() {
      const cfg = document.createElement("div");
      cfg.id = "FIX_CFG";

      // 构建AI提供商选项
      const aiProviderOptions = Object.entries(AI_MODELS)
        .map(
          ([key, model]) =>
            `<option value="${key}" ${
              this.config.ai_provider === key ? "selected" : ""
            }>${model.name}</option>`
        )
        .join("");

      // HTML 结构
      cfg.innerHTML = `
        <button id="cfg_close_btn" title="关闭">✕</button>

        <div style="font-size:24px;text-align:center;margin-bottom:20px;text-shadow: 0 0 10px #0f0;">
          ⚙️ 配置中心
        </div>

        <div class="cfg-section">
          <h3>📚 题库配置</h3>
          <div id="banks_list"></div>
          <button id="add_bank" class="cfg-btn" style="background: linear-gradient(135deg, #00ccff, #0099ff) !important;">
            ➕ 添加新题库
          </button>
        </div>

        <div class="cfg-section">
          <h3>🤖 AI配置 (全模型支持)</h3>
          <label>
            <input type="checkbox" id="ai_sw" ${
              this.config.ai_enabled ? "checked" : ""
            }>
            启用AI答题(题库找不到时使用)
          </label>

          <div class="ai-provider-hint">
            💡 <strong>提示:</strong> 模型名称需手动输入，无需等待脚本更新。<br>
            例如: <code>gpt-4o</code>, <code>deepseek-chat</code>, <code>gemini-2.0-flash</code>
          </div>

          <label style="font-size: 14px; margin-top: 10px;">AI提供商:</label>
          <select id="ai_provider">
            ${aiProviderOptions}
          </select>

          <label style="font-size: 14px; margin-top: 10px;">API Key:</label>
          <div style="position: relative;">
            <input type="password" id="ai_k" placeholder="输入API Key" value="${
              this.config.ai_key
            }">
            <span id="toggle_ai_key" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #0f0; font-size: 12px;">
              显示
            </span>
          </div>

          <label style="font-size: 14px; margin-top: 10px;">模型名称 (手动输入):</label>
          <!-- 纯文本输入框，移除 Select -->
          <input type="text" id="ai_model" value="${this.config.ai_model}" placeholder="例如: gpt-4o-mini">

          <div id="ai_url_section">
            <label style="font-size: 14px; margin-top: 10px;">API地址 (URL):</label>
            <input type="text" id="ai_u" placeholder="API 请求地址" value="${
              this.config.ai_url
            }">
             <div class="ai-provider-hint" style="margin-top:5px; font-size:11px; padding:5px;">
                Gemini 官方需保留 {model} 占位符
             </div>
          </div>

        </div>

        <div class="cfg-section">
          <h3>🔧 高级设置</h3>
          <label>
            日志级别:
            <select id="log_level" style="margin-left: 10px;">
              <option value="DEBUG">调试</option>
              <option value="INFO" selected>信息</option>
              <option value="WARN">警告</option>
              <option value="ERROR">错误</option>
            </select>
          </label>
          <div class="btn-group" style="margin-top: 15px;">
            <button id="clear_cache" class="cfg-btn" style="background: linear-gradient(135deg, #ff6600, #ff8800) !important;">
              清空缓存
            </button>
            <button id="clear_log" class="cfg-btn" style="background: linear-gradient(135deg, #9900ff, #aa00ff) !important;">
              清空日志
            </button>
          </div>
          <div class="btn-group">
            <button id="export_config" class="cfg-btn" style="background: linear-gradient(135deg, #0099ff, #00aaff) !important;">
              导出配置
            </button>
            <button id="export_log" class="cfg-btn" style="background: linear-gradient(135deg, #ff0099, #ff00aa) !important;">
              导出日志
            </button>
          </div>
        </div>

        <div class="btn-group">
          <button id="save_cfg" class="cfg-btn">💾 保存配置</button>
        </div>
      `;
      document.body.appendChild(cfg);

      this.renderBanksList();
    },

    renderBanksList() {
      const list = document.getElementById("banks_list");
      if (!list) return;

      list.innerHTML = this.config.banks
        .map(
          (bank, index) => `
        <div class="bank-item ${
          !bank.enabled ? "disabled" : ""
        }" data-index="${index}">
          <button class="bank-item-close" data-index="${index}" title="删除">✕</button>
          <label>
            <input type="checkbox" class="bank-toggle" data-index="${index}" ${
            bank.enabled ? "checked" : ""
          }>
            <strong>${Utils.sanitizeHTML(bank.name)}</strong>
          </label>
          <input type="text" class="bank-name" placeholder="题库名称" value="${Utils.sanitizeHTML(
            bank.name
          )}" data-index="${index}">
          <input type="text" class="bank-url" placeholder="题库URL" value="${Utils.sanitizeHTML(
            bank.url
          )}" data-index="${index}">
          <input type="password" class="bank-token" placeholder="Token/Key(如有)" value="${Utils.sanitizeHTML(
            bank.token || ""
          )}" data-index="${index}">
        </div>
      `
        )
        .join("");

      this.bindBankEvents();
    },

    bindBankEvents() {
      document.querySelectorAll(".bank-toggle").forEach((cb) => {
        cb.onchange = (e) => {
          const idx = parseInt(e.target.dataset.index);
          this.config.banks[idx].enabled = e.target.checked;
          this.renderBanksList();
        };
      });

      document.querySelectorAll(".bank-name").forEach((input) => {
        input.onchange = (e) => {
          const idx = parseInt(e.target.dataset.index);
          this.config.banks[idx].name = e.target.value;
        };
      });

      document.querySelectorAll(".bank-url").forEach((input) => {
        input.onchange = (e) => {
          const idx = parseInt(e.target.dataset.index);
          this.config.banks[idx].url = e.target.value;
        };
      });

      document.querySelectorAll(".bank-token").forEach((input) => {
        input.onchange = (e) => {
          const idx = parseInt(e.target.dataset.index);
          this.config.banks[idx].token = e.target.value;
        };
      });

      document.querySelectorAll(".bank-item-close").forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(e.target.dataset.index);
          if (confirm(`确定删除题库"${this.config.banks[idx].name}"?`)) {
            this.config.banks.splice(idx, 1);
            this.renderBanksList();
            Logger.info("已删除题库");
          }
        };
      });
    },

    bindEvents() {
      // 最小化按钮
      document.getElementById("minimize_btn").onclick = () => {
        const panel = document.getElementById("FIX_PANEL");
        panel.classList.toggle("minimized");
        document.getElementById("minimize_btn").textContent =
          panel.classList.contains("minimized") ? "+" : "−";
      };

      // 打开配置
      document.getElementById("open_cfg").onclick = () => {
        document.getElementById("FIX_CFG").style.display = "block";
      };

      // 配置弹窗右上角关闭按钮
      document.getElementById("cfg_close_btn").onclick = () => {
        document.getElementById("FIX_CFG").style.display = "none";
      };

      // 保存配置
      document.getElementById("save_cfg").onclick = () => {
        this.saveConfig();
      };

      // 开始答题
      document.getElementById("start_answer").onclick = () => {
        this.startAnswering();
      };

      // 添加题库
      document.getElementById("add_bank").onclick = () => {
        this.config.banks.push({
          name: "新题库",
          enabled: true,
          url: "https://",
          method: "GET",
          token: "",
        });
        this.renderBanksList();
        Logger.info("已添加新题库");
      };

      // ======= 核心修改: AI提供商切换 (纯文本输入版) =======
      document.getElementById("ai_provider").onchange = (e) => {
        const provider = e.target.value;
        const providerConfig = AI_MODELS[provider];
        const urlInput = document.getElementById("ai_u");
        const modelInput = document.getElementById("ai_model"); // 现在是 input text

        // 1. 更新当前配置 Provider
        this.config.ai_provider = provider;

        // 2. 填充建议的默认值 (用户可随意修改)
        // 只有当输入框为空，或者值为其他厂商的默认值时，才自动替换
        // 这里简化策略：直接替换为新厂商的默认值，作为"建议"
        modelInput.value = providerConfig.defaultModel;
        modelInput.placeholder = `例如: ${providerConfig.defaultModel}`;

        // 3. 更新 URL 默认值
        urlInput.value = providerConfig.endpoint;

        Logger.info(`已切换厂商: ${providerConfig.name}, 请确认模型名称`);
      };

      // 显示/隐藏AI Key
      document.getElementById("toggle_ai_key").onclick = (e) => {
        const input = document.getElementById("ai_k");
        input.type = input.type === "password" ? "text" : "password";
        e.target.textContent = input.type === "password" ? "显示" : "隐藏";
      };

      // 清空缓存
      document.getElementById("clear_cache").onclick = () => {
        if (confirm("确定清空所有缓存?")) {
          CacheManager.clear();
          this.updateStats();
          Logger.success("缓存已清空");
        }
      };

      // 清空日志
      document.getElementById("clear_log").onclick = () => {
        Logger.clear();
        Logger.success("日志已清空");
      };

      // 导出配置
      document.getElementById("export_config").onclick = () => {
        ConfigManager.export();
        Logger.success("配置已导出");
      };

      // 导出日志
      document.getElementById("export_log").onclick = () => {
        Logger.export();
        Logger.success("日志已导出");
      };

      // ESC键关闭配置
      document.addEventListener("keydown", (e) => {
        if (
          e.key === "Escape" &&
          document.getElementById("FIX_CFG").style.display === "block"
        ) {
          document.getElementById("FIX_CFG").style.display = "none";
        }
      });
    },

    saveConfig() {
      // 读取配置
      this.config.ai_enabled = document.getElementById("ai_sw").checked;
      this.config.ai_provider = document.getElementById("ai_provider").value;
      this.config.ai_key = document.getElementById("ai_k").value.trim();
      this.config.ai_url = document.getElementById("ai_u").value.trim();
      // 直接读取 input 文本框的值
      this.config.ai_model = document.getElementById("ai_model").value.trim();
      this.config.logLevel = document.getElementById("log_level").value;

      // 设置默认URL(如果为空)
      if (!this.config.ai_url) {
        const provider = AI_MODELS[this.config.ai_provider];
        this.config.ai_url = provider.endpoint;
      }

      // 验证配置
      const errors = ConfigManager.validate(this.config);
      if (errors.length > 0) {
        alert("配置错误:\n\n" + errors.join("\n"));
        return;
      }

      // 保存配置
      ConfigManager.save(this.config);
      document.getElementById("FIX_CFG").style.display = "none";

      Logger.success("配置已保存");
      Logger.init(this.config.logLevel);
      QuestionProcessor.init(this.config);

      this.updateStats();

      if (this.config.ai_enabled) {
        const providerName = AI_MODELS[this.config.ai_provider]?.name || "AI";
        Logger.info(`AI已启用: ${providerName} (模型: ${this.config.ai_model})`);
      }
    },

    updateStats() {
      document.getElementById("cache_size").textContent =
        CacheManager.getSize();
      document.getElementById("enabled_banks").textContent =
        this.config.banks.filter((b) => b.enabled).length;

      const aiStatus = document.getElementById("ai_status");
      if (this.config.ai_enabled) {
        const providerName = AI_MODELS[this.config.ai_provider]?.name || "未知";
        aiStatus.textContent = `${providerName}`;
        aiStatus.style.color = "#0f0";
      } else {
        aiStatus.textContent = "未启用";
        aiStatus.style.color = "#666";
      }
    },

    updateStatus(msg) {
      const status = document.getElementById("fix_status");
      if (status) status.textContent = msg;
    },

    updateProgress(current, total) {
      const percent = (current / total) * 100;
      document.getElementById("progress_fill").style.width = percent + "%";
      this.updateStatus(
        `处理中: ${current}/${total} (${percent.toFixed(1)}%)`
      );
    },

    async startAnswering() {
      if (this.processing) {
        Logger.warn("答题进行中,请勿重复点击");
        return;
      }

      const questions = QuestionProcessor.detectQuestions();
      if (questions.length === 0) {
        Logger.error("未检测到题目");
        alert("未检测到题目!\n\n请刷新页面后重试");
        return;
      }

      this.processing = true;
      const startBtn = document.getElementById("start_answer");
      startBtn.disabled = true;
      startBtn.textContent = "⏸️ 处理中...";

      Logger.success(`开始处理 ${questions.length} 道题目`);

      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
        error: 0,
      };

      for (let i = 0; i < questions.length; i++) {
        try {
          const result = await QuestionProcessor.processQuestion(
            questions[i],
            i + 1,
            questions.length
          );

          if (result.status === "success") results.success++;
          else if (result.status === "skipped") results.skipped++;
          else if (result.status === "failed") results.failed++;
          else if (result.status === "error") results.error++;

          this.updateProgress(i + 1, questions.length);

          await Utils.sleep(800);
        } catch (error) {
          Logger.error(`第${i + 1}题处理异常: ${error.message}`);
          results.error++;
        }
      }

      this.processing = false;
      startBtn.disabled = false;
      startBtn.textContent = "▶️ 开始答题";

      Logger.success(
        `处理完成!成功: ${results.success}, 跳过: ${results.skipped}, 失败: ${results.failed}, 错误: ${results.error}`
      );

      setTimeout(() => {
        alert(
          `答题完成!\n\n` +
            `成功: ${results.success}\n` +
            `跳过: ${results.skipped}\n` +
            `失败: ${results.failed}\n` +
            `错误: ${results.error}\n\n` +
            `请检查后提交试卷`
        );
      }, 500);
    },

    makeDraggable() {
      const panel = document.getElementById("FIX_PANEL");
      const header = document.getElementById("panel_header");

      let isDragging = false;
      let currentX, currentY, initialX, initialY;

      header.addEventListener("mousedown", (e) => {
        if (e.target.id === "minimize_btn") return;

        initialX = e.clientX - panel.offsetLeft;
        initialY = e.clientY - panel.offsetTop;

        if (e.target === header || e.target.parentElement === header) {
          isDragging = true;
          panel.style.cursor = "grabbing";
        }
      });

      document.addEventListener("mousemove", (e) => {
        if (isDragging) {
          e.preventDefault();
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;

          const maxX = window.innerWidth - panel.offsetWidth;
          const maxY = window.innerHeight - panel.offsetHeight;

          currentX = Math.max(0, Math.min(currentX, maxX));
          currentY = Math.max(0, Math.min(currentY, maxY));

          panel.style.left = currentX + "px";
          panel.style.top = currentY + "px";
          panel.style.right = "auto";
        }
      });

      document.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          panel.style.cursor = "move";
        }
      });
    },
  };

  // ================ 防检测 ================
  function applyAntiDetection() {
    if (!window.location.href.includes("/writePaper/")) return;

    ["visibilitychange", "blur", "focus"].forEach((e) => {
      window.addEventListener(
        e,
        (ev) => ev.stopImmediatePropagation(),
        true
      );
    });

    Object.defineProperty(document, "hidden", {
      get: () => false,
      configurable: true,
    });

    document.hasFocus = () => true;

    Logger.debug("防检测已启用");
  }

  // ================ 主初始化 ================
  async function init() {
    try {
      let config = ConfigManager.load();
      config = ConfigManager.decrypt(config);

      Logger.init(config.logLevel || "INFO");
      QuestionProcessor.init(config);
      UIManager.init(config);

      applyAntiDetection();

      Logger.success("脚本加载完成 v13.5");

      const enabledBanks = config.banks.filter((b) => b.enabled && b.token);
      if (enabledBanks.length > 0) {
        Logger.info(`已配置 ${enabledBanks.length} 个题库`);
      } else {
        Logger.warn("未配置题库");
      }

      if (config.ai_enabled && config.ai_key) {
        const providerName = AI_MODELS[config.ai_provider]?.name || "AI";
        Logger.info(`AI已启用: ${providerName} (${config.ai_model})`);
      }

      await Utils.sleep(2000);
      const questions = QuestionProcessor.detectQuestions();
      if (questions.length > 0) {
        Logger.success(`检测到 ${questions.length} 道题目`);
        UIManager.updateStatus(
          `检测到 ${questions.length} 道题,点击开始答题`
        );
      } else {
        Logger.info("等待题目加载...");
      }
    } catch (error) {
      console.error("[传智助手] 初始化失败:", error);
      alert(`脚本初始化失败:${error.message}`);
    }
  }

  // ================ 启动 ================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 100);
  }

  // 全局错误处理
  window.addEventListener("error", (e) => {
    Logger.error(`全局错误: ${e.message}`);
    console.error(e);
  });

  window.addEventListener("unhandledrejection", (e) => {
    Logger.error(`未处理的Promise错误: ${e.reason}`);
    console.error(e);
  });
})();
