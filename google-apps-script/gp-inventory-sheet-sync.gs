const GP_SYNC_CONFIG = {
  spreadsheetId: '1QJp8o-KzSNIn2xUCS_0o8gNqYzbBP7jYQ_rqtxYw0VY',
  sheetName: 'INVENTORY',
  functionUrl: 'https://moiybakshvuvppesbnpt.supabase.co/functions/v1/sync-sheet-inventory',
  tokenPropertyName: 'SHEET_INVENTORY_SYNC_TOKEN',
  firstDataRow: 2,
  readColumnCount: 7,
  portalIdColumn: 24,
  lastSyncedAtColumn: 25,
  syncStatusColumn: 26
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('GP Portal')
    .addItem('Sync Inventory Now', 'syncInventoryNow')
    .addItem('Repair Sync Trigger', 'repairInventorySyncTrigger')
    .addItem('Show Last Sync', 'showLastInventorySync')
    .addToUi();
}

function repairInventorySyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'handleInventoryEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('handleInventoryEdit')
    .forSpreadsheet(SpreadsheetApp.openById(GP_SYNC_CONFIG.spreadsheetId))
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert('GP Portal inventory sync trigger repaired.');
}

function handleInventoryEdit(event) {
  const range = event && event.range;
  if (!range) return;

  const sheet = range.getSheet();
  if (sheet.getName() !== GP_SYNC_CONFIG.sheetName) return;
  if (range.getLastColumn() < 1 || range.getColumn() > GP_SYNC_CONFIG.readColumnCount) return;
  if (range.getLastRow() < GP_SYNC_CONFIG.firstDataRow) return;

  const startRow = Math.max(range.getRow(), GP_SYNC_CONFIG.firstDataRow);
  const rowCount = range.getLastRow() - startRow + 1;
  syncInventoryRows_(sheet, startRow, rowCount, 'batch');
}

function syncInventoryNow() {
  const sheet = SpreadsheetApp.openById(GP_SYNC_CONFIG.spreadsheetId).getSheetByName(GP_SYNC_CONFIG.sheetName);
  if (!sheet) throw new Error('INVENTORY sheet was not found.');

  ensureHelperHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < GP_SYNC_CONFIG.firstDataRow) {
    SpreadsheetApp.getUi().alert('No inventory rows found.');
    return;
  }

  const result = syncInventoryRows_(sheet, GP_SYNC_CONFIG.firstDataRow, lastRow - 1, 'full');
  SpreadsheetApp.getUi().alert(`GP Portal sync complete.\nUpdated: ${result.rowsUpserted}\nSkipped: ${result.rowsSkipped}`);
}

function showLastInventorySync() {
  const lastSync = PropertiesService.getDocumentProperties().getProperty('LAST_GP_PORTAL_SYNC') || 'No sync recorded yet.';
  SpreadsheetApp.getUi().alert(lastSync);
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData && event.postData.contents ? event.postData.contents : '{}');
    const token = PropertiesService.getScriptProperties().getProperty(GP_SYNC_CONFIG.tokenPropertyName);
    if (!token || payload.token !== token) {
      return jsonResponse_({ ok: false, error: 'Unauthorized portal sheet sync.' }, 401);
    }

    if (payload.action !== 'portalToSheet') {
      return jsonResponse_({ ok: false, error: 'Unsupported action.' }, 400);
    }

    const sheet = SpreadsheetApp.openById(GP_SYNC_CONFIG.spreadsheetId).getSheetByName(GP_SYNC_CONFIG.sheetName);
    if (!sheet) throw new Error('INVENTORY sheet was not found.');

    const result = syncPortalItemsToSheet_(sheet, payload.items || [], payload.reason || 'portal-to-sheet');
    return jsonResponse_({ ok: true, ...result });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error && error.message ? error.message : String(error) }, 500);
  }
}

function syncInventoryRows_(sheet, startRow, rowCount, mode) {
  ensureHelperHeaders_(sheet);

  const values = sheet.getRange(startRow, 1, rowCount, GP_SYNC_CONFIG.readColumnCount).getValues();
  const portalIds = sheet.getRange(startRow, GP_SYNC_CONFIG.portalIdColumn, rowCount, 1).getValues();
  const rows = values.map((rowValues, index) => ({
    rowNumber: startRow + index,
    values: rowValues,
    portalId: portalIds[index] && portalIds[index][0] ? String(portalIds[index][0]) : ''
  }));

  const token = PropertiesService.getScriptProperties().getProperty(GP_SYNC_CONFIG.tokenPropertyName);
  if (!token) {
    throw new Error(`Missing script property ${GP_SYNC_CONFIG.tokenPropertyName}.`);
  }

  const response = UrlFetchApp.fetch(GP_SYNC_CONFIG.functionUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-sheet-inventory-sync-token': token
    },
    payload: JSON.stringify({
      spreadsheetId: GP_SYNC_CONFIG.spreadsheetId,
      sheetName: GP_SYNC_CONFIG.sheetName,
      mode,
      rows
    })
  });

  const responseText = response.getContentText();
  const result = JSON.parse(responseText);
  if (response.getResponseCode() >= 400 || !result.ok) {
    throw new Error(result.error || responseText);
  }

  applySyncResults_(sheet, result.rowResults || []);
  PropertiesService.getDocumentProperties().setProperty(
    'LAST_GP_PORTAL_SYNC',
    `${new Date().toLocaleString('en-ZA')} - Updated ${result.rowsUpserted}, skipped ${result.rowsSkipped}`
  );

  return result;
}

