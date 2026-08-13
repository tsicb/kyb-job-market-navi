(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG;
  const state = {
    loaded: false,
    selectedJobId: null,
    expandLevel: CONFIG.defaultExpandLevel || 2,
    related: [],
    data: {},
    idx: {},
    sort: {
      summary: { key: null, direction: null },
      prefecture: { key: null, direction: null },
      conditions: { key: null, direction: null }
    }
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    dataStatus: $("dataStatus"),
    keywordInput: $("keywordInput"),
    clearKeyword: $("clearKeyword"),
    suggestions: $("suggestions"),
    majorSelect: $("majorSelect"),
    middleSelect: $("middleSelect"),
    showCategoryJobs: $("showCategoryJobs"),
    categoryCandidates: $("categoryCandidates"),
    selectedPanel: $("selectedPanel"),
    selectedJobCard: $("selectedJobCard"),
    levelButtons: $("levelButtons"),
    relatedCount: $("relatedCount"),
    resultsPanel: $("resultsPanel"),
    lastUpdated: $("lastUpdated"),
    summaryHighlights: $("summaryHighlights"),
    summaryTable: $("summaryTable"),
    prefMode: $("prefMode"),
    prefectureControl: $("prefectureControl"),
    prefectureControlLabel: $("prefectureControlLabel"),
    prefectureSelect: $("prefectureSelect"),
    prefJobControl: $("prefJobControl"),
    prefJobControlLabel: $("prefJobControlLabel"),
    prefJobSelect: $("prefJobSelect"),
    prefEmployment: $("prefEmployment"),
    prefCaption: $("prefCaption"),
    prefTable: $("prefTable"),
    monthlyEmployment: $("monthlyEmployment"),
    monthlyJobLimit: $("monthlyJobLimit"),
    monthlyChartTitle: $("monthlyChartTitle"),
    monthlyChart: $("monthlyChart"),
    monthlyTable: $("monthlyTable"),
    conditionJobSelect: $("conditionJobSelect"),
    conditionEmployment: $("conditionEmployment"),
    conditionTable: $("conditionTable"),
    toast: $("toast")
  };

  const PREFECTURES = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
    "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
    "新潟県","富山県","石川県","福井県","山梨県","長野県",
    "岐阜県","静岡県","愛知県","三重県",
    "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
    "鳥取県","島根県","岡山県","広島県","山口県",
    "徳島県","香川県","愛媛県","高知県",
    "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
  ];

  const EMP = {
    regular: {
      label: "正社員",
      summarySalary: "regular_salary_median_10k_yen",
      prefSalary: "regular_salary_10k_yen",
      monthly: "regular_jobs",
      condition: "regular_salary_10k_yen",
      salaryUnit: "万円"
    },
    parttime: {
      label: "パート",
      summarySalary: "parttime_salary_median_yen_hour",
      prefSalary: "parttime_salary_yen_hour",
      monthly: "parttime_jobs",
      condition: "parttime_salary_yen_hour",
      salaryUnit: "円/時"
    },
    temp: {
      label: "派遣",
      summarySalary: "temp_salary_median_yen_hour",
      prefSalary: "temp_salary_yen_hour",
      monthly: "temp_jobs",
      condition: "temp_salary_yen_hour",
      salaryUnit: "円/時"
    }
  };

  const LOADER = {
    requestTimeoutMs: Number(CONFIG.loader?.requestTimeoutMs) || 10000,
    retries: Math.max(1, Number(CONFIG.loader?.retries) || 3),
    retryBaseDelayMs: Math.max(100, Number(CONFIG.loader?.retryBaseDelayMs) || 700),
    csvConcurrency: Math.max(1, Number(CONFIG.loader?.csvConcurrency) || 2),
    cacheName: CONFIG.loader?.cacheName || "job-market-navi-market-v1",
    cacheMetaKey: CONFIG.loader?.cacheMetaKey || "job-market-navi-market-cache-meta-v1"
  };

  const MARKET_DATASETS = [
    { key: "jobSummary", label: "職種マスタ", url: CONFIG.csv.jobSummary, requiredColumn: "job_id" },
    { key: "prefecture", label: "都道府県別給与", url: CONFIG.csv.prefectureSalary, requiredColumn: "job_id" },
    { key: "monthly", label: "月別求人数", url: CONFIG.csv.monthlyJobs, requiredColumn: "job_id" },
    { key: "conditions", label: "条件別給与", url: CONFIG.csv.conditionSalary, requiredColumn: "job_id" }
  ];

  const STATIC_DATASETS = [
    { key: "classification", label: "職種分類マスタ", url: CONFIG.json.classification, requiredColumn: "job_id" },
    { key: "tags", label: "職種タグマスタ", url: CONFIG.json.tags, requiredColumn: "job_id" },
    { key: "relations", label: "職種関連マスタ", url: CONFIG.json.relations, requiredColumn: "source_job_id" }
  ];

  function normalize(s) {
    return String(s ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s　]+/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function numberOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function formatInt(v) {
    const n = numberOrNull(v);
    return n === null ? "—" : Math.round(n).toLocaleString("ja-JP");
  }

  function formatSalary(v, employment) {
    const n = numberOrNull(v);
    if (n === null) return "—";
    return employment === "regular"
      ? `${Math.round(n).toLocaleString("ja-JP")}万円`
      : `${Math.round(n).toLocaleString("ja-JP")}円`;
  }

  function formatDiff(v, employment) {
    const n = numberOrNull(v);
    if (n === null) return "—";
    const unit = employment === "regular" ? "万円" : "円";
    if (n === 0) return `0${unit}`;
    return `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("ja-JP")}${unit}`;
  }

  function formatRatio(v) {
    const n = numberOrNull(v);
    return n === null ? "—" : `${n.toFixed(2)}倍`;
  }

  function compactNumber(v) {
    const n = numberOrNull(v);
    if (n === null) return "—";
    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
    return String(Math.round(n));
  }

  function metricClass(v, neutral = 0) {
    const n = numberOrNull(v);
    if (n === null || n === neutral) return "neutral";
    return n > neutral ? "positive" : "negative";
  }

  function resetSort(tableName) {
    if (!state.sort[tableName]) return;
    state.sort[tableName] = { key: null, direction: null };
  }

  function resetAllSorts() {
    resetSort("summary");
    resetSort("prefecture");
    resetSort("conditions");
  }

  function cycleSort(tableName, key) {
    const current = state.sort[tableName] || { key: null, direction: null };
    if (current.key !== key || !current.direction) {
      state.sort[tableName] = { key, direction: "desc" };
    } else if (current.direction === "desc") {
      state.sort[tableName] = { key, direction: "asc" };
    } else {
      state.sort[tableName] = { key: null, direction: null };
    }
  }

  function ensureSortKeyVisible(tableName, visibleKeys) {
    const current = state.sort[tableName];
    if (current?.key && !visibleKeys.includes(current.key)) resetSort(tableName);
  }

  function sortRowsNumeric(rows, tableName, valueGetter) {
    const current = state.sort[tableName];
    if (!current?.key || !current.direction) return rows.slice();
    return rows
      .map((row, index) => ({ row, index, value: numberOrNull(valueGetter(row, current.key)) }))
      .sort((a, b) => {
        const aMissing = a.value === null;
        const bMissing = b.value === null;
        if (aMissing && bMissing) return a.index - b.index;
        if (aMissing) return 1;
        if (bMissing) return -1;
        if (a.value !== b.value) {
          return current.direction === "desc" ? b.value - a.value : a.value - b.value;
        }
        return a.index - b.index;
      })
      .map(x => x.row);
  }

  function sortableHeader(tableName, key, label) {
    const current = state.sort[tableName];
    const active = current?.key === key && !!current.direction;
    const icon = !active ? "↕" : current.direction === "desc" ? "▼" : "▲";
    const ariaSort = !active ? "none" : current.direction === "desc" ? "descending" : "ascending";
    const next = !active ? "高い順" : current.direction === "desc" ? "低い順" : "デフォルト順";
    return `<th class="sortable-head${active ? " sort-active" : ""}" aria-sort="${ariaSort}">
      <button type="button" class="sort-header-button" data-sort-table="${tableName}" data-sort-key="${escapeHtml(key)}" aria-label="${escapeHtml(label)}を${next}に並べ替え" title="クリック：${next}">
        <span>${escapeHtml(label)}</span><span class="sort-indicator" aria-hidden="true">${icon}</span>
      </button>
    </th>`;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          quoted = true;
        } else if (ch === ",") {
          row.push(field);
          field = "";
        } else if (ch === "\n") {
          row.push(field.replace(/\r$/, ""));
          rows.push(row);
          row = [];
          field = "";
        } else {
          field += ch;
        }
      }
    }
    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows.shift().map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, "") : h));
    return rows
      .filter(r => r.some(v => v !== ""))
      .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setStatus(text, type = "", title = "") {
    els.dataStatus.textContent = text;
    els.dataStatus.classList.remove("ok", "warn", "error");
    if (type) els.dataStatus.classList.add(type);
    els.dataStatus.title = title || "";
  }

  function clearLoadError() {
    document.querySelectorAll(".load-error-box").forEach(el => el.remove());
  }

  function showLoadError(err) {
    clearLoadError();
    setStatus("データ読込エラー", "error", err?.message || "");
    document.querySelector(".search-panel").insertAdjacentHTML(
      "afterend",
      `<div class="error-box load-error-box"><strong>データを読み込めませんでした。</strong><br>${escapeHtml(err?.message || "不明なエラー")}` +
      `<br>通信が一時的に不安定な可能性があります。少し待ってからページを再読み込みしてください。</div>`
    );
  }

  function isRetryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = LOADER.requestTimeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTextWithRetry(url, label, options = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= LOADER.retries; attempt++) {
      try {
        const res = await fetchWithTimeout(url, { cache: options.cacheMode || "no-cache" });
        if (!res.ok) {
          const err = new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
          err.retryable = isRetryableStatus(res.status);
          throw err;
        }
        return await res.text();
      } catch (err) {
        const timedOut = err?.name === "AbortError";
        const retryable = timedOut || err?.retryable !== false;
        lastError = timedOut
          ? new Error(`${label}: ${Math.round(LOADER.requestTimeoutMs / 1000)}秒でタイムアウト`)
          : err;
        console.warn(`[loader] ${label} attempt ${attempt}/${LOADER.retries} failed`, err);
        if (!retryable || attempt >= LOADER.retries) break;
        const jitter = Math.floor(Math.random() * 250);
        await sleep(LOADER.retryBaseDelayMs * attempt + jitter);
      }
    }
    throw lastError || new Error(`${label}: 取得に失敗しました。`);
  }

  async function fetchJsonWithRetry(url, label) {
    const text = await fetchTextWithRetry(url, label, { cacheMode: "default" });
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`${label}: JSON形式を解析できませんでした。`);
    }
  }

  function validateDataset(label, data, requiredColumn) {
    if (!Array.isArray(data) || !data.length || !(requiredColumn in data[0])) {
      throw new Error(`${label} の形式を確認してください。`);
    }
  }

  async function mapLimit(items, limit, fn) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        await fn(items[index], index);
      }
    });
    await Promise.all(workers);
  }

  function cacheRequest(meta) {
    const u = new URL(`./__market_cache__/${encodeURIComponent(meta.key)}.txt`, location.href);
    return new Request(u.href, { method: "GET" });
  }

  async function readMarketCache() {
    if (!("caches" in window)) return null;
    try {
      const cache = await caches.open(LOADER.cacheName);
      const texts = {};
      const rows = {};
      for (const meta of MARKET_DATASETS) {
        const response = await cache.match(cacheRequest(meta));
        if (!response) return null;
        const text = await response.text();
        const parsed = parseCSV(text);
        validateDataset(`${meta.label}（キャッシュ）`, parsed, meta.requiredColumn);
        texts[meta.key] = text;
        rows[meta.key] = parsed;
      }
      let cachedAt = "";
      try {
        cachedAt = JSON.parse(localStorage.getItem(LOADER.cacheMetaKey) || "{}").cachedAt || "";
      } catch (_) {}
      return { texts, rows, cachedAt };
    } catch (err) {
      console.warn("[loader] cache read failed", err);
      return null;
    }
  }

  async function writeMarketCache(texts) {
    if (!("caches" in window)) return;
    try {
      const cache = await caches.open(LOADER.cacheName);
      for (const meta of MARKET_DATASETS) {
        const text = texts[meta.key];
        if (typeof text !== "string") throw new Error(`${meta.label}: キャッシュ対象データがありません。`);
        await cache.put(
          cacheRequest(meta),
          new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8" } })
        );
      }
      try {
        localStorage.setItem(LOADER.cacheMetaKey, JSON.stringify({ cachedAt: new Date().toISOString() }));
      } catch (_) {}
    } catch (err) {
      // Cache failure must never make the app itself fail.
      console.warn("[loader] cache write failed", err);
    }
  }

  function formatCacheTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }).format(d);
  }

  async function loadStaticData() {
    setStatus("固定マスタを確認中…");
    const values = {};
    await Promise.all(STATIC_DATASETS.map(async meta => {
      const data = await fetchJsonWithRetry(meta.url, meta.label);
      validateDataset(meta.label, data, meta.requiredColumn);
      values[meta.key] = data;
    }));
    return values;
  }

  async function fetchMarketGroup(onProgress = null) {
    const texts = {};
    const rows = {};
    const errors = [];
    let completed = 0;

    await mapLimit(MARKET_DATASETS, LOADER.csvConcurrency, async meta => {
      try {
        const text = await fetchTextWithRetry(meta.url, meta.label, { cacheMode: "no-cache" });
        const parsed = parseCSV(text);
        validateDataset(meta.label, parsed, meta.requiredColumn);
        texts[meta.key] = text;
        rows[meta.key] = parsed;
      } catch (err) {
        errors.push({ label: meta.label, error: err });
      } finally {
        completed++;
        if (onProgress) onProgress(completed, MARKET_DATASETS.length, meta.label);
      }
    });

    if (errors.length) {
      const detail = errors.map(x => `${x.label}（${x.error?.message || "取得失敗"}）`).join(" / ");
      throw new Error(`市場データの取得に失敗しました: ${detail}`);
    }
    return { texts, rows };
  }

  function applyStaticData(values) {
    state.data.classification = values.classification;
    state.data.tags = values.tags;
    state.data.relations = values.relations;
  }

  function applyMarketData(rows) {
    state.data.jobSummary = rows.jobSummary;
    state.data.prefecture = rows.prefecture;
    state.data.monthly = rows.monthly;
    state.data.conditions = rows.conditions;
  }

  function initializeLoadedApp() {
    validateLoadedData();
    buildIndexes();
    initializeControls();
    state.loaded = true;
  }

  function refreshLoadedMarketData(rows) {
    const previous = {
      jobSummary: state.data.jobSummary,
      prefecture: state.data.prefecture,
      monthly: state.data.monthly,
      conditions: state.data.conditions
    };
    try {
      applyMarketData(rows);
      validateLoadedData();
      buildIndexes();
      if (state.selectedJobId) renderAllResults();
    } catch (err) {
      applyMarketData(previous);
      buildIndexes();
      throw err;
    }
  }

  async function refreshMarketInBackground(cachedAt = "") {
    try {
      const fresh = await fetchMarketGroup((done, total) => {
        setStatus(
          `前回データで表示｜最新版確認 ${done}/${total}`,
          "warn",
          cachedAt ? `前回正常取得: ${formatCacheTime(cachedAt)}` : "前回正常取得データを表示中"
        );
      });
      refreshLoadedMarketData(fresh.rows);
      void writeMarketCache(fresh.texts);
      setStatus(`更新確認済み｜${state.data.classification.length}職種`, "ok", `市場データ確認: ${formatCacheTime(new Date().toISOString())}`);
    } catch (err) {
      console.warn("[loader] background refresh failed", err);
      setStatus(
        "前回データで表示｜更新確認失敗",
        "warn",
        `${cachedAt ? `前回正常取得: ${formatCacheTime(cachedAt)} / ` : ""}${err?.message || "最新版の確認に失敗"}`
      );
    }
  }

  async function loadData() {
    clearLoadError();
    try {
      const [staticData, cachedMarket] = await Promise.all([
        loadStaticData(),
        readMarketCache()
      ]);
      applyStaticData(staticData);

      if (cachedMarket) {
        applyMarketData(cachedMarket.rows);
        initializeLoadedApp();
        setStatus(
          "前回データを表示｜最新版確認中…",
          "warn",
          cachedMarket.cachedAt ? `前回正常取得: ${formatCacheTime(cachedMarket.cachedAt)}` : "前回正常取得データを表示中"
        );
        void refreshMarketInBackground(cachedMarket.cachedAt);
        return;
      }

      setStatus("市場データを取得中 0/4…");
      const fresh = await fetchMarketGroup((done, total) => {
        setStatus(`市場データを取得中 ${done}/${total}…`);
      });
      applyMarketData(fresh.rows);
      initializeLoadedApp();
      setStatus(`読込完了｜${state.data.classification.length}職種`, "ok");
      void writeMarketCache(fresh.texts);
    } catch (err) {
      console.error(err);
      showLoadError(err);
    }
  }

  function validateLoadedData() {
    const checks = [
      ["職種マスタCSV", state.data.jobSummary, "job_id"],
      ["都道府県別給与CSV", state.data.prefecture, "job_id"],
      ["月別求人数CSV", state.data.monthly, "job_id"],
      ["条件別給与CSV", state.data.conditions, "job_id"],
      ["classification.json", state.data.classification, "job_id"],
      ["tags.json", state.data.tags, "job_id"],
      ["relations.json", state.data.relations, "source_job_id"]
    ];
    for (const [name, data, key] of checks) {
      if (!Array.isArray(data) || !data.length || !(key in data[0])) {
        throw new Error(`${name} の形式を確認してください。`);
      }
    }
  }

  function pushMapArray(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  function buildIndexes() {
    const idx = state.idx;
    idx.classById = new Map(state.data.classification.map(x => [x.job_id, x]));
    idx.jobById = new Map(state.data.jobSummary.map(x => [x.job_id, x]));

    idx.tagsByJob = new Map();
    state.data.tags.forEach(t => pushMapArray(idx.tagsByJob, t.job_id, t));

    idx.relationsByJob = new Map();
    state.data.relations.forEach(r => {
      pushMapArray(idx.relationsByJob, r.source_job_id, {
        other_job_id: r.target_job_id,
        relation_type: r.relation_type,
        search_bonus: Number(r.search_bonus) || 0,
        expand_level: Number(r.expand_level) || 3,
        note: r.note || ""
      });
      if (r.direction === "双方向") {
        pushMapArray(idx.relationsByJob, r.target_job_id, {
          other_job_id: r.source_job_id,
          relation_type: r.relation_type,
          search_bonus: Number(r.search_bonus) || 0,
          expand_level: Number(r.expand_level) || 3,
          note: r.note || ""
        });
      }
    });

    idx.prefByJob = new Map();
    state.data.prefecture.forEach(r => {
      if (!idx.prefByJob.has(r.job_id)) idx.prefByJob.set(r.job_id, new Map());
      idx.prefByJob.get(r.job_id).set(r.prefecture, r);
    });

    idx.monthlyByJob = new Map();
    state.data.monthly.forEach(r => pushMapArray(idx.monthlyByJob, r.job_id, r));
    idx.monthlyByJob.forEach(rows => rows.sort((a, b) => a.month.localeCompare(b.month)));

    idx.conditionsByJob = new Map();
    state.data.conditions.forEach(r => pushMapArray(idx.conditionsByJob, r.job_id, r));

    idx.majorToMiddles = new Map();
    state.data.classification.forEach(c => {
      if (!idx.majorToMiddles.has(c.major_category)) idx.majorToMiddles.set(c.major_category, new Set());
      idx.majorToMiddles.get(c.major_category).add(c.middle_category);
    });
  }

  function initializeControls() {
    const majors = [...state.idx.majorToMiddles.keys()].sort((a, b) => a.localeCompare(b, "ja"));
    els.majorSelect.insertAdjacentHTML(
      "beforeend",
      majors.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("")
    );

    els.prefectureSelect.innerHTML = PREFECTURES.map(p => `<option value="${p}"${p === "東京都" ? " selected" : ""}>${p}</option>`).join("");

    wireEvents();
  }

  function wireEvents() {
    let searchTimer = null;
    els.keywordInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderKeywordSuggestions, 60);
    });
    els.keywordInput.addEventListener("focus", () => {
      if (els.keywordInput.value.trim()) renderKeywordSuggestions();
    });
    els.keywordInput.addEventListener("keydown", e => {
      if (e.key === "Escape") els.suggestions.hidden = true;
    });

    els.clearKeyword.addEventListener("click", () => {
      els.keywordInput.value = "";
      els.suggestions.hidden = true;
      els.keywordInput.focus();
    });

    els.majorSelect.addEventListener("change", () => {
      const major = els.majorSelect.value;
      els.middleSelect.innerHTML = '<option value="">中分類を選択</option>';
      if (!major) {
        els.middleSelect.disabled = true;
        els.showCategoryJobs.disabled = true;
        els.categoryCandidates.hidden = true;
        return;
      }
      const middles = [...(state.idx.majorToMiddles.get(major) || [])].sort((a,b) => a.localeCompare(b, "ja"));
      els.middleSelect.insertAdjacentHTML(
        "beforeend",
        middles.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("")
      );
      els.middleSelect.disabled = false;
      els.showCategoryJobs.disabled = false;
    });

    els.middleSelect.addEventListener("change", () => {
      els.showCategoryJobs.disabled = !els.majorSelect.value;
    });
    els.showCategoryJobs.addEventListener("click", renderCategoryCandidates);

    document.addEventListener("click", e => {
      const button = e.target.closest("[data-select-job]");
      if (button) {
        selectJob(button.dataset.selectJob);
        return;
      }
      if (!e.target.closest(".search-block")) els.suggestions.hidden = true;
    });

    els.levelButtons.addEventListener("click", e => {
      const button = e.target.closest("button[data-level]");
      if (!button) return;
      state.expandLevel = Number(button.dataset.level);
      [...els.levelButtons.querySelectorAll("button")].forEach(b => b.classList.toggle("active", b === button));
      refreshRelatedResults();
    });

    document.querySelector(".tabs").addEventListener("click", e => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === tab));
      document.querySelectorAll(".tab-panel").forEach(x => x.classList.remove("active"));
      $(`tab-${tab.dataset.tab}`).classList.add("active");
    });

    els.prefMode.addEventListener("change", renderPrefecture);
    els.prefectureSelect.addEventListener("change", renderPrefecture);
    els.prefEmployment.addEventListener("change", renderPrefecture);
    els.prefJobSelect.addEventListener("change", renderPrefecture);
    els.monthlyEmployment.addEventListener("change", renderMonthly);
    els.monthlyJobLimit.addEventListener("change", renderMonthly);
    els.conditionJobSelect.addEventListener("change", renderConditions);
    els.conditionEmployment.addEventListener("change", renderConditions);

    const sortRenderers = {
      summary: renderSummary,
      prefecture: renderPrefecture,
      conditions: renderConditions
    };
    [els.summaryTable, els.prefTable, els.conditionTable].forEach(table => {
      table.addEventListener("click", e => {
        const button = e.target.closest("button[data-sort-table][data-sort-key]");
        if (!button) return;
        const tableName = button.dataset.sortTable;
        const key = button.dataset.sortKey;
        cycleSort(tableName, key);
        sortRenderers[tableName]?.();
      });
    });

    initStickyMarketView();
  }

  function initStickyMarketView() {
    const tabs = document.querySelector(".results-panel .tabs");
    if (!tabs || $("stickyMarketTableHead")) return;

    const sticky = document.createElement("div");
    sticky.id = "stickyMarketTableHead";
    sticky.className = "sticky-table-head";
    sticky.innerHTML = '<div class="sticky-table-head-viewport"></div>';
    document.body.appendChild(sticky);
    const viewport = sticky.firstElementChild;

    let activeTable = null;
    let activeWrap = null;
    let clonedFrom = null;
    let raf = 0;

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    }

    function syncTabsHeight() {
      const h = Math.ceil(tabs.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--market-tabs-height", `${h}px`);
    }

    function getActiveTable() {
      const panel = document.querySelector(".tab-panel.active");
      if (!panel) return { panel: null, wrap: null, table: null };
      const table = panel.querySelector(".table-wrap .data-table");
      return { panel, wrap: table?.closest(".table-wrap") || null, table };
    }

    function getStickyStackBottom(panel) {
      const tabsRect = tabs.getBoundingClientRect();
      let bottom = Math.max(0, tabsRect.bottom);
      const toolbar = panel?.querySelector(":scope > .toolbar");
      if (!toolbar || getComputedStyle(toolbar).position !== "sticky") return bottom;
      const r = toolbar.getBoundingClientRect();
      // 表が上端へ届く頃にはtoolbarはsticky済み。実測bottomを使うことで折返しにも追従する。
      if (r.top <= bottom + 2) bottom = Math.max(bottom, r.bottom);
      return bottom;
    }

    function getLeafWidths(table) {
      const bodyRow = table.tBodies?.[0]?.rows?.[0];
      if (bodyRow?.cells?.length) {
        return [...bodyRow.cells].map(cell => cell.getBoundingClientRect().width);
      }
      const rows = [...(table.tHead?.rows || [])];
      const last = rows[rows.length - 1];
      if (!last) return [];
      return [...last.cells].map(cell => cell.getBoundingClientRect().width);
    }

    function rebuildClone(table) {
      if (!table?.tHead) {
        viewport.innerHTML = "";
        clonedFrom = null;
        return;
      }
      const widths = getLeafWidths(table);
      const clone = table.cloneNode(false);
      clone.removeAttribute("id");
      clone.classList.add("sticky-head-table");
      clone.style.minWidth = "0";
      clone.style.width = `${Math.max(table.scrollWidth, table.getBoundingClientRect().width)}px`;

      if (widths.length) {
        const colgroup = document.createElement("colgroup");
        widths.forEach(width => {
          const col = document.createElement("col");
          col.style.width = `${width}px`;
          colgroup.appendChild(col);
        });
        clone.appendChild(colgroup);
      }
      clone.appendChild(table.tHead.cloneNode(true));
      viewport.replaceChildren(clone);
      clonedFrom = table;
    }

    function syncHorizontal() {
      if (!activeWrap) return;
      viewport.scrollLeft = activeWrap.scrollLeft;
    }

    function hide() {
      sticky.classList.remove("visible");
      activeTable = null;
      activeWrap = null;
    }

    function update() {
      syncTabsHeight();
      const { panel, wrap, table } = getActiveTable();
      if (!panel || !wrap || !table || !table.tHead || !table.tBodies.length) {
        hide();
        return;
      }

      const stackBottom = getStickyStackBottom(panel);
      const headRect = table.tHead.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const shouldShow = headRect.top <= stackBottom + 1 && tableRect.bottom > stackBottom + headRect.height + 1;

      if (!shouldShow) {
        hide();
        return;
      }

      activeTable = table;
      activeWrap = wrap;
      if (clonedFrom !== table || !viewport.firstElementChild) rebuildClone(table);

      // 表の再描画やレスポンシブ変更で列幅が変わった場合も追従させる。
      const clone = viewport.firstElementChild;
      const desiredWidth = Math.max(table.scrollWidth, table.getBoundingClientRect().width);
      if (clone && Math.abs(parseFloat(clone.style.width || "0") - desiredWidth) > 1) rebuildClone(table);

      sticky.style.top = `${Math.round(stackBottom)}px`;
      sticky.style.left = `${Math.round(wrapRect.left)}px`;
      sticky.style.width = `${Math.round(wrapRect.width)}px`;
      sticky.classList.add("visible");
      syncHorizontal();
    }

    // 複製ヘッダーのソートボタンは、元テーブルの同じボタンへクリックを転送する。
    sticky.addEventListener("click", e => {
      const button = e.target.closest("button[data-sort-table][data-sort-key]");
      if (!button || !activeTable) return;
      const tableName = button.dataset.sortTable;
      const key = button.dataset.sortKey;
      const original = activeTable.querySelector(`button[data-sort-table="${tableName}"][data-sort-key="${key}"]`);
      original?.click();
      schedule();
    });

    document.querySelectorAll(".table-wrap").forEach(wrap => {
      wrap.addEventListener("scroll", () => {
        if (wrap === activeWrap) syncHorizontal();
      }, { passive: true });
    });

    const observer = new MutationObserver(() => {
      clonedFrom = null;
      schedule();
    });
    [els.summaryTable, els.prefTable, els.monthlyTable, els.conditionTable].forEach(table => {
      observer.observe(table, { childList: true, subtree: true });
    });

    tabs.addEventListener("click", () => {
      clonedFrom = null;
      requestAnimationFrame(schedule);
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", () => {
      clonedFrom = null;
      schedule();
    }, { passive: true });

    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        clonedFrom = null;
        schedule();
      });
      resizeObserver.observe(tabs);
      document.querySelectorAll(".tab-panel > .toolbar, .table-wrap").forEach(el => resizeObserver.observe(el));
    }

    schedule();
  }

  function searchCandidates(rawQuery) {
    const q = normalize(rawQuery);
    if (!q) return [];
    const results = [];

    for (const c of state.data.classification) {
      const name = normalize(c.job_name);
      const mid = normalize(c.middle_category);
      const major = normalize(c.major_category);
      const concept = normalize(c.concept_type);
      let score = 0;
      let reason = "";

      if (name === q) {
        score = 1200; reason = "職種名に完全一致";
      } else if (name.startsWith(q)) {
        score = 1050; reason = "職種名の先頭に一致";
      } else if (name.includes(q)) {
        score = 900; reason = "職種名に一致";
      }

      const tags = state.idx.tagsByJob.get(c.job_id) || [];
      for (const t of tags) {
        const tag = normalize(t.tag);
        if (!tag) continue;
        let ts = 0;
        let tr = "";
        if (tag === q) {
          ts = 700 + Number(t.search_weight || 0);
          tr = `${t.tag_type}タグに一致`;
        } else if (tag.includes(q) || q.includes(tag)) {
          ts = 570 + Number(t.search_weight || 0);
          tr = `${t.tag_type}タグに部分一致`;
        }
        if (ts > score) { score = ts; reason = tr; }
      }

      if (mid === q && 770 > score) { score = 770; reason = "中分類に一致"; }
      else if ((mid.includes(q) || q.includes(mid)) && 650 > score) { score = 650; reason = "中分類に部分一致"; }

      if (major === q && 560 > score) { score = 560; reason = "大分類に一致"; }
      else if ((major.includes(q) || q.includes(major)) && 450 > score) { score = 450; reason = "大分類に部分一致"; }

      if ((concept === q || concept.includes(q)) && 330 > score) { score = 330; reason = "概念種別に一致"; }

      if (score > 0) results.push({ ...c, score, reason });
    }

    results.sort((a, b) => b.score - a.score || a.job_name.localeCompare(b.job_name, "ja"));
    return results.slice(0, 40);
  }

  function renderKeywordSuggestions() {
    const q = els.keywordInput.value.trim();
    if (!q) {
      els.suggestions.hidden = true;
      return;
    }
    const results = searchCandidates(q);
    if (!results.length) {
      els.suggestions.innerHTML = '<div class="empty-hint">候補が見つかりません。分類から探すか、より短い言葉を試してください。</div>';
    } else {
      els.suggestions.innerHTML = results.map(c => candidateButton(c, c.reason)).join("");
    }
    els.suggestions.hidden = false;
  }

  function candidateButton(c, reason = "") {
    return `<button type="button" class="suggestion-item" data-select-job="${escapeHtml(c.job_id)}">
      <span class="suggestion-name">${escapeHtml(c.job_name)}</span>
      <span class="suggestion-meta">${escapeHtml(c.major_category)} ＞ ${escapeHtml(c.middle_category)}｜${escapeHtml(c.concept_type)}</span>
      ${reason ? `<span class="suggestion-reason">${escapeHtml(reason)}</span>` : ""}
    </button>`;
  }

  function renderCategoryCandidates() {
    const major = els.majorSelect.value;
    const middle = els.middleSelect.value;
    if (!major) return;
    const rows = state.data.classification
      .filter(c => c.major_category === major && (!middle || c.middle_category === middle))
      .sort((a,b) => a.job_name.localeCompare(b.job_name, "ja"));
    els.categoryCandidates.innerHTML = rows.length
      ? rows.map(c => candidateButton(c, middle ? "分類候補" : c.middle_category)).join("")
      : '<div class="empty-hint">候補がありません。</div>';
    els.categoryCandidates.hidden = false;
  }

  function selectJob(jobId) {
    if (!state.idx.classById.has(jobId)) return;
    state.selectedJobId = jobId;
    resetAllSorts();
    const c = state.idx.classById.get(jobId);
    els.keywordInput.value = c.job_name;
    els.suggestions.hidden = true;
    els.categoryCandidates.hidden = true;
    els.selectedPanel.hidden = false;
    els.resultsPanel.hidden = false;
    els.selectedJobCard.innerHTML = `
      <div class="label">選択対象</div>
      <h3>${escapeHtml(c.job_name)}</h3>
      <div class="breadcrumb">${escapeHtml(c.major_category)} ＞ ${escapeHtml(c.middle_category)}</div>
      <span class="concept-chip">${escapeHtml(c.concept_type)}</span>`;
    refreshRelatedResults();
    els.selectedPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function computeRelated(jobId, level) {
    const base = state.idx.classById.get(jobId);
    if (!base) return [];
    const found = new Map();

    const put = (id, score, reason, relationType = "", relationLevel = null) => {
      const c = state.idx.classById.get(id);
      if (!c) return;
      const old = found.get(id);
      if (!old || score > old.score) {
        found.set(id, {
          ...c,
          score,
          reason,
          relation_type: relationType,
          relation_level: relationLevel
        });
      }
    };

    put(jobId, 1000, "完全一致");

    for (const r of (state.idx.relationsByJob.get(jobId) || [])) {
      if (r.expand_level <= level) {
        put(r.other_job_id, 500 + r.search_bonus, `明示関連：${r.relation_type}`, r.relation_type, r.expand_level);
      }
    }

    if (level >= 2 && base.middle_category !== "その他・要確認") {
      for (const c of state.data.classification) {
        if (c.middle_category === base.middle_category) put(c.job_id, 370, "同じ中分類");
      }
    }

    if (level >= 3 && base.major_category !== "その他・サービス") {
      for (const c of state.data.classification) {
        if (c.major_category === base.major_category) put(c.job_id, 240, "同じ大分類");
      }
    }

    return [...found.values()].sort((a,b) => b.score - a.score || a.job_name.localeCompare(b.job_name, "ja"));
  }

  function refreshRelatedResults() {
    state.related = computeRelated(state.selectedJobId, state.expandLevel);
    els.relatedCount.textContent = `選択対象を含む ${state.related.length}項目を比較対象として抽出`;
    fillRelatedJobSelects();
    renderAllResults();
  }

  function fillRelatedJobSelects() {
    const options = state.related.map(r => `<option value="${escapeHtml(r.job_id)}">${escapeHtml(r.job_name)}</option>`).join("");
    els.prefJobSelect.innerHTML = options;
    els.conditionJobSelect.innerHTML = `<option value="all">選択対象＋関連項目すべて（${state.related.length}項目）</option>${options}`;
  }

  function renderAllResults() {
    renderSummary();
    renderPrefecture();
    renderMonthly();
    renderConditions();

    const job = state.idx.jobById.get(state.selectedJobId);
    const fetched = job?.fetched_at || "";
    els.lastUpdated.textContent = fetched ? `取得日時：${fetched}` : "";
  }

  function summaryValues(id) {
    return state.idx.jobById.get(id) || {};
  }

  function salaryDiff(id, employment) {
    const key = EMP[employment].summarySalary;
    const val = numberOrNull(summaryValues(id)[key]);
    const base = numberOrNull(summaryValues(state.selectedJobId)[key]);
    return val === null || base === null ? null : val - base;
  }

  function jobRatio(id, key) {
    const val = numberOrNull(summaryValues(id)[key]);
    const base = numberOrNull(summaryValues(state.selectedJobId)[key]);
    return val === null || base === null || base === 0 ? null : val / base;
  }

  function renderSummary() {
    const base = summaryValues(state.selectedJobId);
    const salaryRows = state.related
      .map(r => ({ ...r, v: numberOrNull(summaryValues(r.job_id).regular_salary_median_10k_yen) }))
      .filter(r => r.v !== null)
      .sort((a,b) => b.v - a.v);
    const countRows = state.related
      .map(r => ({ ...r, v: numberOrNull(summaryValues(r.job_id).regular_jobs_current) }))
      .filter(r => r.v !== null)
      .sort((a,b) => b.v - a.v);

    els.summaryHighlights.innerHTML = [
      ["選択対象｜正社員給与", formatSalary(base.regular_salary_median_10k_yen, "regular"), state.idx.classById.get(state.selectedJobId).job_name],
      ["選択対象｜正社員求人数", `${formatInt(base.regular_jobs_current)}件`, "現在求人数"],
      ["関連内｜正社員給与最高", salaryRows.length ? formatSalary(salaryRows[0].v, "regular") : "—", salaryRows.length ? salaryRows[0].job_name : ""],
      ["関連内｜正社員求人最大", countRows.length ? `${formatInt(countRows[0].v)}件` : "—", countRows.length ? countRows[0].job_name : ""]
    ].map(([k,v,s]) => `<div class="highlight-card"><div class="kicker">${escapeHtml(k)}</div><div class="value">${escapeHtml(v)}</div><div class="sub">${escapeHtml(s)}</div></div>`).join("");

    const head = `<thead>
      <tr>
        <th rowspan="2">職種</th><th rowspan="2">抽出理由</th>
        <th colspan="6">給与中央値</th><th colspan="6">現在求人数</th>
      </tr>
      <tr>
        ${sortableHeader("summary", "regular_salary_median_10k_yen", "正社員")}
        <th>選択対象との差</th>
        ${sortableHeader("summary", "parttime_salary_median_yen_hour", "パート")}
        <th>選択対象との差</th>
        ${sortableHeader("summary", "temp_salary_median_yen_hour", "派遣")}
        <th>選択対象との差</th>
        ${sortableHeader("summary", "regular_jobs_current", "正社員")}
        <th>選択対象比</th>
        ${sortableHeader("summary", "parttime_jobs_current", "パート")}
        <th>選択対象比</th>
        ${sortableHeader("summary", "temp_jobs_current", "派遣")}
        <th>選択対象比</th>
      </tr>
    </thead>`;

    const rows = sortRowsNumeric(
      state.related,
      "summary",
      (r, key) => summaryValues(r.job_id)[key]
    );

    const body = rows.map(r => {
      const d = summaryValues(r.job_id);
      const rd = salaryDiff(r.job_id, "regular");
      const pd = salaryDiff(r.job_id, "parttime");
      const td = salaryDiff(r.job_id, "temp");
      const rr = jobRatio(r.job_id, "regular_jobs_current");
      const pr = jobRatio(r.job_id, "parttime_jobs_current");
      const tr = jobRatio(r.job_id, "temp_jobs_current");
      return `<tr class="${r.job_id === state.selectedJobId ? "self-row" : ""}">
        <td class="left"><strong>${escapeHtml(r.job_name)}</strong>${r.job_id === state.selectedJobId ? ' <span class="selected-badge">選択中</span>' : ""}<br><span class="muted">${escapeHtml(r.major_category)} ＞ ${escapeHtml(r.middle_category)}</span></td>
        <td class="left">${escapeHtml(r.reason)}<br><span class="muted">score ${r.score}</span></td>
        <td class="num">${formatSalary(d.regular_salary_median_10k_yen, "regular")}</td>
        <td class="num ${metricClass(rd)}">${formatDiff(rd, "regular")}</td>
        <td class="num">${formatSalary(d.parttime_salary_median_yen_hour, "parttime")}</td>
        <td class="num ${metricClass(pd)}">${formatDiff(pd, "parttime")}</td>
        <td class="num">${formatSalary(d.temp_salary_median_yen_hour, "temp")}</td>
        <td class="num ${metricClass(td)}">${formatDiff(td, "temp")}</td>
        <td class="num">${formatInt(d.regular_jobs_current)}件</td>
        <td class="num ${metricClass(rr, 1)}">${formatRatio(rr)}</td>
        <td class="num">${formatInt(d.parttime_jobs_current)}件</td>
        <td class="num ${metricClass(pr, 1)}">${formatRatio(pr)}</td>
        <td class="num">${formatInt(d.temp_jobs_current)}件</td>
        <td class="num ${metricClass(tr, 1)}">${formatRatio(tr)}</td>
      </tr>`;
    }).join("");
    els.summaryTable.innerHTML = head + `<tbody>${body}</tbody>`;
  }

  function renderPrefecture() {
    if (!state.selectedJobId) return;
    const mode = els.prefMode.value;
    const emp = els.prefEmployment.value || "all";
    const selectedPref = els.prefectureSelect.value || "東京都";
    const selectedJobId = els.prefJobSelect.value || state.selectedJobId;
    const selectedJob = state.idx.classById.get(selectedJobId);
    const selectionTarget = state.idx.classById.get(state.selectedJobId);

    els.prefectureControl.hidden = false;
    els.prefJobControl.hidden = false;

    if (mode === "compare") {
      els.prefectureControlLabel.textContent = "固定する都道府県";
      els.prefJobControlLabel.textContent = "基準にする職種";
    } else {
      els.prefectureControlLabel.textContent = "基準にする都道府県";
      els.prefJobControlLabel.textContent = "固定する職種";
    }

    const salaryColumns = emp === "all"
      ? [
          { emp: "regular", label: "正社員 年収（万円）", diffLabel: "基準との差（万円）" },
          { emp: "parttime", label: "パート 時給（円）", diffLabel: "基準との差（円）" },
          { emp: "temp", label: "派遣 時給（円）", diffLabel: "基準との差（円）" }
        ]
      : [{
          emp,
          label: emp === "regular" ? "正社員 年収（万円）" : `${EMP[emp].label} 時給（円）`,
          diffLabel: emp === "regular" ? "基準との差（万円）" : "基準との差（円）"
        }];

    ensureSortKeyVisible("prefecture", salaryColumns.map(c => c.emp));
    const salaryHead = salaryColumns.map(c =>
      `${sortableHeader("prefecture", c.emp, c.label)}<th>${escapeHtml(c.diffLabel)}</th>`
    ).join("");

    const renderSalaryPair = (row, baseRow, col) => {
      const value = numberOrNull(row?.[EMP[col.emp].prefSalary]);
      const baseValue = numberOrNull(baseRow?.[EMP[col.emp].prefSalary]);
      const diff = value === null || baseValue === null ? null : value - baseValue;
      return `<td class="num">${formatSalary(value, col.emp)}</td><td class="num ${metricClass(diff)}">${formatDiff(diff, col.emp)}</td>`;
    };

    if (mode === "compare") {
      const pref = selectedPref;
      const baseRow = state.idx.prefByJob.get(selectedJobId)?.get(pref);
      const defaultRows = state.related.map(r => ({
        ...r,
        prefRow: state.idx.prefByJob.get(r.job_id)?.get(pref)
      }));
      const rows = sortRowsNumeric(
        defaultRows,
        "prefecture",
        (r, key) => r.prefRow?.[EMP[key].prefSalary]
      );

      els.prefCaption.innerHTML = `<strong>${escapeHtml(pref)}</strong>を固定して、<strong>${escapeHtml(selectionTarget?.job_name || "")}</strong>と関連項目の給与を比較しています。<span class="caption-sub">基準：${escapeHtml(selectedJob?.job_name || "")}</span>`;
      els.prefTable.innerHTML = `<thead><tr>
          <th>職種</th>
          <th class="fixed-axis-head">都道府県 <span class="column-badge">固定</span></th>
          ${salaryHead}
        </tr></thead>
        <tbody>${rows.map(r => {
          const isFocus = r.job_id === selectedJobId;
          return `<tr class="${isFocus ? "focus-row" : ""}">
            <td class="left">${escapeHtml(r.job_name)}${isFocus ? ' <span class="focus-badge">基準</span>' : ""}</td>
            <td class="left fixed-axis-cell">${escapeHtml(pref)}</td>
            ${salaryColumns.map(c => renderSalaryPair(r.prefRow, baseRow, c)).join("")}
          </tr>`;
        }).join("")}</tbody>`;
    } else {
      const jobId = selectedJobId;
      const c = state.idx.classById.get(jobId);
      const byPref = state.idx.prefByJob.get(jobId) || new Map();
      const baseRow = byPref.get(selectedPref);
      const defaultRows = PREFECTURES.map(pref => ({ pref, prefRow: byPref.get(pref) }));
      const rows = sortRowsNumeric(
        defaultRows,
        "prefecture",
        (r, key) => r.prefRow?.[EMP[key].prefSalary]
      );

      els.prefCaption.innerHTML = `<strong>${escapeHtml(c?.job_name || "")}</strong>を固定して、47都道府県の給与を比較しています。<span class="caption-sub">基準：${escapeHtml(selectedPref)}</span>`;
      els.prefTable.innerHTML = `<thead><tr>
          <th class="fixed-axis-head">職種 <span class="column-badge">固定</span></th>
          <th>都道府県</th>
          ${salaryHead}
        </tr></thead>
        <tbody>${rows.map(r => {
          const isFocus = r.pref === selectedPref;
          return `<tr class="${isFocus ? "focus-row" : ""}">
            <td class="left fixed-axis-cell">${escapeHtml(c?.job_name || "")}</td>
            <td class="left">${escapeHtml(r.pref)}${isFocus ? ' <span class="focus-badge">基準</span>' : ""}</td>
            ${salaryColumns.map(col => renderSalaryPair(r.prefRow, baseRow, col)).join("")}
          </tr>`;
        }).join("")}</tbody>`;
    }
  }

  function renderMonthly() {
    if (!state.selectedJobId) return;
    const emp = els.monthlyEmployment.value;
    const key = EMP[emp].monthly;
    const limit = Number(els.monthlyJobLimit.value || 6);
    const jobs = state.related.slice(0, limit);
    const months = [...new Set(jobs.flatMap(j => (state.idx.monthlyByJob.get(j.job_id) || []).map(r => r.month)))].sort();

    const byJobMonth = new Map();
    jobs.forEach(j => {
      byJobMonth.set(j.job_id, new Map((state.idx.monthlyByJob.get(j.job_id) || []).map(r => [r.month, numberOrNull(r[key])])));
    });

    els.monthlyChartTitle.textContent = `${EMP[emp].label}｜月別求人数の推移（検索スコア上位${jobs.length}職種）`;
    els.monthlyChart.innerHTML = buildLineChart(months, jobs, byJobMonth);

    els.monthlyTable.innerHTML = `<thead><tr><th>年月</th>${jobs.map(j => `<th>${escapeHtml(j.job_name)}</th>`).join("")}</tr></thead>
      <tbody>${months.map(m => `<tr><td class="left">${escapeHtml(m)}</td>${jobs.map(j => {
        const v = byJobMonth.get(j.job_id).get(m);
        return `<td class="num">${v === undefined || v === null ? "—" : `${formatInt(v)}件`}</td>`;
      }).join("")}</tr>`).join("")}</tbody>`;
  }

  function buildLineChart(months, jobs, byJobMonth) {
    if (!months.length || !jobs.length) return '<div class="empty-hint">月別データがありません。</div>';

    const width = 1000, height = 270;
    const pad = { left: 65, right: 25, top: 20, bottom: 40 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const values = [];
    jobs.forEach(j => months.forEach(m => {
      const v = byJobMonth.get(j.job_id).get(m);
      if (v !== undefined && v !== null) values.push(v);
    }));
    const max = Math.max(...values, 1);
    const niceMax = niceCeil(max);
    const x = i => pad.left + (months.length <= 1 ? plotW / 2 : (i / (months.length - 1)) * plotW);
    const y = v => pad.top + plotH - (v / niceMax) * plotH;
    const palette = ["#2563eb","#059669","#d97706","#7c3aed","#dc2626","#0891b2","#4f46e5","#65a30d","#c2410c","#be185d"];

    let svg = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="月別求人数推移">`;

    for (let i = 0; i <= 5; i++) {
      const val = niceMax * (i / 5);
      const yy = y(val);
      svg += `<line class="chart-grid" x1="${pad.left}" y1="${yy}" x2="${width-pad.right}" y2="${yy}"/>`;
      svg += `<text class="chart-axis" x="${pad.left-8}" y="${yy+3}" text-anchor="end">${compactNumber(val)}</text>`;
    }

    const tickEvery = Math.max(1, Math.ceil(months.length / 10));
    months.forEach((m, i) => {
      if (i % tickEvery === 0 || i === months.length - 1) {
        svg += `<text class="chart-axis" x="${x(i)}" y="${height-14}" text-anchor="middle">${escapeHtml(m)}</text>`;
      }
    });

    jobs.forEach((j, ji) => {
      const color = palette[ji % palette.length];
      const points = months.map((m,i) => {
        const v = byJobMonth.get(j.job_id).get(m);
        return (v === undefined || v === null) ? null : { x:x(i), y:y(v), v, m };
      }).filter(Boolean);
      if (!points.length) return;
      const d = points.map((p,i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${j.job_id === state.selectedJobId ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      points.forEach(p => {
        svg += `<circle cx="${p.x}" cy="${p.y}" r="${j.job_id === state.selectedJobId ? 3.2 : 2.3}" fill="${color}"><title>${escapeHtml(j.job_name)} ${escapeHtml(p.m)}：${formatInt(p.v)}件</title></circle>`;
      });
    });
    svg += `</svg>`;

    const legend = `<div class="chart-legend">${jobs.map((j,i) => `<span class="legend-item"><i class="legend-dot" style="background:${palette[i%palette.length]}"></i>${escapeHtml(j.job_name)}${j.job_id === state.selectedJobId ? "（選択中）" : ""}</span>`).join("")}</div>`;
    return svg + legend;
  }

  function niceCeil(n) {
    if (n <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(n)));
    const f = n / exp;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nice * exp;
  }

  function renderConditions() {
    if (!state.selectedJobId) return;
    const filterJob = els.conditionJobSelect.value || "all";
    const emp = els.conditionEmployment.value || "all";
    const relatedIds = new Set(state.related.map(r => r.job_id));
    const order = new Map(state.related.map((r,i) => [r.job_id, i]));

    let rows = state.data.conditions.filter(r => relatedIds.has(r.job_id));
    if (filterJob !== "all") rows = rows.filter(r => r.job_id === filterJob);
    rows.sort((a,b) => (order.get(a.job_id) ?? 9999) - (order.get(b.job_id) ?? 9999) || a.condition.localeCompare(b.condition, "ja"));

    const visibleSortKeys = emp === "all" ? ["regular", "parttime", "temp"] : [emp];
    ensureSortKeyVisible("conditions", visibleSortKeys);
    rows = sortRowsNumeric(rows, "conditions", (r, key) => r[EMP[key].condition]);

    if (emp === "all") {
      els.conditionTable.innerHTML = `<thead><tr><th>職種</th><th>条件</th>
          ${sortableHeader("conditions", "regular", "正社員 年収（万円）")}
          ${sortableHeader("conditions", "parttime", "パート 時給（円）")}
          ${sortableHeader("conditions", "temp", "派遣 時給（円）")}
        </tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.job_id === state.selectedJobId ? "self-row" : ""}">
          <td class="left">${escapeHtml(r.job_name)}</td><td class="left">${escapeHtml(r.condition)}</td>
          <td class="num">${formatSalary(r.regular_salary_10k_yen, "regular")}</td>
          <td class="num">${formatSalary(r.parttime_salary_yen_hour, "parttime")}</td>
          <td class="num">${formatSalary(r.temp_salary_yen_hour, "temp")}</td>
        </tr>`).join("")}</tbody>`;
    } else {
      const meta = EMP[emp];
      const label = emp === "regular" ? "正社員 年収（万円）" : `${meta.label} 時給（円）`;
      els.conditionTable.innerHTML = `<thead><tr><th>職種</th><th>条件</th>${sortableHeader("conditions", emp, label)}</tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.job_id === state.selectedJobId ? "self-row" : ""}">
          <td class="left">${escapeHtml(r.job_name)}</td><td class="left">${escapeHtml(r.condition)}</td>
          <td class="num">${formatSalary(r[meta.condition], emp)}</td>
        </tr>`).join("")}</tbody>`;
    }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  loadData();
})();
