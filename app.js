(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG;
  const state = {
    loaded: false,
    selectedJobId: null,
    expandLevel: CONFIG.defaultExpandLevel || 2,
    related: [],
    data: {},
    idx: {}
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
    prefectureSelect: $("prefectureSelect"),
    prefJobControl: $("prefJobControl"),
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

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  async function loadData() {
    try {
      els.dataStatus.textContent = "7データセットを読込中…";
      const [
        jobCsv, prefCsv, monthlyCsv, conditionCsv,
        classification, tags, relations
      ] = await Promise.all([
        fetchText(CONFIG.csv.jobSummary),
        fetchText(CONFIG.csv.prefectureSalary),
        fetchText(CONFIG.csv.monthlyJobs),
        fetchText(CONFIG.csv.conditionSalary),
        fetchJson(CONFIG.json.classification),
        fetchJson(CONFIG.json.tags),
        fetchJson(CONFIG.json.relations)
      ]);

      state.data.jobSummary = parseCSV(jobCsv);
      state.data.prefecture = parseCSV(prefCsv);
      state.data.monthly = parseCSV(monthlyCsv);
      state.data.conditions = parseCSV(conditionCsv);
      state.data.classification = classification;
      state.data.tags = tags;
      state.data.relations = relations;

      validateLoadedData();
      buildIndexes();
      initializeControls();

      state.loaded = true;
      els.dataStatus.textContent = `読込完了｜${state.data.classification.length}職種`;
      els.dataStatus.classList.add("ok");
    } catch (err) {
      console.error(err);
      els.dataStatus.textContent = "データ読込エラー";
      els.dataStatus.classList.add("error");
      document.querySelector(".search-panel").insertAdjacentHTML(
        "afterend",
        `<div class="error-box"><strong>データを読み込めませんでした。</strong><br>${escapeHtml(err.message)}<br>GitHub Pages上で再読み込みしてください。ローカルで確認する場合はHTTPサーバー経由で開いてください。</div>`
      );
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
    const c = state.idx.classById.get(jobId);
    els.keywordInput.value = c.job_name;
    els.suggestions.hidden = true;
    els.categoryCandidates.hidden = true;
    els.selectedPanel.hidden = false;
    els.resultsPanel.hidden = false;
    els.selectedJobCard.innerHTML = `
      <div class="label">本人職種</div>
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
    els.relatedCount.textContent = `本人を含む ${state.related.length}職種を比較対象として抽出`;
    fillRelatedJobSelects();
    renderAllResults();
  }

  function fillRelatedJobSelects() {
    const options = state.related.map(r => `<option value="${escapeHtml(r.job_id)}">${escapeHtml(r.job_name)}</option>`).join("");
    els.prefJobSelect.innerHTML = options;
    els.conditionJobSelect.innerHTML = `<option value="all">本人＋周辺職種すべて（${state.related.length}職種）</option>${options}`;
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
      ["本人｜正社員給与", formatSalary(base.regular_salary_median_10k_yen, "regular"), state.idx.classById.get(state.selectedJobId).job_name],
      ["本人｜正社員求人数", `${formatInt(base.regular_jobs_current)}件`, "現在求人数"],
      ["周辺内｜正社員給与最高", salaryRows.length ? formatSalary(salaryRows[0].v, "regular") : "—", salaryRows.length ? salaryRows[0].job_name : ""],
      ["周辺内｜正社員求人最大", countRows.length ? `${formatInt(countRows[0].v)}件` : "—", countRows.length ? countRows[0].job_name : ""]
    ].map(([k,v,s]) => `<div class="highlight-card"><div class="kicker">${escapeHtml(k)}</div><div class="value">${escapeHtml(v)}</div><div class="sub">${escapeHtml(s)}</div></div>`).join("");

    const head = `<thead>
      <tr>
        <th rowspan="2">職種</th><th rowspan="2">抽出理由</th>
        <th colspan="6">給与中央値</th><th colspan="6">現在求人数</th>
      </tr>
      <tr>
        <th>正社員</th><th>本人差</th><th>パート</th><th>本人差</th><th>派遣</th><th>本人差</th>
        <th>正社員</th><th>本人比</th><th>パート</th><th>本人比</th><th>派遣</th><th>本人比</th>
      </tr>
    </thead>`;

    const body = state.related.map(r => {
      const d = summaryValues(r.job_id);
      const rd = salaryDiff(r.job_id, "regular");
      const pd = salaryDiff(r.job_id, "parttime");
      const td = salaryDiff(r.job_id, "temp");
      const rr = jobRatio(r.job_id, "regular_jobs_current");
      const pr = jobRatio(r.job_id, "parttime_jobs_current");
      const tr = jobRatio(r.job_id, "temp_jobs_current");
      return `<tr class="${r.job_id === state.selectedJobId ? "self-row" : ""}">
        <td class="left"><strong>${escapeHtml(r.job_name)}</strong><br><span class="muted">${escapeHtml(r.major_category)} ＞ ${escapeHtml(r.middle_category)}</span></td>
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
    const emp = els.prefEmployment.value;
    const meta = EMP[emp];

    els.prefectureControl.hidden = mode !== "compare";
    els.prefJobControl.hidden = mode !== "allPrefs";

    if (mode === "compare") {
      const pref = els.prefectureSelect.value || "東京都";
      const baseRow = state.idx.prefByJob.get(state.selectedJobId)?.get(pref);
      const base = numberOrNull(baseRow?.[meta.prefSalary]);

      const rows = state.related.map(r => {
        const pr = state.idx.prefByJob.get(r.job_id)?.get(pref);
        const value = numberOrNull(pr?.[meta.prefSalary]);
        const diff = value === null || base === null ? null : value - base;
        return { ...r, value, diff };
      });

      els.prefCaption.textContent = `${pref}｜${meta.label}の給与を、本人職種と周辺職種で比較`;
      els.prefTable.innerHTML = `<thead><tr><th>職種</th><th>抽出理由</th><th>${meta.label}給与</th><th>本人との差</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.job_id === state.selectedJobId ? "self-row" : ""}">
          <td class="left">${escapeHtml(r.job_name)}</td>
          <td class="left">${escapeHtml(r.reason)}</td>
          <td class="num">${formatSalary(r.value, emp)}</td>
          <td class="num ${metricClass(r.diff)}">${formatDiff(r.diff, emp)}</td>
        </tr>`).join("")}</tbody>`;
    } else {
      const jobId = els.prefJobSelect.value || state.selectedJobId;
      const c = state.idx.classById.get(jobId);
      const national = numberOrNull(summaryValues(jobId)[meta.summarySalary]);
      const byPref = state.idx.prefByJob.get(jobId) || new Map();

      els.prefCaption.textContent = `${c?.job_name || ""}｜${meta.label}の47都道府県データ（全国中央値との差を併記）`;
      els.prefTable.innerHTML = `<thead><tr><th>都道府県</th><th>${meta.label}給与</th><th>全国中央値との差</th></tr></thead>
        <tbody>${PREFECTURES.map(pref => {
          const value = numberOrNull(byPref.get(pref)?.[meta.prefSalary]);
          const diff = value === null || national === null ? null : value - national;
          return `<tr><td class="left">${pref}</td><td class="num">${formatSalary(value, emp)}</td><td class="num ${metricClass(diff)}">${formatDiff(diff, emp)}</td></tr>`;
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

    const legend = `<div class="chart-legend">${jobs.map((j,i) => `<span class="legend-item"><i class="legend-dot" style="background:${palette[i%palette.length]}"></i>${escapeHtml(j.job_name)}${j.job_id === state.selectedJobId ? "（本人）" : ""}</span>`).join("")}</div>`;
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

    if (emp === "all") {
      els.conditionTable.innerHTML = `<thead><tr><th>職種</th><th>条件</th><th>正社員年収</th><th>パート時給</th><th>派遣時給</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.job_id === state.selectedJobId ? "self-row" : ""}">
          <td class="left">${escapeHtml(r.job_name)}</td><td class="left">${escapeHtml(r.condition)}</td>
          <td class="num">${formatSalary(r.regular_salary_10k_yen, "regular")}</td>
          <td class="num">${formatSalary(r.parttime_salary_yen_hour, "parttime")}</td>
          <td class="num">${formatSalary(r.temp_salary_yen_hour, "temp")}</td>
        </tr>`).join("")}</tbody>`;
    } else {
      const meta = EMP[emp];
      els.conditionTable.innerHTML = `<thead><tr><th>職種</th><th>条件</th><th>${meta.label}給与</th></tr></thead>
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
