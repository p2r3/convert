const { app, BrowserWindow, protocol, net, shell } = require('electron');
const { URL, pathToFileURL } = require('node:url');
const path = require('path');

const DIST_PATH = path.join(__dirname, '..', 'dist');

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // Handler: Map every app:// request to local file on disk
  protocol.handle('app', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      if (parsedUrl.protocol !== 'app:' || parsedUrl.hostname !== '-') {
        return new Response('Invalid Request', { status: 400 });
      }

      // Strip everything uneeded
      let urlPath = parsedUrl.pathname;
      if (urlPath.startsWith('/')) {
        urlPath = urlPath.slice(1);
      }
      if (urlPath.startsWith('convert/')) {
        urlPath = urlPath.replace('convert/', '');
      }

      // Decode URL until stable
      let decodedPath = urlPath;
      try {
        while (decodedPath !== decodeURIComponent(decodedPath)) {
          decodedPath = decodeURIComponent(decodedPath);
        }
      } catch (e) {
        return new Response('Malformed URL', { status: 400 });
      }
      urlPath = decodedPath;

      const resolvedPath = path.resolve(DIST_PATH, urlPath);
      const relativePath = path.relative(DIST_PATH, resolvedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error("File requested not in dist.");
      }

      // Fetch the local file in dist
      const fileUrl = pathToFileURL(resolvedPath).href;
      const response = await net.fetch(fileUrl);

      // Inject COR headers to allow SharedArrayBuffer in WASMs
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
      });

    } catch (error) {
      return new Response('File Not Found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    if (parsedUrl.protocol !== 'app:') {
      event.preventDefault()
      // Open http(s) URLs in default browser
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:')
      {
        shell.openExternal(navigationUrl);
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
