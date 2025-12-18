// ==UserScript==
// @name         传智教育满分脚本-多AI增强版（判断题彻底修复）
// @namespace    https://stu.ityxb.com/
// @version      13.12
// @description  v13.12：彻底修复判断题"AI答案解析失败"问题
// @author       多AI增强版
// @match        https://stu.ityxb.com/*
// @connect      *
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

  // ================ AI 模型配置 ================
  const AI_MODELS = {
    openai: {
      name: "OpenAI (GPT)",
      endpoint: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
      authType: "Bearer",
      formatRequest: (config, prompt) => ({
        model: config.ai_model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: "system", content: "你是专业答题助手。严格按用户要求输出。" },
          { role: "user", content: prompt },
        ],
      }),
      parseResponse: (data) =>
        data.choices?.[0]?.message?.content?.trim?.() || "",
    },

    claude: {
      name: "Claude (Anthropic)",
      endpoint: "https://api.anthropic.com/v1/messages",
      defaultModel: "claude-3-5-sonnet-20241022",
      authType: "x-api-key",
      formatRequest: (config, prompt) => ({
        model: config.ai_model,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
      parseResponse: (data) => data?.content?.[0]?.text?.trim?.() || "",
      extraHeaders: () => ({ "anthropic-version": "2023-06-01" }),
    },

    gemini: {
      name: "Google Gemini",
      endpoint:
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      defaultModel: "gemini-2.0-flash-exp",
      authType: "query",
      formatRequest: (config, prompt) => ({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
      }),
      parseResponse: (data) =>
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || "",

      buildUrl: (config) => {
        let url = (config.ai_url || "").trim();
        const model = (config.ai_model || "").trim();
        const key = (config.ai_key || "").trim();

        if (!url) url = AI_MODELS.gemini.endpoint;
        if (url.includes("{model}"))
          url = url.replace("{model}", encodeURIComponent(model));

        const keyPlaceholders = ["{key}", "{apiKey}", "{apikey}"];
        for (const ph of keyPlaceholders) {
          if (url.includes(ph)) return url.replace(ph, encodeURIComponent(key));
        }

        const hasKeyParam = /[?&]key=/.test(url);
        if (!hasKeyParam)
          url +=
            (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key);
        return url;
      },
    },

    deepseek: {
      name: "DeepSeek",
      endpoint: "https://api.deepseek.com/chat/completions",
      defaultModel: "deepseek-chat",
      authType: "Bearer",
      formatRequest: (config, prompt) => ({
        model: config.ai_model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: "system", content: "你是专业答题助手。严格按用户要求输出。" },
          { role: "user", content: prompt },
        ],
      }),
      parseResponse: (data) =>
        data.choices?.[0]?.message?.content?.trim?.() || "",
    },

    custom: {
      name: "自定义 API",
      endpoint: "",
      defaultModel: "custom-model",
      authType: "Bearer",
      formatRequest: (config, prompt) => ({
        model: config.ai_model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: "system", content: "你是专业答题助手。严格按用户要求输出。" },
          { role: "user", content: prompt },
        ],
      }),
      parseResponse: (data) => {
        if (data.choices?.[0]?.message?.content)
          return data.choices[0].message.content.trim();
        if (data.content?.[0]?.text) return data.content[0].text.trim();
        if (data.response) return String(data.response).trim();
        return JSON.stringify(data);
      },
    },
  };

  // ================ 工具函数模块 ================
  const Utils = {
    sanitizeHTML(str) {
      const div = document.createElement("div");
      div.textContent = str ?? "";
      return div.innerHTML;
    },

    normalizeText(text) {
      return (text || "")
        .replace(/^[A-Z]\.?\s*/i, "")
        .replace(/[\s\n\r\t]+/g, "")
        .toLowerCase()
        .trim();
    },

    normalizeForCache(text) {
      return (text || "")
        .replace(/[\u00A0]/g, " ")
        .replace(/[\s\n\r\t]+/g, " ")
        .trim()
        .toLowerCase();
    },

    hash32(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      return ("00000000" + h.toString(16)).slice(-8);
    },

    buildQuestionFingerprint({ questionText, optionTexts, qType }) {
      const q = this.normalizeForCache(questionText);
      const opts = (optionTexts || [])
        .map((t) => this.normalizeForCache(t))
        .join("|");
      const raw = `v2|type=${qType}|q=${q}|opts=${opts}`;
      return "QF_" + this.hash32(raw);
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    encrypt(text, salt = "chuanzhi_v13") {
      try {
        return btoa(
          String(text || "")
            .split("")
            .map((c, i) =>
              String.fromCharCode(
                c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length)
              )
            )
            .join("")
        );
      } catch (_) {
        return String(text || "");
      }
    },

    decrypt(encrypted, salt = "chuanzhi_v13") {
      try {
        return atob(String(encrypted || ""))
          .split("")
          .map((c, i) =>
            String.fromCharCode(
              c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length)
            )
          )
          .join("");
      } catch (_) {
        return String(encrypted || "");
      }
    },

    safeJsonExtract(text) {
      const s = (text || "").trim();
      if (!s) return null;

      try {
        return JSON.parse(s);
      } catch (_) {}

      const firstObj = s.indexOf("{");
      const lastObj = s.lastIndexOf("}");
      if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
        const sub = s.slice(firstObj, lastObj + 1);
        try {
          return JSON.parse(sub);
        } catch (_) {}
      }

      const firstArr = s.indexOf("[");
      const lastArr = s.lastIndexOf("]");
      if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
        const sub = s.slice(firstArr, lastArr + 1);
        try {
          return JSON.parse(sub);
        } catch (_) {}
      }

      return null;
    },

    lettersToArray(s) {
      const up = (s || "").toUpperCase();
      const matches = up.match(/[A-Z]/g);
      if (!matches) return [];
      return Array.from(new Set(matches));
    },
  };

  // ================ 答案解析模块 ================
  const AnswerParser = {
    typeName(qType) {
      if (qType === "0") return "单选";
      if (qType === "1") return "多选";
      if (qType === "2") return "填空";
      if (qType === "3") return "判断";
      return "单选";
    },

    buildAIPrompt({ questionText, qType, optionMap }) {
      const typeName = this.typeName(qType);
      const lines = [];

      lines.push("你是专业答题助手。");
      lines.push("任务：根据题目和选项给出正确答案。");
      lines.push(
        "重要：只输出 JSON，不要输出任何解释、前后缀文本、代码块标记。"
      );
      lines.push("");
      lines.push(`题型：${typeName}`);
      lines.push(`题目：${questionText}`);

      if (qType === "0" || qType === "1" || qType === "3") {
        lines.push("选项：");
        for (const item of optionMap)
          lines.push(`${item.letter}. ${item.text}`);
      }

      lines.push("");
      lines.push("输出 JSON 格式要求：");
      lines.push('1) 单选/多选：{"answers":["A"]} 或 {"answers":["A","C"]}');
      lines.push('2) 判断：{"answers":["正确"]} 或 {"answers":["错误"]}');
      lines.push('3) 填空：{"answers":["第1空","第2空"]}（按空的顺序）');
      lines.push("");
      lines.push("再次强调：只输出 JSON。");

      return lines.join("\n");
    },

    normalizeRawToAnswers(raw) {
      if (raw == null) return { answers: [] };

      if (typeof raw === "object") {
        const arr = raw.answers || raw.answer || raw.data || raw.result;
        if (Array.isArray(arr))
          return { answers: arr.map((x) => String(x).trim()).filter(Boolean) };
        if (typeof arr === "string")
          return {
            answers: arr
              .split("#")
              .map((x) => x.trim())
              .filter(Boolean),
          };
        return { answers: [JSON.stringify(raw)] };
      }

      const s = String(raw).trim();
      if (!s) return { answers: [] };

      const js = Utils.safeJsonExtract(s);
      if (js) {
        if (Array.isArray(js))
          return { answers: js.map((x) => String(x).trim()).filter(Boolean) };
        if (typeof js === "object") {
          const a = js.answers ?? js.answer ?? js.data ?? js.result;
          if (Array.isArray(a))
            return { answers: a.map((x) => String(x).trim()).filter(Boolean) };
          if (typeof a === "string")
            return {
              answers: a
                .split("#")
                .map((x) => x.trim())
                .filter(Boolean),
            };
        }
      }

      return {
        answers: s
          .split("#")
          .map((x) => x.trim())
          .filter(Boolean),
      };
    },

    normalizeJudgeToken(token) {
      const t = Utils.normalizeText(token);
      if (!t) return null;

      const yes = [
        "正确",
        "对",
        "是",
        "true",
        "yes",
        "√",
        "✓",
        "✔",
        "y",
        "t",
        "right",
        "correct",
        "正确的",
        "对的",
        "是的",
        "真",
        "成立",
      ];

      const no = [
        "错误",
        "错",
        "否",
        "false",
        "no",
        "×",
        "✗",
        "✘",
        "n",
        "f",
        "wrong",
        "incorrect",
        "错误的",
        "错的",
        "不是",
        "假",
        "不成立",
      ];

      for (const k of yes)
        if (t.includes(Utils.normalizeText(k))) return "正确";
      for (const k of no) if (t.includes(Utils.normalizeText(k))) return "错误";

      return null;
    },

    judgeFromLetterByOptions(letter, optionMap) {
      const L = String(letter).trim().toUpperCase();
      const opt = optionMap.find((x) => x.letter.toUpperCase() === L);
      if (!opt) return null;
      return this.normalizeJudgeToken(opt.text);
    },

    resolveChoiceLetters({ qType, answers, optionMap }) {
      // 判断题
      if (qType === "3") {
        let judge = null;

        for (const a of answers || []) {
          judge = this.normalizeJudgeToken(a);
          if (judge) break;
        }
        if (!judge) {
          const combined = (answers || []).join(" ");
          judge = this.normalizeJudgeToken(combined);
        }
        if (!judge) return [];

        // ✅ 关键：把“正确/错误”转换成真正的布尔
        const judgeBool = (judge === "正确");

        // 优先按选项文本匹配“对/错”
        const pick = (wantCorrect) => {
          for (const opt of optionMap || []) {
            const t = this.normalizeJudgeToken(opt.text);
            if (!t) continue;
            if (wantCorrect && t === "正确") return opt.letter;
            if (!wantCorrect && t === "错误") return opt.letter;
          }
          return null;
        };

        const byText = pick(judgeBool);
        if (byText) return [byText];

        // 兜底：只有两项时按顺序选（“错误”必须走第二项）
        if ((optionMap || []).length === 2) {
          return [judgeBool ? optionMap[0].letter : optionMap[1].letter];
        }
        return [];
      }

      // 单选/多选（保持原来的字母提取思路）
      const letters = [];
      for (const a of answers || []) {
        const token = String(a).trim().toUpperCase();
        const m = token.match(/[A-Z]/g);
        if (m) letters.push(...m);
      }
      const uniq = Array.from(new Set(letters)).filter(Boolean);

      // 单选只取一个
      if (qType === "0") return uniq.length ? [uniq[0]] : [];
      return uniq;
    },

    resolveBlankAnswers({ answers, blankCount }) {
      let arr = answers.slice();
      if (blankCount > 1 && arr.length === 1) {
        const one = String(arr[0] || "");
        const spl = one
          .split(/[#\n\r\t]|、|，|,|；|;|\|\|/g)
          .map((x) => x.trim())
          .filter(Boolean);
        if (spl.length >= 2) arr = spl;
      }
      return arr;
    },

    toDisplayString(qType, resolved) {
      if (!resolved || !resolved.answers || resolved.answers.length === 0)
        return "";
      return resolved.answers.join("#");
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

      cache[key] = { answer: answer, timestamp: Date.now() };
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
      ai_enabled: false,
      ai_provider: "openai",
      ai_key: "",
      ai_url: "https://api.openai.com/v1/chat/completions",
      ai_model: "gpt-4o-mini",

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
      if (saveConfig.ai_key)
        saveConfig.ai_key = Utils.encrypt(saveConfig.ai_key);
      saveConfig.banks.forEach((bank) => {
        if (bank.token) bank.token = Utils.encrypt(bank.token);
      });
      GM_setValue("chuanzhi_config_v13_5", saveConfig);
    },

    decrypt(config) {
      if (config.ai_key) config.ai_key = Utils.decrypt(config.ai_key);
      config.banks.forEach((bank) => {
        if (bank.token) bank.token = Utils.decrypt(bank.token);
      });
      return config;
    },

    validate(config) {
      const errors = [];
      if (config.ai_enabled) {
        if (!config.ai_key || config.ai_key.length < 5)
          errors.push("AI API Key 格式不正确(至少5个字符)");
        if (!config.ai_model) errors.push("AI 模型名称不能为空");
        if (!config.ai_url || !config.ai_url.match(/^https?:\/\/.+/))
          errors.push("AI API 地址(URL) 格式不正确");
      }

      config.banks.forEach((bank, i) => {
        if (bank.enabled) {
          if (!bank.url || !bank.url.match(/^https?:\/\/.+/))
            errors.push(`题库 ${i + 1} URL 格式不正确`);
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
  };

  // ================ 日志管理模块 ================
  const Logger = {
    LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
    currentLevel: 1,
    maxLogs: 100,
    logs: [],

    init(level = "INFO") {
      this.currentLevel = this.LEVELS[level] ?? this.LEVELS.INFO;
    },

    log(msg, level = "INFO") {
      const levelValue = this.LEVELS[level] ?? this.LEVELS.INFO;
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
        <span style="color:${
          colors[level] || "#0ff"
        };">[${time}] [${level}]</span>
        ${Utils.sanitizeHTML(msg)}
      `;

      logDiv.insertBefore(entry, logDiv.firstChild);
      while (logDiv.children.length > this.maxLogs)
        logDiv.removeChild(logDiv.lastChild);

      const consoleMethod =
        level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log";
      console[consoleMethod](`[传智助手] ${msg}`);

      this.logs.push({ time, level, msg });
      if (this.logs.length > this.maxLogs) this.logs.shift();
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
            if (response.status >= 200 && response.status < 300)
              resolve(response);
            else
              reject(
                new Error(`HTTP ${response.status}: ${response.statusText}`)
              );
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

      if ((bank.method || "GET").toUpperCase() === "GET") {
        const query = new URLSearchParams(params);
        url += (url.includes("?") ? "&" : "?") + query.toString();
      }

      const response = await this.request({
        method: bank.method || "GET",
        url: url,
        headers: { "Content-Type": "application/json" },
        data:
          (bank.method || "GET").toUpperCase() === "POST"
            ? JSON.stringify(params)
            : undefined,
        timeout: 10000,
      });

      const data = JSON.parse(response.responseText);

      let answer = null;
      if (data.code === 0 && data.data) answer = data.data.answer || data.data;
      else if (data.answer) answer = data.answer;
      else if (data.data) answer = data.data;

      if (answer && typeof answer === "string" && answer.length > 0)
        return answer;

      throw new Error("未找到答案");
    },

    async queryAI(config, prompt) {
      await RateLimiter.throttle();

      const provider = AI_MODELS[config.ai_provider] || AI_MODELS.openai;
      const requestData = provider.formatRequest(config, prompt);

      const headers = { "Content-Type": "application/json" };
      if (provider.authType === "Bearer")
        headers.Authorization = `Bearer ${config.ai_key}`;
      else if (provider.authType === "x-api-key")
        headers["x-api-key"] = config.ai_key;
      if (provider.extraHeaders)
        Object.assign(headers, provider.extraHeaders(config));

      let url = config.ai_url;
      if (provider.buildUrl) url = provider.buildUrl(config);

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

    async queryAIWithRepair(config, prompt, repairContext = "") {
      const raw = await this.queryAI(config, prompt);

      const js = Utils.safeJsonExtract(raw);
      if (js) return raw;

      const repairPrompt = [
        "把下面内容转换为 JSON，且只输出 JSON（不要解释/不要代码块）。",
        '目标格式：{"answers":[...]}',
        repairContext ? `上下文：${repairContext}` : "",
        "内容：",
        raw,
      ]
        .filter(Boolean)
        .join("\n");

      Logger.warn("AI输出非JSON，启动修复请求一次...");
      const raw2 = await this.queryAI(config, repairPrompt);
      return raw2;
    },
  };

  // ================ 题目处理模块 ================
  const QuestionProcessor = {
    config: null,

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
        if (el && el.innerText.trim()) return el.innerText.trim();
      }

      const lines = element.innerText.split("\n").filter((l) => l.trim());
      return lines[0] || "";
    },

    extractOptionElements(element) {
      // 只抓真正的选项 label：必须包含 radio/checkbox input
      const nodes = Array.from(element.querySelectorAll("label"))
        .filter(lb => lb.querySelector('input[type="radio"], input[type="checkbox"]'))
        .filter(lb => !lb.closest(".answer-mark")); // 排除脚本自己插入的答案条

      // 去重
      const uniq = [];
      const seen = new Set();
      for (const n of nodes) {
        const key = (n.innerText || "").trim();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(n);
      }
      return uniq;
    },

    buildOptionMap(element) {
      const optionEls = this.extractOptionElements(element);
      const optionMap = [];

      for (let i = 0; i < optionEls.length; i++) {
        const el = optionEls[i];
        const rawText = (el.innerText || "").trim();
        if (!rawText) continue;

        const m = rawText.match(/^\s*([A-Z])[\.、\)]\s*/i);
        let letter = m ? m[1].toUpperCase() : null;
        if (!letter)
          letter = String.fromCharCode("A".charCodeAt(0) + optionMap.length);

        const text = rawText.replace(/^\s*[A-Z][\.、\)]\s*/i, "").trim();
        optionMap.push({ letter, text: text || rawText, el });
      }

      return optionMap;
    },

    extractOptionsForBank(optionMap) {
      return optionMap.map((o) => `${o.letter}. ${o.text}`).join("###");
    },

    detectQuestionType(element) {
      const text = element.innerText;

      if (
        text.includes("单选") ||
        element.querySelectorAll('input[type="radio"]').length > 0
      )
        return "0";
      if (
        text.includes("多选") ||
        element.querySelectorAll('input[type="checkbox"]').length > 0
      )
        return "1";
      if (text.includes("判断")) return "3";
      if (
        text.includes("填空") ||
        element.querySelectorAll('input[type="text"]').length > 0
      )
        return "2";
      return "0";
    },

    getBlankInputs(element) {
      return Array.from(
        element.querySelectorAll('input[type="text"], textarea')
      );
    },

    hasAnswered(element) {
      if (element.querySelector(".answer-mark")) return true;
      return false;
    },

    async processQuestion(element, num, total) {
      try {
        if (this.hasAnswered(element)) {
          Logger.debug(`第${num}题已处理,跳过`);
          return { status: "skipped", num };
        }

        const questionText = this.extractQuestionText(element);
        if (!questionText || questionText.length < 5) {
          Logger.warn(`第${num}题无法提取题目文本`);
          return { status: "failed", num, reason: "无法提取题目" };
        }

        let qType = this.detectQuestionType(element);
        const optionMap = this.buildOptionMap(element);

        if (qType === "0") {
          const radioCount = element.querySelectorAll('input[type="radio"]').length;
          const judgeOnly = optionMap.filter(o => AnswerParser.normalizeJudgeToken(o.text));
          if (radioCount === 2 && judgeOnly.length === 2) qType = "3";
        }

        const optionTexts = optionMap.map((o) => o.text);

        const fingerprint = Utils.buildQuestionFingerprint({
          questionText,
          optionTexts,
          qType,
        });

        Logger.info(`第${num}题: ${questionText.substring(0, 40)}...`);

        const cached = CacheManager.get(fingerprint);
        if (cached) {
          this.fillAnswerSmart(element, cached, "缓存", num, qType, optionMap);
          Logger.cache(`第${num}题 [缓存] ${cached}`);
          return { status: "success", num, source: "cache", answer: cached };
        }

        const optionsForBank = this.extractOptionsForBank(optionMap);

        const enabledBanks = this.config.banks.filter((b) => b.enabled);
        if (enabledBanks.length > 0) {
          for (const bank of enabledBanks) {
            try {
              const rawAnswer = await APIClient.queryBank(
                bank,
                questionText,
                optionsForBank,
                qType
              );
              const normalized = this.normalizeAndValidateAnswer(
                rawAnswer,
                qType,
                optionMap,
                element
              );

              if (normalized) {
                CacheManager.set(fingerprint, normalized);
                this.fillAnswerSmart(
                  element,
                  normalized,
                  bank.name,
                  num,
                  qType,
                  optionMap
                );
                Logger.success(`第${num}题 [${bank.name}] ${normalized}`);
                return {
                  status: "success",
                  num,
                  source: bank.name,
                  answer: normalized,
                };
              }

              Logger.warn(
                `第${num}题 [${bank.name}] 返回答案无法解析: ${rawAnswer}`
              );
            } catch (error) {
              Logger.debug(
                `第${num}题 [${bank.name}] 未找到: ${error.message}`
              );
            }
          }
        }

        if (this.config.ai_enabled && this.config.ai_key) {
          const providerName = AI_MODELS[this.config.ai_provider]?.name || "AI";
          Logger.info(`第${num}题 使用${providerName}答题(JSON模式)`);

          const prompt = AnswerParser.buildAIPrompt({
            questionText,
            qType,
            optionMap,
          });
          const raw = await APIClient.queryAIWithRepair(
            this.config,
            prompt,
            `题型=${AnswerParser.typeName(qType)}`
          );

          const normalized = this.normalizeAndValidateAnswer(
            raw,
            qType,
            optionMap,
            element
          );
          if (!normalized) {
            Logger.error(`第${num}题 AI返回: ${raw.substring(0, 150)}`);
            throw new Error("AI答案解析失败");
          }

          CacheManager.set(fingerprint, normalized);
          this.fillAnswerSmart(
            element,
            normalized,
            providerName,
            num,
            qType,
            optionMap
          );
          Logger.success(`第${num}题 [${providerName}] ${normalized}`);
          return {
            status: "success",
            num,
            source: providerName,
            answer: normalized,
          };
        }

        Logger.error(`第${num}题 所有方式均未找到答案`);
        return { status: "failed", num, reason: "未找到答案" };
      } catch (error) {
        Logger.error(`第${num}题 处理异常: ${error.message}`);
        return { status: "error", num, error: error.message };
      }
    },

    // 【核心修复】增加判断题单独处理
    normalizeAndValidateAnswer(rawAnswer, qType, optionMap, element) {
      const { answers } = AnswerParser.normalizeRawToAnswers(rawAnswer);

      if (qType === "2") {
        const blankCount = this.getBlankInputs(element).length;
        const blanks = AnswerParser.resolveBlankAnswers({
          answers,
          blankCount,
        });
        const out = { answers: blanks };
        const display = AnswerParser.toDisplayString(qType, out);
        return display || null;
      }

      // 【新增】判断题单独处理
      if (qType === "3") {
        Logger.debug(`判断题原始答案: ${JSON.stringify(answers)}`);

        // ✅ 新增：过滤出真正的“对/错”选项，避免 optionMap 被多余 label 污染
        const judgeOnly = optionMap.filter((o) =>
          AnswerParser.normalizeJudgeToken(o.text)
        );
        const safeOptionMap = judgeOnly.length >= 2 ? judgeOnly : optionMap;

        // 第1步：尝试直接识别语义
        let judge = null;
        for (const ans of answers) {
          judge = AnswerParser.normalizeJudgeToken(ans);
          if (judge) {
            Logger.debug(`步骤1识别到: ${judge}`);
            break;
          }
        }

        // 第2步：如果是字母，从选项推断（这里用 safeOptionMap）
        if (!judge && answers.length > 0) {
          const firstAns = String(answers[0]).trim().toUpperCase();
          if (/^[A-Z]$/.test(firstAns)) {
            judge = AnswerParser.judgeFromLetterByOptions(
              firstAns,
              safeOptionMap
            );
            if (judge) Logger.debug(`步骤2从字母${firstAns}识别到: ${judge}`);
          }
        }

        // 第3步：合并识别
        if (!judge) {
          const combined = answers.join(" ");
          judge = AnswerParser.normalizeJudgeToken(combined);
          if (judge) Logger.debug(`步骤3合并识别到: ${judge}`);
        }

        if (!judge) {
          Logger.error(`判断题无法识别答案: ${JSON.stringify(answers)}`);
          return null;
        }

        // 找到对应的选项字母（这里用 safeOptionMap）
        const letters = AnswerParser.resolveChoiceLetters({
          qType,
          answers: [judge],
          optionMap: safeOptionMap,
        });

        if (!letters || letters.length === 0) {
          Logger.error(`判断题无法匹配选项: ${judge}`);
          return null;
        }

        Logger.debug(`判断题最终选项: ${letters[0]}`);
        // 返回字母（会在fillAnswerSmart中转换为"对/错"显示）
        return letters[0];
      }

      // 单选/多选
      const letters = AnswerParser.resolveChoiceLetters({
        qType,
        answers,
        optionMap,
      });
      if (!letters || letters.length === 0) return null;

      const sorted = letters
        .map((x) => x.toUpperCase())
        .filter(Boolean)
        .sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0));

      const out = { answers: sorted };
      const display = AnswerParser.toDisplayString(qType, out);
      return display || null;
    },

    // UI层最终显示转换
    fillAnswerSmart(element, answerDisplay, source, num, qType, optionMap) {
      let finalDisplay = answerDisplay;

      // ✅ 新增：判断题点击/显示也用过滤后的 optionMap
      let safeOptionMap = optionMap;
      if (qType === "3") {
        const judgeOnly = optionMap.filter((o) =>
          AnswerParser.normalizeJudgeToken(o.text)
        );
        if (judgeOnly.length >= 2) safeOptionMap = judgeOnly;
      }

      // 判断题：如果是字母，转换为"对/错"显示（这里用 safeOptionMap）
      if (
        qType === "3" &&
        /^[A-Z]$/.test(String(answerDisplay).trim().toUpperCase())
      ) {
        const letter = String(answerDisplay).trim().toUpperCase();
        const judge = AnswerParser.judgeFromLetterByOptions(
          letter,
          safeOptionMap
        );
        if (judge) {
          finalDisplay = judge === "正确" ? "对" : "错";
          Logger.debug(`UI层转换判断题: ${letter} -> ${finalDisplay}`);
        }
      }

      const mark = document.createElement("div");
      mark.className = "answer-mark";
      mark.textContent = `✅ [${source}] 答案: ${finalDisplay}`;

      const titleBox = element.querySelector(
        ".question-title-box, .stem, .title"
      );
      if (titleBox) titleBox.appendChild(mark);
      else element.insertBefore(mark, element.firstChild);

      if (qType === "2") {
        const blanks = (answerDisplay || "")
          .split("#")
          .map((x) => x.trim())
          .filter(Boolean);
        this.fillBlankAnswer(element, blanks);
      } else {
        const letters = (answerDisplay || "")
          .split("#")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);

        // ✅ 这里也传 safeOptionMap，避免点到多余 label
        this.fillChoiceByLetters(element, letters, safeOptionMap, qType);
      }
    },

    fillChoiceByLetters(element, letters, optionMap, qType) {
      const target = new Set(letters);
      if (target.size === 0) return;

      const clickOne = async (opt) => {
        const el = opt.el;

        let input = el.querySelector("input");
        if (!input) {
          input = el.closest("label")?.querySelector("input") || null;
        }

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            el.click();
            el.dispatchEvent(
              new MouseEvent("click", { bubbles: true, cancelable: true })
            );
          } catch (_) {}

          await Utils.sleep(80);

          if (input) {
            if (qType === "1") {
              if (input.checked) return true;
            } else {
              if (input.checked) return true;
            }
          } else {
            return true;
          }
        }
        return false;
      };

      (async () => {
        const list = qType === "0" || qType === "3" ? [letters[0]] : letters;

        for (const L of list) {
          const opt = optionMap.find((x) => x.letter.toUpperCase() === L);
          if (!opt) continue;

          const ok = await clickOne(opt);
          if (!ok) Logger.warn(`选项 ${L} 点击后未确认选中，已尝试重试`);
        }
      })();
    },

    fillBlankAnswer(element, answers) {
      const inputs = this.getBlankInputs(element);
      inputs.forEach((input, i) => {
        if (answers[i] != null && String(answers[i]).trim() !== "") {
          input.value = String(answers[i]).trim();
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
      #FIX_PANEL { width: 90% !important; max-width: 350px; }
      #FIX_CFG { width: 90% !important; padding: 15px; }
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
    #minimize_btn:hover { background: #ffff00; transform: scale(1.1); }

    #FIX_PANEL.minimized { width: 200px !important; height: 50px !important; }
    #FIX_PANEL.minimized #panel_content { display: none; }

    #fix_log {
      max-height: 40vh;
      overflow-y: auto;
      margin: 15px 0;
      padding-right: 5px;
    }

    #fix_log::-webkit-scrollbar,
    #FIX_PANEL::-webkit-scrollbar,
    #FIX_CFG::-webkit-scrollbar { width: 6px; }

    #fix_log::-webkit-scrollbar-thumb,
    #FIX_PANEL::-webkit-scrollbar-thumb,
    #FIX_CFG::-webkit-scrollbar-thumb { background: #0f0; border-radius: 3px; }

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
    .cfg-btn:active { transform: translateY(0); }
    .cfg-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

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
    #cfg_close_btn:active { transform: scale(0.95) rotate(90deg); }

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

    #FIX_CFG input[type="checkbox"] { width: 18px; height: 18px; margin-right: 10px; cursor: pointer; }
    #FIX_CFG label { display: flex; align-items: center; margin: 10px 0; cursor: pointer; font-size: 15px; }
    #FIX_CFG select { cursor: pointer; }
    #FIX_CFG select option { background: #000; color: #0f0; }

    .bank-item {
      background: rgba(0,0,0,0.4);
      padding: 15px;
      border-radius: 10px;
      margin: 10px 0;
      border: 2px solid rgba(0,255,0,0.2);
      transition: all 0.3s;
      position: relative;
    }
    .bank-item.disabled { opacity: 0.5; }
    .bank-item:hover { border-color: rgba(0,255,0,0.5); }

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

    .btn-group { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .btn-group button { flex: 1; min-width: 120px; }

    #progress_bar { width: 100%; height: 6px; background: rgba(0,255,0,0.2); border-radius: 3px; margin: 10px 0; overflow: hidden; }
    #progress_fill { height: 100%; background: linear-gradient(90deg, #0f0, #00ff00); width: 0%; transition: width 0.3s; }

    .stats-box { background: rgba(0,255,0,0.1); padding: 10px; border-radius: 8px; margin: 10px 0; font-size: 13px; }
    .stats-item { display: flex; justify-content: space-between; padding: 5px 0; }

    .ai-provider-hint {
      background: rgba(0,0,0,0.75);
      padding: 10px 12px;
      border-radius: 6px;
      margin: 10px 0;
      border-left: 3px solid #0f0;
      font-size: 13px;
      line-height: 1.7;
      color: #c8ffc8;
    }
    .ai-provider-hint strong { color: #ffff66; font-weight: bold; }
    .ai-provider-hint code {
      display: inline-block;
      padding: 0 2px;
      margin: 0 2px;
      border-radius: 0;
      background: transparent !important;
      border: none;
      color: #ffff66;
      font-size: 13px;
      font-weight: bold;
      font-family: "Consolas","Monaco",monospace;
      text-shadow: none;
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
          <span style="font-size:18px;">📊 传智满分助手 v13.12</span>
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
          <div id="progress_bar"><div id="progress_fill"></div></div>
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

      const aiProviderOptions = Object.entries(AI_MODELS)
        .map(
          ([key, model]) =>
            `<option value="${key}" ${
              this.config.ai_provider === key ? "selected" : ""
            }>${model.name}</option>`
        )
        .join("");

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
          <h3>🤖 AI配置 (全模型/中转通用)</h3>
          <label>
            <input type="checkbox" id="ai_sw" ${
              this.config.ai_enabled ? "checked" : ""
            }>
            启用AI答题(题库找不到时使用)
          </label>

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
          <input type="text" id="ai_model" value="${
            this.config.ai_model
          }" placeholder="例如: gpt-4o-mini">

          <div id="ai_url_section">
            <label style="font-size: 14px; margin-top: 10px;">API地址 (URL):</label>
            <input type="text" id="ai_u" placeholder="API 请求地址" value="${
              this.config.ai_url
            }">
            <div class="ai-provider-hint" style="margin-top:5px; font-size:11px; padding:5px;">
              <strong>提示:</strong> 使用 Gemini 官方接口时, URL 中需保留 <code>{model}</code> 占位符, 由脚本自动替换为上方模型名称。
            </div>
          </div>

          <button id="test_ai" class="cfg-btn" style="background: linear-gradient(135deg, #ffff66, #ffcc00) !important; margin-top: 10px;">
            🔍 测试AI连通性
          </button>
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
      document.getElementById("minimize_btn").onclick = () => {
        const panel = document.getElementById("FIX_PANEL");
        panel.classList.toggle("minimized");
        document.getElementById("minimize_btn").textContent =
          panel.classList.contains("minimized") ? "+" : "−";
      };

      document.getElementById("open_cfg").onclick = () => {
        document.getElementById("FIX_CFG").style.display = "block";
      };

      document.getElementById("cfg_close_btn").onclick = () => {
        document.getElementById("FIX_CFG").style.display = "none";
      };

      document.getElementById("save_cfg").onclick = () => this.saveConfig();

      document.getElementById("start_answer").onclick = () =>
        this.startAnswering();

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

      document.getElementById("ai_provider").onchange = (e) => {
        const provider = e.target.value;
        const providerConfig = AI_MODELS[provider];
        const urlInput = document.getElementById("ai_u");
        const modelInput = document.getElementById("ai_model");

        this.config.ai_provider = provider;
        modelInput.value = providerConfig.defaultModel;
        modelInput.placeholder = `例如: ${providerConfig.defaultModel}`;
        urlInput.value = providerConfig.endpoint;

        Logger.info(`已切换厂商: ${providerConfig.name}, 请确认模型名称`);
      };

      document.getElementById("toggle_ai_key").onclick = (e) => {
        const input = document.getElementById("ai_k");
        input.type = input.type === "password" ? "text" : "password";
        e.target.textContent = input.type === "password" ? "显示" : "隐藏";
      };

      document.getElementById("clear_cache").onclick = () => {
        if (confirm("确定清空所有缓存?")) {
          CacheManager.clear();
          this.updateStats();
          Logger.success("缓存已清空");
        }
      };

      document.getElementById("clear_log").onclick = () => {
        Logger.clear();
        Logger.success("日志已清空");
      };

      document.getElementById("export_config").onclick = () => {
        ConfigManager.export();
        Logger.success("配置已导出");
      };

      document.getElementById("export_log").onclick = () => {
        Logger.export();
        Logger.success("日志已导出");
      };

      document.getElementById("test_ai").onclick = () => this.testAIConfig();

      document.addEventListener("keydown", (e) => {
        if (
          e.key === "Escape" &&
          document.getElementById("FIX_CFG").style.display === "block"
        ) {
          document.getElementById("FIX_CFG").style.display = "none";
        }
      });
    },

    async testAIConfig() {
      try {
        const ai_enabled = document.getElementById("ai_sw").checked;
        const ai_key = document.getElementById("ai_k").value.trim();
        const ai_provider = document.getElementById("ai_provider").value;
        let ai_url = document.getElementById("ai_u").value.trim();
        const ai_model = document.getElementById("ai_model").value.trim();

        if (!ai_enabled) return alert("请先勾选【启用AI答题】再测试。");
        if (!ai_key || !ai_model)
          return alert("请先填写 API Key 和 模型名称。");
        if (!ai_url) ai_url = AI_MODELS[ai_provider].endpoint;

        const tempConfig = {
          ai_enabled: true,
          ai_provider,
          ai_key,
          ai_url,
          ai_model,
        };

        Logger.info("正在测试 AI 配置，请稍等...");
        const prompt = '只输出 JSON：{"answers":["OK"]}';
        const res = await APIClient.queryAIWithRepair(
          tempConfig,
          prompt,
          "测试"
        );
        const preview = (res || "").toString().slice(0, 80);
        Logger.success("AI 测试成功, 返回: " + preview);
        alert("AI 测试成功！\n返回内容(前80字):\n" + preview);
      } catch (err) {
        Logger.error("AI 测试失败: " + err.message);
        alert("AI 测试失败:\n" + err.message);
      }
    },

    saveConfig() {
      this.config.ai_enabled = document.getElementById("ai_sw").checked;
      this.config.ai_provider = document.getElementById("ai_provider").value;
      this.config.ai_key = document.getElementById("ai_k").value.trim();
      this.config.ai_url = document.getElementById("ai_u").value.trim();
      this.config.ai_model = document.getElementById("ai_model").value.trim();
      this.config.logLevel = document.getElementById("log_level").value;

      if (!this.config.ai_url) {
        const provider = AI_MODELS[this.config.ai_provider];
        this.config.ai_url = provider.endpoint;
      }

      const errors = ConfigManager.validate(this.config);
      if (errors.length > 0) return alert("配置错误:\n\n" + errors.join("\n"));

      ConfigManager.save(this.config);
      document.getElementById("FIX_CFG").style.display = "none";

      Logger.success("配置已保存");
      Logger.init(this.config.logLevel);
      QuestionProcessor.init(this.config);
      this.updateStats();

      if (this.config.ai_enabled) {
        const providerName = AI_MODELS[this.config.ai_provider]?.name || "AI";
        Logger.info(
          `AI已启用: ${providerName} (模型: ${this.config.ai_model})`
        );
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
      this.updateStatus(`处理中: ${current}/${total} (${percent.toFixed(1)}%)`);
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
      const results = { success: 0, failed: 0, skipped: 0, error: 0 };

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
          await Utils.sleep(650);
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
        if (!isDragging) return;
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

    try {
      [
        "visibilitychange",
        "webkitvisibilitychange",
        "mozvisibilitychange",
        "msvisibilitychange",
        "blur",
        "focus",
      ].forEach((e) => {
        window.addEventListener(e, (ev) => ev.stopImmediatePropagation(), true);
      });

      const desc =
        Object.getOwnPropertyDescriptor(document, "hidden") ||
        Object.getOwnPropertyDescriptor(Document.prototype || {}, "hidden");

      if (!desc || desc.configurable) {
        Object.defineProperty(document, "hidden", {
          get: () => false,
          configurable: true,
        });
        Logger.debug("已重写 document.hidden 属性");
      } else {
        Logger.debug("document.hidden 为不可配置属性，跳过重写");
      }

      if (typeof document.hasFocus === "function") {
        document.hasFocus = () => true;
        Logger.debug("已重写 document.hasFocus");
      }

      Logger.debug("防检测已启用(兼容模式)");
    } catch (e) {
      Logger.warn("防检测启用失败, 已降级处理: " + e.message);
    }
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

      Logger.success("脚本加载完成 v13.12（判断题彻底修复）");

      const enabledBanks = config.banks.filter((b) => b.enabled && b.token);
      if (enabledBanks.length > 0)
        Logger.info(`已配置 ${enabledBanks.length} 个题库`);
      else Logger.warn("未配置题库");

      if (config.ai_enabled && config.ai_key) {
        const providerName = AI_MODELS[config.ai_provider]?.name || "AI";
        Logger.info(`AI已启用: ${providerName} (${config.ai_model})`);
      }

      await Utils.sleep(1200);
      const questions = QuestionProcessor.detectQuestions();
      if (questions.length > 0) {
        Logger.success(`检测到 ${questions.length} 道题目`);
        UIManager.updateStatus(`检测到 ${questions.length} 道题,点击开始答题`);
      } else {
        Logger.info("等待题目加载...");
      }
    } catch (error) {
      console.error("[传智助手] 初始化失败:", error);
      alert(`脚本初始化失败:${error.message}`);
    }
  }

  // ================ 启动 ================
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 100);

  window.addEventListener("error", (e) => {
    Logger.error(`全局错误: ${e.message}`);
    console.error(e);
  });

  window.addEventListener("unhandledrejection", (e) => {
    Logger.error(`未处理的Promise错误: ${e.reason}`);
    console.error(e);
  });
})();
