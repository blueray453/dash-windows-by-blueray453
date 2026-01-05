import GLib from 'gi://GLib';

import St from 'gi://St';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { setLogging, setLogFn, journal } from './utils.js';

const Display = global.display;
const WindowTracker = global.get_window_tracker();
const WorkspaceManager = global.workspace_manager;

const ICON_SIZE = 48;

class WindowListButton extends PanelMenu.Button {
  static {
    GObject.registerClass(this);
  }

  constructor() {
    super(0.5, 'Window List Menu');

    journal('Button initialized');

    // Create icon for the panel button
    this._icon = new St.Icon({
      icon_name: 'view-list-symbolic',
      style_class: 'system-status-icon',
      icon_size: ICON_SIZE,
    });
    this.add_child(this._icon);

    journal('Icon added');

    // Handle button click
    this.connect('button-press-event', (actor, event) => {
      let button = event.get_button();
      journal('Button pressed: ' + button);

      if (button === Clutter.BUTTON_PRIMARY) { // Left click
        journal('Left click detected');
        this._refreshWindowList();
        this.menu.open(true);
        return Clutter.EVENT_STOP;
      }

      return Clutter.EVENT_PROPAGATE;
    });

    // Connect to workspace changes
    WorkspaceManager.connect(
      'active-workspace-changed',
      () => {
        if (this.menu.isOpen) {
          this._refreshWindowList();
        }
      }
    );

    // Connect to window changes
    Display.connect('window-created', () => {
      if (this.menu.isOpen) {
        this._refreshWindowList();
      }
    });

    journal('Setup complete');
  }

  _refreshWindowList() {
    journal('Refreshing window list');

    // Clear existing menu items
    this.menu.removeAll();

    // Get windows in current workspace
    const workspace = WorkspaceManager.get_active_workspace();
    const windows = Display.get_tab_list(Meta.TabList.NORMAL, workspace);

    journal('Found ' + windows.length + ' windows');

    if (windows.length === 0) {
      let item = new PopupMenu.PopupMenuItem('No windows');
      item.setSensitive(false);
      this.menu.addMenuItem(item);
      journal('Added "No windows" item');
      return;
    }

    // Add each window as a menu item
    windows.forEach((metaWindow, index) => {
      const app = WindowTracker.get_window_app(metaWindow);
      let icon = null;

      if (app) {
        icon = app.create_icon_texture(ICON_SIZE);
      }

      if (!icon) {
        icon = new St.Icon({
          icon_name: 'application-x-executable',
          icon_size: ICON_SIZE
        });
      }

      const title = metaWindow.title || 'Unknown';

      const item = new PopupMenu.PopupImageMenuItem(title, icon.get_gicon());
      item.add_style_class_name('window-list-item');

      // Handle both left and right click via the activate signal
      item.connect('activate', (menuItem, event) => {
        if (event.get_button() === 3) {  // Right click
          journal('Right click on window: ' + title);
          metaWindow.delete(global.get_current_time());
          this.menu.close();
          return Clutter.EVENT_STOP;
        } else {  // Left click
          journal('Left click on window: ' + title);
          this._onWindowActivate(metaWindow);
          return Clutter.EVENT_STOP;
        }
      });

      // Highlight focused window
      if (metaWindow.has_focus()) {
        item.setOrnament(PopupMenu.Ornament.DOT);
      }

      this.menu.addMenuItem(item);
    });

    journal('Finished adding ' + windows.length + ' windows');
  }

  _onWindowActivate(metaWindow) {
    const currentFocused = Display.focus_window;

    // If clicking already focused window, switch to previous
    if (metaWindow === currentFocused) {
      journal('Window already focused, switching to previous');
      const workspace = WorkspaceManager.get_active_workspace();
      const previousWindow = Display.get_tab_next(
        Meta.TabList.NORMAL,
        workspace,
        metaWindow,
        false
      );

      if (previousWindow && previousWindow !== metaWindow) {
        journal('Switching to: ' + previousWindow.title);
        const previousWorkspace = previousWindow.get_workspace();
        previousWorkspace.activate_with_focus(previousWindow, global.get_current_time());
      } else {
        journal('No previous window');
      }
    } else {
      journal('Activating: ' + metaWindow.title);
      const workspace = metaWindow.get_workspace();
      workspace.activate_with_focus(metaWindow, global.get_current_time());
    }

    this.menu.close();
  }

  destroy() {
    journal('Destroying button');

    super.destroy();
  }
}

export default class NotificationThemeExtension extends Extension {
  enable() {
    setLogFn((msg, error = false) => {
      let level;
      if (error) {
        level = GLib.LogLevelFlags.LEVEL_CRITICAL;
      } else {
        level = GLib.LogLevelFlags.LEVEL_MESSAGE;
      }

      GLib.log_structured(
        'dash-windows-by-blueray453',
        level,
        {
          MESSAGE: `${msg}`,
          SYSLOG_IDENTIFIER: 'dash-windows-by-blueray453',
          CODE_FILE: GLib.filename_from_uri(import.meta.url)[0]
        }
      );
    });

    setLogging(true);

    // journalctl -f -o cat SYSLOG_IDENTIFIER=dash-windows-by-blueray453
    journal(`Enabled`);

    this._indicator = new WindowListButton();
    // Main.panel.addToStatusArea('window-list-menu', this._indicator);
    Main.panel.addToStatusArea('window-list-menu', this._indicator, 0, 'left');
    journal`Indicator added to panel`;

  }

  disable() {
    journal`Extension disabled`;
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }
}
