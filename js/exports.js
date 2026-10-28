/* Exports autonomes : aucun CDN, aucune bibliothèque tierce. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const xml = value => escape(String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
  function rows(data) {
    RadioCore.validateNative(data);
    const result = [], seen = new Set(); let elapsed = 0, previous = null;
    for (const r of data.sequences) {
      const b = data.blocks.find(b => b.key === r.block_key);
      if (b && previous !== b.key) {
        result.push({ kind: 'block', cells: ['', 'BLOC', b.title, '', RadioDocument.formatDuration(data.sequences.filter(x => x.block_key === b.key).reduce((sum, x) => sum + x.duration_seconds, 0)), ''] }); seen.add(b.key);
      }
      result.push({ kind: 'sequence', cells: [RadioCore.clock(data.emission.start_time, elapsed), r.type, r.direct, r.recorded, RadioDocument.formatDuration(r.duration_seconds), r.who] });
      elapsed += r.duration_seconds; previous = b?.key || null;
    }
    for (const b of data.blocks) if (!seen.has(b.key)) result.push({ kind: 'block', cells: ['', 'BLOC VIDE', b.title, '', '00:00', ''] });
    result.push({ kind: 'end', cells: [RadioCore.clock(data.emission.start_time, elapsed), '', 'FIN D’ÉMISSION', '', RadioDocument.formatDuration(elapsed), ''] });
    return result;
  }
  function html(data) {
    const m = data.emission;
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(m.theme) + '</title><style>' +
      'body{font:14px system-ui,sans-serif;color:#18251e;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:7px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.block{background:#e8eee7;font-weight:bold}.end{font-weight:bold}thead{display:table-header-group}@media print{@page{size:A4 landscape;margin:10mm}body{margin:0;font-size:10px}tr{break-inside:avoid}}' +
      '</style></head><body><h1>' + escape(m.theme || 'Conduite radio') + '</h1><p>' + escape(m.emission_date || 'Sans date') + ' · Départ ' + escape(m.start_time) + '</p><table><thead><tr>' +
      ['Heure', 'Type', 'Direct', 'PAD / Enregistré', 'Durée', 'Qui'].map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows(data).map(r => '<tr class="' + r.kind + '">' + r.cells.map(c => '<td>' + escape(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>';
  }
  const encoder = new TextEncoder();
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const parts = [], directory = []; let offset = 0, centralSize = 0;
    const header = size => { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; };
    for (const [name, text] of Object.entries(files)) {
      const filename = encoder.encode(name), bytes = encoder.encode(text), crc = crc32(bytes);
      const local = header(30); local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x0800, true); local.view.setUint16(12, 33, true);
      local.view.setUint32(14, crc, true); local.view.setUint32(18, bytes.length, true); local.view.setUint32(22, bytes.length, true); local.view.setUint16(26, filename.length, true);
      parts.push(local.bytes, filename, bytes);
      const central = header(46); central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true); central.view.setUint16(8, 0x0800, true); central.view.setUint16(14, 33, true);
      central.view.setUint32(16, crc, true); central.view.setUint32(20, bytes.length, true); central.view.setUint32(24, bytes.length, true); central.view.setUint16(28, filename.length, true); central.view.setUint32(42, offset, true);
      directory.push(central.bytes, filename); centralSize += 46 + filename.length; offset += 30 + filename.length + bytes.length;
    }
    const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, directory.length / 2, true); end.view.setUint16(10, directory.length / 2, true); end.view.setUint32(12, centralSize, true); end.view.setUint32(16, offset, true);
    const output = new Uint8Array(offset + centralSize + 22); let cursor = 0;
    for (const part of [...parts, ...directory, end.bytes]) { output.set(part, cursor); cursor += part.length; }
    return output;
  }
  function xlsx(data) {
    const aoa = [[data.emission.theme], [(data.emission.emission_date || '') + ' · Départ ' + data.emission.start_time], [], ['Heure', 'Type', 'Direct', 'PAD / Enregistré', 'Durée', 'Qui'], ...rows(data).map(r => r.cells)];
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="' + ns + '"><cols><col min="1" max="2" width="16" customWidth="1"/><col min="3" max="4" width="45" customWidth="1"/><col min="5" max="6" width="20" customWidth="1"/></cols><sheetData>' + aoa.map((r, i) => '<row r="' + (i + 1) + '">' + r.map((c, j) => '<c r="' + String.fromCharCode(65 + j) + (i + 1) + '" t="inlineStr" s="0"><is><t xml:space="preserve">' + xml(c) + '</t></is></c>').join('') + '</row>').join('') + '</sheetData></worksheet>';
    return zip({
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="' + ns + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Conduite" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': '<?xml version="1.0"?><styleSheet xmlns="' + ns + '"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml': sheet
    });
  }
  globalThis.RadioExports = Object.freeze({ rows, html, xlsx });
})();
