import { app, BrowserWindow, shell, protocol, net } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'

const isDev = !app.isPackaged

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:3000/editor')
    win.webContents.openDevTools()
  } else {
    win.loadURL('app://./editor/index.html')
  }

  return win
}

app.whenReady().then(() => {
  // Register custom protocol to serve static Next.js export in production
  protocol.handle('app', (request) => {
    const urlPath = new URL(request.url).pathname
    const rendererPath = path.join(process.resourcesPath, 'renderer')
    const filePath = path.join(rendererPath, urlPath)

    // Security: prevent path traversal attacks
    if (!filePath.startsWith(rendererPath)) {
      return new Response('Forbidden', { status: 403 })
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
