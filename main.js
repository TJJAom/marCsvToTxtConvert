const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let fieldConfig = []; // 用來存儲從 CSV 讀取的欄位配置

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 解析 CSV 規則檔
function parseRulesCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('欄號')); // 過濾掉標題行和空行
  
  const rules = [];
  lines.forEach(line => {
    const cols = line.split(',').map(col => col.trim());
    // 檢查是否有起訖欄位且有欄位名稱
    if (cols[1] && cols[3] && cols[4]) {
      rules.push({
        name: cols[1], // 欄位名稱
        start: parseInt(cols[3]) - 1, // 起始位置(減1因為程式是從0開始)
        length: parseInt(cols[5]), // 佔位
        type: cols[6] || '', // 型態
        required: true
      });
    }
  });
  return rules;
}

// 處理檔案選擇 - CSV 規則檔
ipcMain.handle('select-rules', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  if (result.filePaths.length > 0) {
    try {
      fieldConfig = parseRulesCsv(result.filePaths[0]);
      return { success: true, message: '規則檔案載入成功' };
    } catch (error) {
      return { success: false, error: '規則檔案解析失敗: ' + error.message };
    }
  }
  return { success: false, error: '未選擇檔案' };
});

// 處理檔案選擇 - TXT 資料檔
ipcMain.handle('select-data', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  return result.filePaths;
});

function escapeCSV(field) {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// 處理檔案內容並輸出CSV
ipcMain.handle('process-file', async (event, filePath) => {
  try {
    // 檢查是否已載入規則
    if (fieldConfig.length === 0) {
      return { success: false, error: '請先載入規則檔案' };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line);
    
    let csvContent = [];
    
    // 第一行: 欄位名稱,資料1,資料2,資料3,...
    let firstRow = ['欄位名稱'];
    for (let i = 0; i < lines.length; i++) {
      firstRow.push(`資料${i + 1}`);
    }
    csvContent.push(firstRow.join(','));
    
    // 根據規則切分資料
    fieldConfig
      .filter(field => field.name && field.name.trim()) // 確保只處理有名稱的欄位
      .forEach(field => {
        let row = [field.name];
        lines.forEach(line => {
          const value = line.substr(field.start, field.length).trim();
          row.push(escapeCSV(value));
        });
        csvContent.push(row.join(','));
      });
    
    const outputPath = filePath.replace('.txt', '_output.csv');
    fs.writeFileSync(outputPath, '\uFEFF' + csvContent.join('\n'));
    
    return { success: true, path: outputPath };
  } catch (error) {
    console.error('Error processing file:', error);
    return { success: false, error: error.message };
  }
});