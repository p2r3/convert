const { app, BrowserWindow, protocol, net, shell } = require('electron');
const { URL } = require('node:url');
const path = require('path');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    }
  });

  mainWindow.loadURL('app://-/index.html');
}

app.whenReady().then(() => {
  // Handler: Map every app:// request to local file on disk
  protocol.handle('app', async (request) => {
    // Strip everything unneeded; app://, convert/
    let urlPath = request.url.replace('app://-/', '');
    if (urlPath.includes('convert/')) {
      urlPath = urlPath.replace('convert/', '');
    }

    // Remove query parameters or hashes just in case Vite adds them (e.g. ?worker_file)
    urlPath = urlPath.split('?')[0].split('#')[0];

    // Fetch the local file in dist
    const filePath = path.join(__dirname, '..', 'dist', urlPath);
    const response = await net.fetch('file://' + filePath);
    
    // Inject COR headers to allow SharedArrayBuffer in WASMs
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    if (parsedUrl.origin !== 'app://') {
      event.preventDefault()
      shell.openExternal(navigationUrl);
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
