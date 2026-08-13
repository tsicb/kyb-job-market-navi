(() => {
  "use strict";

  const enc = new TextEncoder();
  const BRAND = "1E88E5";
  const BRAND_SOFT = "EAF6FD";
  const BORDER = "DCE6EE";
  const TEXT = "1F2937";
  const MUTED = "64748B";

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function colName(n) {
    let s = "";
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  function sanitizeSheetName(name, index) {
    const cleaned = String(name || `Sheet${index + 1}`)
      .replace(/[\\/*?:\[\]]/g, "_")
      .slice(0, 31)
      .trim();
    return cleaned || `Sheet${index + 1}`;
  }

  function styleId(format, highlight) {
    const base = {
      text: 5,
      integer: 6,
      regularSalary: 7,
      yen: 8,
      diffRegular: 9,
      diffYen: 10,
      ratio: 11
    }[format] || 5;
    if (!highlight) return base;
    return base + 7;
  }

  function cellXml(ref, value, style, type = "text") {
    if (value === null || value === undefined || value === "") {
      return `<c r="${ref}" s="${style}"/>`;
    }
    if (type !== "text" && typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    }
    const text = xmlEscape(value);
    const preserve = /^\s|\s$|\n/.test(String(value)) ? ' xml:space="preserve"' : "";
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
  }

  function buildWorksheetXml(sheet) {
    const columns = sheet.columns || [];
    const meta = sheet.meta || [];
    const rows = sheet.rows || [];
    const lastCol = colName(Math.max(1, columns.length));
    const headerRow = 4;
    const dataStartRow = headerRow + 1;
    const lastRow = Math.max(headerRow, dataStartRow + rows.length - 1);

    const rowXml = [];
    const titleCells = columns.map((_, i) => cellXml(`${colName(i + 1)}1`, i === 0 ? (sheet.title || sheet.name) : "", 1, "text")).join("");
    rowXml.push(`<row r="1" ht="27" customHeight="1">${titleCells}</row>`);
    const metaText = meta.map(m => `${m.label}：${m.value ?? ""}`).join(" ｜ ");
    rowXml.push(`<row r="2" ht="34" customHeight="1">${cellXml("A2", metaText, 3, "text")}</row>`);

    const headerCells = columns.map((c, i) => cellXml(`${colName(i + 1)}${headerRow}`, c.header, 4, "text")).join("");
    rowXml.push(`<row r="${headerRow}" ht="25" customHeight="1">${headerCells}</row>`);

    rows.forEach((row, ri) => {
      const r = dataStartRow + ri;
      const values = row.values || row;
      const highlight = !!row.highlight;
      const cells = columns.map((c, ci) => {
        const value = values[ci];
        const format = c.format || "text";
        const numeric = format !== "text";
        return cellXml(`${colName(ci + 1)}${r}`, value, styleId(format, highlight), numeric ? "number" : "text");
      }).join("");
      rowXml.push(`<row r="${r}">${cells}</row>`);
    });

    const colsXml = columns.length
      ? `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(c.width) || 16}" customWidth="1"/>`).join("")}</cols>`
      : "";
    const autoFilter = columns.length ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow}"/>` : "";

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${dataStartRow}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${dataStartRow}" sqref="A${dataStartRow}"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${colsXml}
  <sheetData>${rowXml.join("")}</sheetData>
  ${autoFilter}
  ${columns.length > 1 ? `<mergeCells count="1"><mergeCell ref="A2:${lastCol}2"/></mergeCells>` : ""}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
  }

  function buildStylesXml() {
    const xfs = [];
    const xf = (numFmtId, fontId, fillId, borderId, align = "") =>
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="${numFmtId ? 1 : 0}" applyAlignment="1"><alignment vertical="center"${align}/></xf>`;

    xfs.push(xf(0, 0, 0, 0)); // 0 default
    xfs.push(xf(0, 1, 2, 0, ' horizontal="left"')); // 1 title
    xfs.push(xf(0, 2, 0, 0, ' horizontal="left"')); // 2 meta label
    xfs.push(xf(0, 0, 0, 0, ' horizontal="left" wrapText="1"')); // 3 meta value
    xfs.push(xf(0, 3, 2, 1, ' horizontal="center" wrapText="1"')); // 4 header
    xfs.push(xf(0, 0, 0, 1, ' horizontal="left"')); // 5 text
    xfs.push(xf(164, 0, 0, 1, ' horizontal="right"')); // 6 integer
    xfs.push(xf(165, 0, 0, 1, ' horizontal="right"')); // 7 regular salary
    xfs.push(xf(166, 0, 0, 1, ' horizontal="right"')); // 8 yen
    xfs.push(xf(167, 0, 0, 1, ' horizontal="right"')); // 9 diff regular
    xfs.push(xf(168, 0, 0, 1, ' horizontal="right"')); // 10 diff yen
    xfs.push(xf(169, 0, 0, 1, ' horizontal="right"')); // 11 ratio
    xfs.push(xf(0, 2, 3, 1, ' horizontal="left"')); // 12 highlighted text
    xfs.push(xf(164, 2, 3, 1, ' horizontal="right"')); // 13
    xfs.push(xf(165, 2, 3, 1, ' horizontal="right"')); // 14
    xfs.push(xf(166, 2, 3, 1, ' horizontal="right"')); // 15
    xfs.push(xf(167, 2, 3, 1, ' horizontal="right"')); // 16
    xfs.push(xf(168, 2, 3, 1, ' horizontal="right"')); // 17
    xfs.push(xf(169, 2, 3, 1, ' horizontal="right"')); // 18

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="6">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="0&quot;万円&quot;"/>
    <numFmt numFmtId="166" formatCode="#,##0&quot;円&quot;"/>
    <numFmt numFmtId="167" formatCode="+0&quot;万円&quot;;-0&quot;万円&quot;;0&quot;万円&quot;"/>
    <numFmt numFmtId="168" formatCode="+#,##0&quot;円&quot;;-#,##0&quot;円&quot;;0&quot;円&quot;"/>
    <numFmt numFmtId="169" formatCode="0.00&quot;倍&quot;"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF${TEXT}"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF${TEXT}"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${BRAND}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${BRAND_SOFT}"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF${BORDER}"/></left><right style="thin"><color rgb="FF${BORDER}"/></right><top style="thin"><color rgb="FF${BORDER}"/></top><bottom style="thin"><color rgb="FF${BORDER}"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
  <cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
  }

  function workbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000" activeTab="0"/></bookViews>
  <sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
  <calcPr calcId="191029"/>
</workbook>`;
  }

  function workbookRelsXml(count) {
    const sheets = Array.from({ length: count }, (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    ).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  }

  function contentTypesXml(count) {
    const sheetOverrides = Array.from({ length: count }, (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;
  }

  function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    return b;
  }

  function u32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    return b;
  }

  function concat(parts) {
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return out;
  }

  function dosDateTime(date) {
    const d = date instanceof Date ? date : new Date();
    const year = Math.max(1980, d.getFullYear());
    const dosTime = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31);
    const dosDate = (((year - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { dosTime, dosDate };
  }

  function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const { dosTime, dosDate } = dosDateTime(new Date());

    for (const file of files) {
      const name = enc.encode(file.name);
      const data = typeof file.data === "string" ? enc.encode(file.data) : file.data;
      const crc = crc32(data);
      const flags = 0x0800;
      const localHeader = concat([
        u32(0x04034B50), u16(20), u16(flags), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name
      ]);
      locals.push(localHeader, data);

      const centralHeader = concat([
        u32(0x02014B50), u16(20), u16(20), u16(flags), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), name
      ]);
      centrals.push(centralHeader);
      offset += localHeader.length + data.length;
    }

    const centralData = concat(centrals);
    const localData = concat(locals);
    const eocd = concat([
      u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralData.length), u32(localData.length), u16(0)
    ]);
    return concat([localData, centralData, eocd]);
  }

  function buildWorkbookBlob(spec) {
    const inputSheets = Array.isArray(spec?.sheets) ? spec.sheets : [];
    if (!inputSheets.length) throw new Error("Excel出力対象の表がありません。");

    const used = new Set();
    const sheets = inputSheets.map((sheet, i) => {
      let name = sanitizeSheetName(sheet.name, i);
      const base = name;
      let suffix = 2;
      while (used.has(name)) {
        const tail = `_${suffix++}`;
        name = `${base.slice(0, 31 - tail.length)}${tail}`;
      }
      used.add(name);
      return { ...sheet, name };
    });

    const files = [
      { name: "[Content_Types].xml", data: contentTypesXml(sheets.length) },
      { name: "_rels/.rels", data: rootRelsXml() },
      { name: "xl/workbook.xml", data: workbookXml(sheets) },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml(sheets.length) },
      { name: "xl/styles.xml", data: buildStylesXml() }
    ];
    sheets.forEach((sheet, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: buildWorksheetXml(sheet) }));

    const bytes = zipStore(files);
    return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function downloadWorkbook(spec, filename) {
    const blob = buildWorkbookBlob(spec);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "求人市場ナビ.xlsx";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.MiniXLSX = { buildWorkbookBlob, downloadWorkbook };
})();
