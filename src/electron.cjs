const {
  app,
  BrowserWindow,
  protocol,
  net,
  shell,
  dialog,
  ipcMain,
  Notification,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { URL, pathToFileURL } = require("node:url");
const path = require("path");
const fs = require("fs");

// Not __dirname, which gets hardcoded to the build machine's path when bundled
const DIST_PATH = path.join(app.getAppPath(), "dist");
const RELEASE_URL = "https://github.com/p2r3/convert/releases/tag/latest";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(app.getAppPath(), "src", "electron-preload.cjs"),
    },
  });

  mainWindow.loadURL("app://-/index.html");

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

const UPDATE_SETTINGS_PATH = path.join(app.getPath("userData"), "update-settings.json");

// Squirrel.Mac refuses to install unsigned updates, so macOS only links to the release
const CAN_INSTALL_UPDATES = process.platform !== "darwin";

let updateState = {
  status: "idle",
  supported: false,
  canInstall: CAN_INSTALL_UPDATES,
  autoUpdate: true,
  progress: 0,
};

// Only show OS notifications/dialogs for checks the user didn't start from settings
let notifyUser = false;

function readUpdateSettings() {
  try {
    return { autoUpdate: true, ...JSON.parse(fs.readFileSync(UPDATE_SETTINGS_PATH, "utf8")) };
  } catch {
    return { autoUpdate: true };
  }
}

function writeUpdateSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(UPDATE_SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(UPDATE_SETTINGS_PATH, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save update settings:", error);
  }
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("updater:state", updateState);
  }
}

function checkForUpdates(fromUser) {
  if (!updateState.supported) return;
  if (["checking", "downloading", "downloaded"].includes(updateState.status)) return;
  if (CAN_INSTALL_UPDATES && updateState.status === "available") return;
  notifyUser = !fromUser;
  autoUpdater.checkForUpdates().catch(() => {});
}

function isAppSender(event) {
  return event.senderFrame?.url.startsWith("app://-/") ?? false;
}

function setupUpdater() {
  autoUpdater.autoDownload = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({ status: "checking" });
  });

  autoUpdater.on("update-not-available", () => {
    setUpdateState({ status: "up-to-date" });
  });

  autoUpdater.on("update-available", async () => {
    setUpdateState({ status: "available" });

    if (CAN_INSTALL_UPDATES) {
      autoUpdater.downloadUpdate().catch(() => {});
      return;
    }
    if (!notifyUser) return;

    const { response } = await dialog.showMessageBox({
      type: "info",
      message: "Update available",
      detail: "A new version of Convert to it! is available.",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) shell.openExternal(RELEASE_URL);
  });

  autoUpdater.on("download-progress", (progress) => {
    setUpdateState({ status: "downloading", progress: progress.percent });
  });

  autoUpdater.on("update-downloaded", () => {
    setUpdateState({ status: "downloaded" });

    if (notifyUser && Notification.isSupported()) {
      new Notification({
        title: "Update ready",
        body: "The update will be installed when you quit.",
      }).show();
    }
  });

  autoUpdater.on("error", (error) => {
    console.error("Update failed:", error);
    setUpdateState({ status: "error" });
  });

  ipcMain.handle("updater:get-state", (event) => (isAppSender(event) ? updateState : null));

  ipcMain.handle("updater:check", (event) => {
    if (isAppSender(event)) checkForUpdates(true);
  });

  ipcMain.handle("updater:set-auto-update", (event, enabled) => {
    if (!isAppSender(event)) return;
    const autoUpdate = enabled === true;
    writeUpdateSettings({ ...readUpdateSettings(), autoUpdate });
    setUpdateState({ autoUpdate });
    if (autoUpdate && updateState.status === "idle") checkForUpdates(true);
  });

  ipcMain.handle("updater:install", (event) => {
    if (isAppSender(event) && updateState.status === "downloaded") autoUpdater.quitAndInstall();
  });

  ipcMain.handle("updater:open-release", (event) => {
    if (isAppSender(event)) shell.openExternal(RELEASE_URL);
  });

  // False in dev builds and in Linux builds that aren't run as an AppImage
  const supported = app.isPackaged && autoUpdater.isUpdaterActive();
  const { autoUpdate } = readUpdateSettings();
  setUpdateState({ supported, autoUpdate });
  if (autoUpdate) checkForUpdates(false);
}

app.whenReady().then(() => {
  // Handler: Map every app:// request to local file on disk
  protocol.handle("app", async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      if (parsedUrl.protocol !== "app:" || parsedUrl.hostname !== "-") {
        return new Response("Invalid Request", { status: 400 });
      }

      // Strip everything uneeded
      let urlPath = parsedUrl.pathname;
      if (urlPath.startsWith("/")) {
        urlPath = urlPath.slice(1);
      }
      if (urlPath.startsWith("convert/")) {
        urlPath = urlPath.replace("convert/", "");
      }

      // Decode URL until stable
      let decodedPath = urlPath;
      try {
        while (decodedPath !== decodeURIComponent(decodedPath)) {
          decodedPath = decodeURIComponent(decodedPath);
        }
      } catch {
        return new Response("Malformed URL", { status: 400 });
      }
      urlPath = decodedPath;

      const resolvedPath = path.resolve(DIST_PATH, urlPath);
      const relativePath = path.relative(DIST_PATH, resolvedPath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error("File requested not in dist.");
      }

      // Fetch the local file in dist
      const fileUrl = pathToFileURL(resolvedPath).href;
      const response = await net.fetch(fileUrl);

      // Inject COR headers to allow SharedArrayBuffer in WASMs
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "credentialless");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });
    } catch {
      return new Response("File Not Found", { status: 404 });
    }
  });

  createWindow();
  setupUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("web-contents-created", (event, contents) => {
  contents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== "app:") {
      event.preventDefault();
      // Open http(s) URLs in default browser
      if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
        shell.openExternal(navigationUrl);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
