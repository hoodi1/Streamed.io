const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

const isDev = process.env.NODE_ENV === 'development';
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
let mainWindow;
let audioCaptureProc = null;

function getPidForWindow(sourceId, sourceName) {
  if (sourceId.startsWith('window:')) {
    const parts = sourceId.split(':');
    const hwnd = parseInt(parts[1], 10);
    if (!isNaN(hwnd) && hwnd > 0) {
      try {
        const cmd = `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport(\\"user32.dll\\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId); }'; $p=0; [Win32]::GetWindowThreadProcessId([IntPtr]${hwnd}, [ref]$p); $p"`;
        const out = execSync(cmd, { encoding: 'utf8', timeout: 3000 });
        const pid = parseInt(out.trim(), 10);
        if (pid > 0) return pid;
      } catch (e) {}
    }
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#07070f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Required for getUserMedia with chromeMediaSource:'desktop'
    },
  });

  // Allow media / screen capture permissions
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'display-capture', 'screen'].includes(permission));
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ── Screen & Window sources IPC ──────────────────────────────────────────────
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 360, height: 203 },
    fetchWindowIcons: true,
  });

  return sources.map((s) => {
    const isWindow = s.id.startsWith('window:');
    const pid = isWindow ? getPidForWindow(s.id, s.name) : null;
    return {
      id:        s.id,
      name:      s.name,
      thumbnail: s.thumbnail.toDataURL(),
      display_id: s.display_id,
      type:      isWindow ? 'window' : 'screen',
      appIcon:   s.appIcon ? s.appIcon.toDataURL() : null,
      pid:       pid,
    };
  });
});

// ── WASAPI Process Audio Capture IPC ──────────────────────────────────────────
ipcMain.on('start-process-audio', (_event, pid) => {
  if (audioCaptureProc) {
    try { audioCaptureProc.kill(); } catch (e) {}
    audioCaptureProc = null;
  }

  if (!pid) return;

  const exePath = path.join(__dirname, 'AudioCapture.exe');
  console.log(`[Main] Spawning AudioCapture.exe for PID: ${pid}`);

  audioCaptureProc = spawn(exePath, [pid.toString()]);

  audioCaptureProc.stdout.on('data', (chunk) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process-audio-data', chunk);
    }
  });

  audioCaptureProc.stderr.on('data', (data) => {
    console.log(`[AudioCapture.exe] ${data.toString().trim()}`);
  });

  audioCaptureProc.on('exit', (code) => {
    console.log(`[AudioCapture.exe] exited with code ${code}`);
    audioCaptureProc = null;
  });
});

ipcMain.on('stop-process-audio', () => {
  if (audioCaptureProc) {
    try { audioCaptureProc.kill(); } catch (e) {}
    audioCaptureProc = null;
  }
});

// ── Window control IPC ────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (audioCaptureProc) {
    try { audioCaptureProc.kill(); } catch (e) {}
    audioCaptureProc = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
