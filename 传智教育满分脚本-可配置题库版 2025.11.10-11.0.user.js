// ==UserScript==
// @name         传智教育满分脚本-可配置题库版 2025.11.10
// @namespace    https://stu.ityxb.com/
// @version      11.2
// @description  修复粘贴快捷键按钮 + 可配置题库 + 言溪题库标准接口
// @author       小羊优化版
// @match        https://stu.ityxb.com/*
// @match        https://stu.ityxb.com/writePaper/*
// @connect      tk.enncy.cn
// @connect      openai.proxy.com
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

  // ================ 配置存储 ================
  let CONFIG = GM_getValue("chuanzhi_config_v11", {
    // AI配置
    gpt_enabled: false,
    gpt_key: "",
    gpt_url: "https://api.openai.com/v1/chat/completions",
    gpt_model: "gpt-4o-mini",

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
  });

  // ================ 防检测（修复版）============
  function applyAntiDetection() {
    if (!window.location.href.includes("/writePaper/")) return;
    ["visibilitychange", "blur", "focus"].forEach((e) => {
      window.addEventListener(e, (ev) => ev.stopImmediatePropagation(), true);
    });
    Object.defineProperty(document, "hidden", { get: () => false });
    document.hasFocus = () => true;
  }

  // ================ 启用粘贴 ================
  function enablePaste() {
    const inputs = document.querySelectorAll(
      '#FIX_CFG input[type="text"], #FIX_CFG input[type="password"]'
    );
    inputs.forEach((input) => {
      input.addEventListener("paste", (e) => e.stopPropagation());
      if (input.type === "password") {
        const eye = document.createElement("span");
        eye.textContent = "👁";
        eye.style.cssText =
          "margin-left: -30px; cursor: pointer; font-size: 16px;";
        eye.onclick = () =>
          (input.type = input.type === "password" ? "text" : "password");
        input.parentNode.style.position = "relative";
        input.parentNode.appendChild(eye);
        input.style.paddingRight = "35px";
      }
    });
  }

  // 在打开配置面板时调用
  openBtn.onclick = () => {
    document.getElementById("FIX_CFG").style.display = "block";
    setTimeout(enablePaste, 100);
  };

  // ================ 样式 ================
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
            resize: both;
            overflow: auto;
            cursor: move;
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
        .resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 20px;
            height: 20px;
            cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, #0f0 50%);
            border-radius: 0 0 12px 0;
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
            resize: none;
        }
        #FIX_PANEL.minimized #panel_content {
            display: none;
        }
        #FIX_PANEL.minimized .resize-handle {
            display: none;
        }
        #fix_log {
            max-height: 50vh;
            overflow-y: auto;
            margin: 15px 0;
            padding-right: 5px;
        }
        #fix_log::-webkit-scrollbar {
            width: 6px;
        }
        #fix_log::-webkit-scrollbar-thumb {
            background: #0f0;
            border-radius: 3px;
        }
        #FIX_PANEL::-webkit-scrollbar {
            width: 8px;
        }
        #FIX_PANEL::-webkit-scrollbar-thumb {
            background: #0f0;
            border-radius: 4px;
        }
        .log-e {
            margin: 8px 0;
            padding: 10px;
            background: rgba(0, 255, 0, 0.08);
            border-radius: 8px;
            border-left: 4px solid #0f0;
            font-size: 13px;
            line-height: 1.5;
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
            z-index: 9999999999;
            width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 0 100px rgba(0,255,0,0.8);
        }
        #FIX_CFG::-webkit-scrollbar {
            width: 8px;
        }
        #FIX_CFG::-webkit-scrollbar-thumb {
            background: #0f0;
            border-radius: 4px;
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
        #FIX_CFG input[type="password"] {
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
        }
        #FIX_CFG input[type="text"]:focus,
        #FIX_CFG input[type="password"]:focus {
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
        .bank-item {
            background: rgba(0,0,0,0.4);
            padding: 15px;
            border-radius: 10px;
            margin: 10px 0;
            border: 2px solid rgba(0,255,0,0.2);
        }
        .bank-item.disabled {
            opacity: 0.5;
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
        }
        .btn-group button {
            flex: 1;
        }
        #add_bank {
            background: linear-gradient(135deg, #00ccff, #0099ff) !important;
        }
        #add_bank:hover {
            background: linear-gradient(135deg, #00ffff, #00ccff) !important;
        }
    `);

  // ================ 界面初始化 ================
  function initUI() {
    // 主面板
    const panel = document.createElement("div");
    panel.id = "FIX_PANEL";
    panel.innerHTML = `
            <div id="panel_header">
                <span style="font-size:18px;">📊 传智满分助手 v11.0</span>
                <button id="minimize_btn" title="最小化/还原">−</button>
            </div>
            <div id="panel_content">
                <button id="open_cfg" class="cfg-btn">⚙️ 题库配置</button>
                <button id="start_answer" class="cfg-btn" style="background: linear-gradient(135deg, #ff0, #ffcc00) !important;">
                    ▶️ 开始答题
                </button>
                <div id="fix_log"></div>
                <div style="text-align:center;color:#ff0;font-size:15px;margin-top:12px;text-shadow: 0 0 8px #ff0;" id="fix_status">
                    等待开始...
                </div>
            </div>
            <div class="resize-handle" title="拖动调整大小"></div>
        `;
    document.body.appendChild(panel);

    // 拖动功能
    makeDraggable(panel);

    // 配置弹窗
    const cfg = document.createElement("div");
    cfg.id = "FIX_CFG";
    cfg.innerHTML = `
            <div style="font-size:24px;text-align:center;margin-bottom:20px;text-shadow: 0 0 10px #0f0;">
                ⚙️ 配置中心
            </div>

            <div class="cfg-section">
                <h3>📚 题库配置</h3>
                <div id="banks_list"></div>
                <button id="add_bank" class="cfg-btn">➕ 添加新题库</button>
            </div>

            <div class="cfg-section">
                <h3>🤖 AI配置（兜底）</h3>
                <label>
                    <input type="checkbox" id="gpt_sw" ${
                      CONFIG.gpt_enabled ? "checked" : ""
                    }>
                    启用GPT兜底（题库找不到时使用）
                </label>
                <input type="text" id="gpt_k" placeholder="粘贴你的 GPT API Key" value="${
                  CONFIG.gpt_key
                }">
                <input type="text" id="gpt_u" placeholder="GPT API URL（默认即可）" value="${
                  CONFIG.gpt_url
                }">
            </div>

            <div class="btn-group">
                <button id="save_cfg" class="cfg-btn">💾 保存配置</button>
                <button id="close_cfg" class="cfg-btn" style="background: linear-gradient(135deg, #666, #444) !important;">❌ 取消</button>
            </div>
        `;
    document.body.appendChild(cfg);

    renderBanksList();
    bindEvents();
  }

  // ================ 拖动功能 ================
  function makeDraggable(element) {
    const header = element.querySelector("#panel_header");
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.addEventListener("mousedown", dragStart);

    function dragStart(e) {
      if (e.target.id === "minimize_btn") return;

      initialX = e.clientX - element.offsetLeft;
      initialY = e.clientY - element.offsetTop;

      if (e.target === header || e.target.parentElement === header) {
        isDragging = true;
        element.style.cursor = "grabbing";
      }
    }

    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", dragEnd);

    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        // 边界限制
        const maxX = window.innerWidth - element.offsetWidth;
        const maxY = window.innerHeight - element.offsetHeight;

        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));

        element.style.left = currentX + "px";
        element.style.top = currentY + "px";
        element.style.right = "auto";
      }
    }

    function dragEnd() {
      if (isDragging) {
        isDragging = false;
        element.style.cursor = "move";
      }
    }
  }

  // ================ 渲染题库列表 ================
  function renderBanksList() {
    const list = document.getElementById("banks_list");
    if (!list) return;

    list.innerHTML = CONFIG.banks
      .map(
        (bank, index) => `
            <div class="bank-item ${
              !bank.enabled ? "disabled" : ""
            }" data-index="${index}">
                <label>
                    <input type="checkbox" class="bank-toggle" data-index="${index}" ${
          bank.enabled ? "checked" : ""
        }>
                    <strong>${bank.name}</strong>
                </label>
                <input type="text" placeholder="题库名称" value="${bank.name}"
                    onchange="updateBank(${index}, 'name', this.value)">
                <input type="text" placeholder="题库URL" value="${bank.url}"
                    onchange="updateBank(${index}, 'url', this.value)">
                <input type="password" placeholder="Token/Key（如有）" value="${
                  bank.token || ""
                }"
                    onchange="updateBank(${index}, 'token', this.value)"
                    style="font-family: monospace;">
                <button class="cfg-btn" onclick="deleteBank(${index})"
                    style="background: linear-gradient(135deg, #f00, #c00) !important; margin-top: 10px;">
                    🗑️ 删除此题库
                </button>
            </div>
        `
      )
      .join("");

    // 绑定复选框事件
    list.querySelectorAll(".bank-toggle").forEach((cb) => {
      cb.onchange = function () {
        const idx = parseInt(this.dataset.index);
        CONFIG.banks[idx].enabled = this.checked;
        renderBanksList();
      };
    });
  }

  // ================ 全局函数（供HTML调用）================
  window.updateBank = function (index, field, value) {
    CONFIG.banks[index][field] = value;
  };

  window.deleteBank = function (index) {
    if (confirm(`确定删除题库"${CONFIG.banks[index].name}"？`)) {
      CONFIG.banks.splice(index, 1);
      renderBanksList();
      log(`已删除题库`, "info");
    }
  };

  // ================ 事件绑定 ================
  function bindEvents() {
    setTimeout(() => {
      const openBtn = document.getElementById("open_cfg");
      const saveBtn = document.getElementById("save_cfg");
      const closeBtn = document.getElementById("close_cfg");
      const startBtn = document.getElementById("start_answer");
      const addBankBtn = document.getElementById("add_bank");
      const minimizeBtn = document.getElementById("minimize_btn");
      const panel = document.getElementById("FIX_PANEL");

      if (openBtn) {
        openBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById("FIX_CFG").style.display = "block";
          log("打开配置面板", "info");
        };
      }

      if (saveBtn) {
        saveBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          CONFIG.gpt_enabled = document.getElementById("gpt_sw").checked;
          CONFIG.gpt_key = document.getElementById("gpt_k").value.trim();
          CONFIG.gpt_url = document.getElementById("gpt_u").value.trim();

          GM_setValue("chuanzhi_config_v11", CONFIG);
          document.getElementById("FIX_CFG").style.display = "none";
          log("✅ 配置保存成功", "info");
          updateStatus("配置已保存");
        };
      }

      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById("FIX_CFG").style.display = "none";
        };
      }

      if (startBtn) {
        startBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          startAnswering();
        };
      }

      if (addBankBtn) {
        addBankBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          CONFIG.banks.push({
            name: "新题库",
            enabled: true,
            url: "https://",
            method: "GET",
            token: "",
          });
          renderBanksList();
          log("已添加新题库", "info");
        };
      }

      if (minimizeBtn && panel) {
        minimizeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          panel.classList.toggle("minimized");
          minimizeBtn.textContent = panel.classList.contains("minimized")
            ? "+"
            : "−";
        };
      }
    }, 500);
  }

  // ================ 日志系统 ================
  function log(msg, type = "info") {
    const logDiv = document.getElementById("fix_log");
    if (!logDiv) return;

    const colors = {
      info: "#0ff",
      success: "#0f0",
      error: "#f00",
      warn: "#ff0",
      cache: "#f0f",
    };

    const entry = document.createElement("div");
    entry.className = "log-e";
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    entry.innerHTML = `
            <span style="color:${colors[type] || "#0ff"};">[${time}]</span>
            ${msg}
        `;
    logDiv.insertBefore(entry, logDiv.firstChild);

    while (logDiv.children.length > 100) {
      logDiv.removeChild(logDiv.lastChild);
    }
  }

  function updateStatus(msg) {
    const status = document.getElementById("fix_status");
    if (status) status.textContent = msg;
  }

  // ================ 题目检测 ================
  function detectQuestions() {
    const selectors = [
      ".questionItem",
      ".question-item-box",
      ".question-item",
      ".item-box",
      '[class*="question"][class*="item"]',
    ];

    for (const sel of selectors) {
      const questions = document.querySelectorAll(sel);
      if (questions.length > 0) {
        log(`使用选择器: ${sel}`, "info");
        return Array.from(questions);
      }
    }
    return [];
  }

  // ================ 答题主流程 ================
  const cache = GM_getValue("tiku_cache_v11", {});
  let processing = false;

  function startAnswering() {
    if (processing) {
      log("⚠️ 答题进行中，请勿重复点击", "warn");
      return;
    }

    const questions = detectQuestions();
    if (questions.length === 0) {
      log("❌ 未检测到题目，请刷新页面后重试", "error");
      updateStatus("未检测到题目");
      alert(
        "未检测到题目！\n\n可能原因：\n1. 页面未完全加载\n2. 题目结构已变化\n\n请刷新页面后重试"
      );
      return;
    }

    processing = true;
    log(`🚀 开始处理 ${questions.length} 道题目`, "success");
    updateStatus(`处理中: 0/${questions.length}`);

    let completed = 0;
    const interval = setInterval(() => {
      if (completed >= questions.length) {
        clearInterval(interval);
        processing = false;
        updateStatus(`🎉 完成 ${completed}/${questions.length} 题`);
        log(`🎉 全部题目处理完成！`, "success");
        setTimeout(() => {
          alert(
            `答题完成！\n\n已处理: ${completed}/${questions.length} 题\n\n请检查后提交试卷`
          );
        }, 500);
        return;
      }

      processQuestion(questions[completed], completed + 1, questions.length);
      completed++;
    }, 1000);
  }

  function processQuestion(element, num, total) {
    if (element.querySelector(".answer-mark")) {
      log(`第${num}题 已处理，跳过`, "info");
      updateStatus(`处理中: ${num}/${total}`);
      return;
    }

    const titleSelectors = [
      ".question-title-box .myEditorTxt",
      ".stem",
      ".title",
      ".question-title",
      ".question-stem",
    ];

    let questionText = "";
    for (const sel of titleSelectors) {
      const el = element.querySelector(sel);
      if (el && el.innerText.trim()) {
        questionText = el.innerText.trim();
        break;
      }
    }

    if (!questionText) {
      const lines = element.innerText.split("\n").filter((l) => l.trim());
      questionText = lines[0] || "";
    }

    if (!questionText || questionText.length < 5) {
      log(`第${num}题 无法提取题目`, "error");
      updateStatus(`处理中: ${num}/${total}`);
      return;
    }

    // 提取选项（用于言溪题库）
    const options = extractOptions(element);
    const type = detectQuestionType(element);

    log(`第${num}题: ${questionText.substring(0, 40)}...`, "info");

    if (cache[questionText]) {
      fillAnswer(element, cache[questionText], "cache", num);
      log(`第${num}题 [缓存] 命中`, "cache");
      updateStatus(`处理中: ${num}/${total} [缓存]`);
      return;
    }

    queryBanks(questionText, options, type, element, num, total);
  }

  // ================ 提取选项 ================
  function extractOptions(element) {
    const optionElements = element.querySelectorAll(
      ".option, .radio_item, label"
    );
    const options = [];

    optionElements.forEach((opt) => {
      const text = opt.innerText.trim();
      if (text) options.push(text);
    });

    return options.join("###");
  }

  // ================ 检测题型 ================
  function detectQuestionType(element) {
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
  }

  // ================ 查询题库 ================
  function queryBanks(question, options, type, element, num, total) {
    const enabledBanks = CONFIG.banks.filter((b) => b.enabled);

    // 如果没有启用的题库，直接使用AI
    if (enabledBanks.length === 0) {
      if (CONFIG.gpt_enabled && CONFIG.gpt_key) {
        log(`第${num}题 没有启用题库，使用AI答题`, "info");
        queryGPT(question, element, num, total);
      } else {
        log(`第${num}题 没有启用题库且未配置AI`, "error");
        updateStatus(`处理中: ${num}/${total} [无题库/AI]`);
      }
      return;
    }

    let bankIndex = 0;

    function tryNext() {
      if (bankIndex >= enabledBanks.length) {
        // 所有题库都没找到答案，使用AI兜底
        if (CONFIG.gpt_enabled && CONFIG.gpt_key) {
          log(`第${num}题 题库未找到答案，使用AI兜底`, "warn");
          queryGPT(question, element, num, total);
        } else {
          log(`第${num}题 所有题库未找到答案且未配置AI`, "error");
          updateStatus(`处理中: ${num}/${total} [未找到]`);
        }
        return;
      }

      const bank = enabledBanks[bankIndex];

      // 构建请求URL（言溪题库标准格式）
      let url = bank.url;
      if (bank.method === "GET") {
        const params = new URLSearchParams({
          token: bank.token || "",
          title: question,
          options: options,
          type: type,
        });
        url += "?" + params.toString();
      }

      GM_xmlhttpRequest({
        method: bank.method,
        url: url,
        headers: {
          "Content-Type": "application/json",
        },
        data:
          bank.method === "POST"
            ? JSON.stringify({
                token: bank.token || "",
                title: question,
                options: options,
                type: type,
              })
            : undefined,
        timeout: 10000,
        onload: (response) => {
          try {
            if (response.status === 200) {
              const data = JSON.parse(response.responseText);

              // 言溪题库标准返回格式
              let answer = null;
              if (data.code === 0 && data.data) {
                answer = data.data.answer || data.data;
              } else if (data.answer) {
                answer = data.answer;
              } else if (data.data) {
                answer = data.data;
              }

              if (answer && typeof answer === "string" && answer.length > 0) {
                cache[question] = answer;
                GM_setValue("tiku_cache_v11", cache);
                fillAnswer(element, answer, bank.name, num);
                log(`第${num}题 [${bank.name}] ${answer}`, "success");
                updateStatus(`处理中: ${num}/${total} [${bank.name}]`);
                return;
              }
            }
          } catch (e) {
            console.error(`题库${bank.name}解析错误:`, e);
          }

          bankIndex++;
          setTimeout(tryNext, 300);
        },
        onerror: () => {
          log(`第${num}题 [${bank.name}] 请求失败`, "error");
          bankIndex++;
          setTimeout(tryNext, 300);
        },
        ontimeout: () => {
          log(`第${num}题 [${bank.name}] 超时`, "warn");
          bankIndex++;
          setTimeout(tryNext, 300);
        },
      });
    }

    tryNext();
  }

  // ================ GPT查询 ================
  function queryGPT(question, element, num, total) {
    GM_xmlhttpRequest({
      method: "POST",
      url: CONFIG.gpt_url,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.gpt_key}`,
      },
      data: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: `${question}\n\n请直接给出答案，多个答案用#分隔`,
          },
        ],
      }),
      timeout: 30000,
      onload: (response) => {
        try {
          const data = JSON.parse(response.responseText);
          const answer = data.choices[0].message.content.trim();
          cache[question] = answer;
          GM_setValue("tiku_cache_v11", cache);
          fillAnswer(element, answer, "GPT", num);
          log(`第${num}题 [GPT] ${answer}`, "success");
          updateStatus(`处理中: ${num}/${total} [GPT]`);
        } catch (e) {
          log(`第${num}题 GPT解析失败`, "error");
          updateStatus(`处理中: ${num}/${total} [GPT失败]`);
        }
      },
      onerror: () => {
        log(`第${num}题 GPT请求失败`, "error");
        updateStatus(`处理中: ${num}/${total} [GPT失败]`);
      },
    });
  }

  // ================ 填充答案 ================
  function fillAnswer(element, answer, source, num) {
    const mark = document.createElement("div");
    mark.className = "answer-mark";
    mark.innerHTML = `✅ [${source}] 答案: ${answer}`;

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

    // 处理选择题
    const options = element.querySelectorAll(
      'label, .option, .radio_item, input[type="radio"], input[type="checkbox"]'
    );
    options.forEach((option) => {
      let optionText = (option.innerText || option.value || "").trim();
      optionText = optionText
        .replace(/^[A-Z]\.?\s*/, "")
        .replace(/[\s\n]+/g, "");

      answers.forEach((ans) => {
        const cleanAns = ans
          .replace(/^[A-Z]\.?\s*/, "")
          .replace(/[\s\n]+/g, "");

        if (
          optionText.includes(cleanAns) ||
          cleanAns.includes(optionText) ||
          optionText.toLowerCase() === cleanAns.toLowerCase()
        ) {
          setTimeout(() => {
            option.click();

            const input = option.querySelector("input") || option;
            if (input.tagName === "INPUT") {
              input.checked = true;
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }

            option.dispatchEvent(
              new MouseEvent("click", { bubbles: true, cancelable: true })
            );
          }, 100);
        }
      });
    });

    // 处理填空题
    const inputs = element.querySelectorAll('input[type="text"], textarea');
    inputs.forEach((input, i) => {
      if (answers[i]) {
        input.value = answers[i];
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  // ================ 初始化 ================
  function init() {
    log("🚀 脚本加载完成", "success");
    initUI();

    setTimeout(() => {
      const questions = detectQuestions();
      if (questions.length > 0) {
        log(`检测到 ${questions.length} 道题目`, "success");
        updateStatus(`检测到 ${questions.length} 道题，点击开始答题`);
      } else {
        log("等待题目加载...", "info");
        updateStatus("等待题目加载...");
      }
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 100);
  }
})();
