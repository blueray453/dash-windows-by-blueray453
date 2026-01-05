import GLib from 'gi://GLib';

import St from 'gi://St'
import Meta from 'gi://Meta'
import Clutter from 'gi://Clutter'
import Shell from 'gi://Shell'
import GObject from 'gi://GObject'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { setLogging, setLogFn, journal } from './utils.js';

const ICON_SIZE = 24;

class WindowListButton extends PanelMenu.Button {
  static {
    GObject.registerClass(this);
  }

  constructor() {
    super(0.0, 'Window List Menu');

    journal('Button initialized');

    this._windowTracker = Shell.WindowTracker.get_default();

    // Create icon for the panel button
    this._icon = new St.Icon({
      icon_name: 'view-list-symbolic',
      style_class: 'system-status-icon',
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
    this._workspaceChangedId = global.workspace_manager.connect(
      'active-workspace-changed',
      () => {
        if (this.menu.isOpen) {
          this._refreshWindowList();
        }
      }
    );

    // Connect to window changes
    this._windowAddedId = global.display.connect('window-created', () => {
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
    const workspace = global.workspace_manager.get_active_workspace();
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);

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
      const app = this._windowTracker.get_window_app(metaWindow);
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

      // Left click - activate window or switch to previous
      item.connect('activate', () => {
        journal('Window clicked: ' + title);
        this._onWindowActivate(metaWindow);
      });

      // Right click - close window
      item.actor.connect('button-press-event', (actor, event) => {
        if (event.get_button() === 3) {
          journal('Right click on window: ' + title);
          metaWindow.delete(global.get_current_time());
          this.menu.close();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
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
    const currentFocused = global.display.focus_window;

    // If clicking already focused window, switch to previous
    if (metaWindow === currentFocused) {
      journal('Window already focused, switching to previous');
      const workspace = global.workspace_manager.get_active_workspace();
      const previousWindow = global.display.get_tab_next(
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

    if (this._workspaceChangedId) {
      global.workspace_manager.disconnect(this._workspaceChangedId);
      this._workspaceChangedId = null;
    }

    if (this._windowAddedId) {
      global.display.disconnect(this._windowAddedId);
      this._windowAddedId = null;
    }

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
    Main.panel.addToStatusArea('window-list-menu', this._indicator);
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
