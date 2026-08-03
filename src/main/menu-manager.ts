/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  Tray, nativeImage, Menu, BrowserWindow, ipcMain, screen, MenuItemConstructorOptions, app,
} from 'electron';
// @ts-expect-error
import trayIcon from '../../resources/icon.png?asset';

export interface ConfigFile {
  filename: string;
  name: string;
}

export class MenuManager {
  private tray: Tray | null = null;

  private currentMode: 'window' | 'pet' = 'window';

  private language: 'en' | 'zh' = 'zh';

  private configFiles: ConfigFile[] = [];

  constructor(private onModeChange: (mode: 'window' | 'pet') => void) {
    this.setupContextMenu();
    ipcMain.on('ui-language-changed', (_event, language: string) => {
      this.language = language === 'en' ? 'en' : 'zh';
      this.updateTrayMenu();
    });
  }

  private label(key: keyof typeof labels.en): string {
    return labels[this.language][key];
  }

  createTray(): void {
    const icon = nativeImage.createFromPath(trayIcon);
    const trayIconResized = icon.resize({
      width: process.platform === 'win32' ? 16 : 18,
      height: process.platform === 'win32' ? 16 : 18,
    });

    this.tray = new Tray(trayIconResized);
    this.updateTrayMenu();
  }

  private getModeMenuItems(): MenuItemConstructorOptions[] {
    // console.log('Getting mode menu items, current mode:', this.currentMode)
    return [
      {
        label: this.label('windowMode'),
        type: 'radio' as const,
        checked: this.currentMode === 'window',
        click: () => {
          this.setMode('window');
        },
      },
      {
        label: this.label('petMode'),
        type: 'radio' as const,
        checked: this.currentMode === 'pet',
        click: () => {
          this.setMode('pet');
        },
      },
    ];
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;
    // console.log('Updating tray menu, current mode:', this.currentMode)

    const contextMenu = Menu.buildFromTemplate([
      ...this.getModeMenuItems(),
      { type: 'separator' as const },
      // Only show toggle mouse ignore in pet mode
      ...(this.currentMode === 'pet'
        ? [
          {
            label: this.label('toggleMousePassthrough'),
            click: () => {
              const windows = BrowserWindow.getAllWindows();
              windows.forEach((window) => {
                window.webContents.send('toggle-force-ignore-mouse');
              });
            },
          },
          { type: 'separator' as const },
        ]
        : []),
      {
        label: this.label('show'),
        click: () => {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.show();
          });
        },
      },
      {
        label: this.label('hide'),
        click: () => {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.hide();
          });
        },
      },
      {
        label: this.label('exit'),
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setToolTip(this.label('applicationName'));
    this.tray.setContextMenu(contextMenu);
  }

  private getContextMenuItems(event: Electron.IpcMainEvent): MenuItemConstructorOptions[] {
    const template: MenuItemConstructorOptions[] = [
      {
        label: this.label('toggleMicrophone'),
        click: () => {
          event.sender.send('mic-toggle');
        },
      },
      {
        label: this.label('interrupt'),
        click: () => {
          event.sender.send('interrupt');
        },
      },
      { type: 'separator' as const },
      // Only show in pet mode
      ...(this.currentMode === 'pet'
        ? [
          {
            label: this.label('toggleMousePassthrough'),
            click: () => {
              event.sender.send('toggle-force-ignore-mouse');
            },
          },
        ]
        : []),
      {
        label: this.label('toggleScrollToResize'),
        click: () => {
          event.sender.send('toggle-scroll-to-resize');
        },
      },
      // Only show this item in pet mode
      ...(this.currentMode === 'pet'
        ? [
          {
            label: this.label('toggleInputAndSubtitle'),
            click: () => {
              event.sender.send('toggle-input-subtitle');
            },
          },
        ]
        : []),
      { type: 'separator' as const },
      ...this.getModeMenuItems(),
      { type: 'separator' as const },
      {
        label: this.label('switchCharacter'),
        visible: this.currentMode === 'pet',
        submenu: this.configFiles.map((config) => ({
          label: config.name,
          click: () => {
            event.sender.send('switch-character', config.filename);
          },
        })),
      },
      { type: 'separator' as const },
      {
        label: this.label('hide'),
        click: () => {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.hide();
          });
        },
      },
      {
        label: this.label('exit'),
        click: () => {
          app.quit();
        },
      },
    ];
    return template;
  }

  private setupContextMenu(): void {
    ipcMain.on('show-context-menu', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const screenPoint = screen.getCursorScreenPoint();
        const menu = Menu.buildFromTemplate(this.getContextMenuItems(event));
        menu.popup({
          window: win,
          x: Math.round(screenPoint.x),
          y: Math.round(screenPoint.y),
        });
      }
    });
  }

  setMode(mode: 'window' | 'pet'): void {
    // console.log('Setting mode from', this.currentMode, 'to', mode)
    this.currentMode = mode;
    this.updateTrayMenu();
    this.onModeChange(mode);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  updateConfigFiles(files: ConfigFile[]): void {
    this.configFiles = files;
  }
}

const labels = {
  en: {
    applicationName: 'Open LLM VTuber',
    windowMode: 'Window Mode',
    petMode: 'Pet Mode',
    toggleMousePassthrough: 'Toggle Mouse Passthrough',
    show: 'Show',
    hide: 'Hide',
    exit: 'Exit',
    toggleMicrophone: 'Toggle Microphone',
    interrupt: 'Interrupt',
    toggleScrollToResize: 'Toggle Scrolling to Resize',
    toggleInputAndSubtitle: 'Toggle Input Box and Subtitle',
    switchCharacter: 'Switch Character',
  },
  zh: {
    applicationName: 'Open LLM VTuber',
    windowMode: '視窗模式',
    petMode: '桌寵模式',
    toggleMousePassthrough: '切換滑鼠穿透',
    show: '顯示',
    hide: '隱藏',
    exit: '結束',
    toggleMicrophone: '切換麥克風',
    interrupt: '中斷',
    toggleScrollToResize: '切換捲動縮放',
    toggleInputAndSubtitle: '切換輸入框與字幕',
    switchCharacter: '切換角色',
  },
} as const;