function applySyncResults_(sheet, rowResults) {
  const now = new Date();
  rowResults.forEach((rowResult) => {
    if (!rowResult.rowNumber) return;

    if (rowResult.portalId) {
      sheet.getRange(rowResult.rowNumber, GP_SYNC_CONFIG.portalIdColumn).setValue(rowResult.portalId);
    }
    sheet.getRange(rowResult.rowNumber, GP_SYNC_CONFIG.lastSyncedAtColumn).setValue(now);
    sheet.getRange(rowResult.rowNumber, GP_SYNC_CONFIG.syncStatusColumn).setValue(`${rowResult.status}: ${rowResult.message}`);
  });
}

function syncPortalItemsToSheet_(sheet, items, reason) {
  ensureHelperHeaders_(sheet);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const lastRow = Math.max(sheet.getLastRow(), GP_SYNC_CONFIG.firstDataRow);
    const portalIdValues = sheet
      .getRange(GP_SYNC_CONFIG.firstDataRow, GP_SYNC_CONFIG.portalIdColumn, Math.max(1, lastRow - GP_SYNC_CONFIG.firstDataRow + 1), 1)
      .getValues();
    const visibleValues = sheet
      .getRange(GP_SYNC_CONFIG.firstDataRow, 1, Math.max(1, lastRow - GP_SYNC_CONFIG.firstDataRow + 1), GP_SYNC_CONFIG.readColumnCount)
      .getValues();
    const existingRowsByPortalId = {};
    const existingRowsByFingerprint = {};
    portalIdValues.forEach((row, index) => {
      const portalId = row[0] ? String(row[0]).trim() : '';
      if (portalId) existingRowsByPortalId[portalId] = GP_SYNC_CONFIG.firstDataRow + index;
    });
    visibleValues.forEach((row, index) => {
      const fingerprint = makePortalRowFingerprint_(row);
      if (fingerprint && !existingRowsByFingerprint[fingerprint]) {
        existingRowsByFingerprint[fingerprint] = GP_SYNC_CONFIG.firstDataRow + index;
      }
    });

    const now = new Date();
    const results = [];
    let updated = 0;
    let appended = 0;
    let skipped = 0;

    items.forEach((item) => {
      if (!item || !item.portalId || !Array.isArray(item.values) || item.values.length < GP_SYNC_CONFIG.readColumnCount) {
        skipped += 1;
        results.push({ portalId: item && item.portalId, status: 'skipped', message: 'Invalid portal item payload.' });
        return;
      }

      const portalId = String(item.portalId).trim();
      const rowValues = item.values.slice(0, GP_SYNC_CONFIG.readColumnCount);
      if (item.operation === 'delete') {
        rowValues[4] = 0;
      }
      const rowNumber = existingRowsByPortalId[portalId]
        || existingRowsByFingerprint[makePortalRowFingerprint_(rowValues)]
        || Math.max(sheet.getLastRow() + 1, GP_SYNC_CONFIG.firstDataRow);

      sheet.getRange(rowNumber, 1, 1, GP_SYNC_CONFIG.readColumnCount).setValues([rowValues]);
      sheet.getRange(rowNumber, GP_SYNC_CONFIG.portalIdColumn, 1, 3).setValues([[
        portalId,
        now,
        `${item.operation || 'upsert'} from portal: ${reason}`
      ]]);

      existingRowsByPortalId[portalId] = rowNumber;
      existingRowsByFingerprint[makePortalRowFingerprint_(rowValues)] = rowNumber;
      if (rowNumber > lastRow) appended += 1;
      else updated += 1;
      results.push({ rowNumber, portalId, status: item.operation === 'delete' ? 'deleted' : 'upserted', message: 'Synced from portal.' });
    });

    PropertiesService.getDocumentProperties().setProperty(
      'LAST_GP_PORTAL_SYNC',
      `${now.toLocaleString('en-ZA')} - Portal updated ${updated}, appended ${appended}, skipped ${skipped}`
    );

    return { updated, appended, skipped, results };
  } finally {
    lock.releaseLock();
  }
}

function makePortalRowFingerprint_(rowValues) {
  if (!rowValues || rowValues.length < 4) return '';
  return [
    normalizePortalCell_(rowValues[0]),
    normalizePortalCell_(rowValues[2] || rowValues[1]),
    normalizePortalCell_(rowValues[3])
  ].join('|');
}

function normalizePortalCell_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function ensureHelperHeaders_(sheet) {
  if (sheet.getMaxColumns() < GP_SYNC_CONFIG.syncStatusColumn) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), GP_SYNC_CONFIG.syncStatusColumn - sheet.getMaxColumns());
  }

  sheet.getRange(1, GP_SYNC_CONFIG.portalIdColumn, 1, 3).setValues([[
    'PORTAL_ID',
    'LAST_SYNCED_AT',
    'LAST_SYNC_STATUS'
  ]]);
  sheet.hideColumns(GP_SYNC_CONFIG.portalIdColumn, 3);
}

function jsonResponse_(body, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ statusCode: statusCode || 200, ...body }))
    .setMimeType(ContentService.MimeType.JSON);
}
