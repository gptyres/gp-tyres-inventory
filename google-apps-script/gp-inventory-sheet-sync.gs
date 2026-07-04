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
